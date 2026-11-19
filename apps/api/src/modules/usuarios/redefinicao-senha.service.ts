import { createHmac, timingSafeEqual } from 'node:crypto'

import { auth, fromNodeHeaders } from '@sisgfpa/auth'
import { prisma } from '@sisgfpa/database'
import { BusinessRuleError, ConflictError, NotFoundError, UnauthorizedError } from '@sisgfpa/http'
import type { StatusSolicitacaoRedefinicaoSenha } from '@sisgfpa/database'
import type { FastifyRequest } from 'fastify'

const requestLifetimeMs = 24 * 60 * 60 * 1000
const approvalLifetimeMs = 10 * 60 * 1000
const requestLimitPerDay = 3
const activeStatuses: StatusSolicitacaoRedefinicaoSenha[] = ['PENDENTE', 'APROVADA']

type Headers = FastifyRequest['headers']
type Decision = 'APROVAR' | 'RECUSAR'

function getGrantSecret() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET é necessária para autorizar a redefinição de senha.')
  return secret
}

async function getSession(headers: Headers) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
  if (!session) throw new UnauthorizedError()
  return session
}

function createGrantToken(input: {
  id: string
  requesterId: string
  requesterSessionId: string
  expiresAt: Date
}) {
  const payload = JSON.stringify([
    input.id,
    input.requesterId,
    input.requesterSessionId,
    input.expiresAt.toISOString(),
  ])
  return createHmac('sha256', getGrantSecret())
    .update('sisgfpa:approved-password-reset:v1:')
    .update(payload)
    .digest('base64url')
}

function grantMatches(received: string, expected: string) {
  const receivedBytes = Buffer.from(received)
  const expectedBytes = Buffer.from(expected)
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
}

/** Registra um pedido autenticado e evita duplicidade e excesso de solicitações. */
export async function solicitarRedefinicaoSenha(headers: Headers) {
  const session = await getSession(headers)

  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${session.user.id} FOR UPDATE`
    const now = new Date()
    await tx.passwordResetRequest.updateMany({
      where: {
        requesterId: session.user.id,
        status: { in: activeStatuses },
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRADA' },
    })

    const activeRequest = await tx.passwordResetRequest.findFirst({
      where: { requesterId: session.user.id, status: { in: activeStatuses } },
      select: { id: true },
    })
    if (activeRequest) {
      throw new ConflictError(
        'SOLICITACAO_REDEFINICAO_ATIVA',
        'Você já possui uma solicitação aguardando conclusão.'
      )
    }

    const recentRequests = await tx.passwordResetRequest.count({
      where: {
        requesterId: session.user.id,
        requestedAt: { gte: new Date(now.getTime() - requestLifetimeMs) },
      },
    })
    if (recentRequests >= requestLimitPerDay) {
      throw new ConflictError('LIMITE_SOLICITACOES_REDEFINICAO', 'Limite diário de solicitações atingido.')
    }

    return tx.passwordResetRequest.create({
      data: {
        requesterId: session.user.id,
        requesterSessionId: session.session.id,
        status: 'PENDENTE',
        requestedAt: now,
        expiresAt: new Date(now.getTime() + requestLifetimeMs),
      },
      select: { id: true, status: true, requestedAt: true, expiresAt: true },
    })
  })
  return {
    ...request,
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    grantToken: null,
  }
}

/** Consulta o pedido mais recente; a autorização só é emitida para a sessão que pediu a redefinição. */
export async function consultarMinhaRedefinicaoSenha(headers: Headers) {
  const session = await getSession(headers)
  let request = await prisma.passwordResetRequest.findFirst({
    where: { requesterId: session.user.id },
    orderBy: { requestedAt: 'desc' },
  })
  if (!request) return null

  const now = new Date()
  const sessionChanged =
    activeStatuses.includes(request.status) && request.requesterSessionId !== session.session.id
  if (activeStatuses.includes(request.status) && (request.expiresAt <= now || sessionChanged)) {
    request = await prisma.passwordResetRequest.update({
      where: { id: request.id },
      data: { status: 'EXPIRADA' },
    })
  }

  const grantToken =
    request.status === 'APROVADA'
      ? createGrantToken({
          id: request.id,
          requesterId: request.requesterId,
          requesterSessionId: request.requesterSessionId,
          expiresAt: request.expiresAt,
        })
      : null

  return {
    id: request.id,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    grantToken,
  }
}

/** Lista apenas pedidos pendentes e não expirados para análise administrativa. */
export async function listarSolicitacoesRedefinicaoSenha() {
  const now = new Date()
  await prisma.passwordResetRequest.updateMany({
    where: { status: 'PENDENTE', expiresAt: { lte: now } },
    data: { status: 'EXPIRADA' },
  })
  const requests = await prisma.passwordResetRequest.findMany({
    where: { status: 'PENDENTE', expiresAt: { gt: now } },
    include: { requester: { select: { id: true, name: true, email: true } } },
    orderBy: { requestedAt: 'asc' },
  })
  return {
    items: requests.map((request) => ({
      id: request.id,
      requesterId: request.requester.id,
      requesterName: request.requester.name,
      requesterEmail: request.requester.email,
      requestedAt: request.requestedAt.toISOString(),
    })),
  }
}

/** Decide uma solicitação pendente; um ADMIN nunca pode aprovar a própria senha. */
export async function decidirSolicitacaoRedefinicaoSenha(id: string, adminId: string, decision: Decision) {
  const outcome = await prisma.$transaction(async (tx) => {
    const request = await tx.passwordResetRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundError('Solicitação de redefinição não encontrada.')
    if (request.status !== 'PENDENTE') {
      throw new ConflictError('SOLICITACAO_JA_DECIDIDA', 'Esta solicitação não está mais pendente.')
    }
    const now = new Date()
    if (request.expiresAt <= now) {
      await tx.passwordResetRequest.update({ where: { id }, data: { status: 'EXPIRADA' } })
      return { expired: true as const }
    }
    if (decision === 'APROVAR' && request.requesterId === adminId) {
      throw new BusinessRuleError(
        'AUTOAPROVACAO_NAO_PERMITIDA',
        'Não é permitido aprovar a própria redefinição de senha.'
      )
    }

    const changed = await tx.passwordResetRequest.updateMany({
      where: { id, status: 'PENDENTE', expiresAt: { gt: now } },
      data: {
        status: decision === 'APROVAR' ? 'APROVADA' : 'RECUSADA',
        decidedById: adminId,
        decidedAt: now,
        ...(decision === 'APROVAR' ? { expiresAt: new Date(now.getTime() + approvalLifetimeMs) } : {}),
      },
    })
    if (changed.count !== 1) {
      throw new ConflictError('SOLICITACAO_JA_DECIDIDA', 'Esta solicitação não está mais pendente.')
    }
    const updated = await tx.passwordResetRequest.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, requestedAt: true, expiresAt: true },
    })
    return {
      expired: false as const,
      ...updated,
      requestedAt: updated.requestedAt.toISOString(),
      expiresAt: updated.expiresAt.toISOString(),
    }
  })
  if (outcome.expired) throw new ConflictError('SOLICITACAO_EXPIRADA', 'Esta solicitação expirou.')
  return {
    id: outcome.id,
    status: outcome.status,
    requestedAt: outcome.requestedAt,
    expiresAt: outcome.expiresAt,
  }
}

/** Consome uma aprovação e delega hash, persistência da credencial e revogação ao Better Auth. */
export async function concluirRedefinicaoSenha(
  headers: Headers,
  input: { grantToken: string; newPassword: string }
) {
  const session = await getSession(headers)
  const request = await prisma.passwordResetRequest.findFirst({
    where: {
      requesterId: session.user.id,
      requesterSessionId: session.session.id,
      status: 'APROVADA',
      expiresAt: { gt: new Date() },
    },
    orderBy: { requestedAt: 'desc' },
  })
  if (!request)
    throw new BusinessRuleError(
      'AUTORIZACAO_REDEFINICAO_INVALIDA',
      'A autorização expirou ou não está disponível.'
    )

  const expectedGrant = createGrantToken({
    id: request.id,
    requesterId: request.requesterId,
    requesterSessionId: request.requesterSessionId,
    expiresAt: request.expiresAt,
  })
  if (!grantMatches(input.grantToken, expectedGrant)) {
    throw new BusinessRuleError(
      'AUTORIZACAO_REDEFINICAO_INVALIDA',
      'A autorização expirou ou não está disponível.'
    )
  }

  const consumedAt = new Date()
  const claimed = await prisma.passwordResetRequest.updateMany({
    where: {
      id: request.id,
      requesterId: session.user.id,
      requesterSessionId: session.session.id,
      status: 'APROVADA',
      expiresAt: { gt: consumedAt },
    },
    data: { status: 'CONSUMIDA', consumedAt },
  })
  if (claimed.count !== 1) {
    throw new ConflictError('AUTORIZACAO_REDEFINICAO_CONSUMIDA', 'Esta autorização já foi utilizada.')
  }

  const context = await auth.$context
  const verificationIdentifier = `reset-password:${input.grantToken}`
  try {
    await context.internalAdapter.createVerificationValue({
      identifier: verificationIdentifier,
      value: session.user.id,
      expiresAt: request.expiresAt,
    })
    const result = await auth.api.resetPassword({
      body: { token: input.grantToken, newPassword: input.newPassword },
    })
    if (result.status !== true) throw new Error('O Better Auth não confirmou a redefinição de senha.')
    return { success: true as const }
  } catch {
    await context.internalAdapter
      .deleteVerificationByIdentifier(verificationIdentifier)
      .catch(() => undefined)
    await prisma.passwordResetRequest.updateMany({
      where: { id: request.id, status: 'CONSUMIDA', consumedAt },
      data: { status: 'APROVADA', consumedAt: null },
    })
    throw new BusinessRuleError(
      'REDEFINICAO_SENHA_NAO_CONCLUIDA',
      'Não foi possível concluir a redefinição. Tente novamente.'
    )
  }
}
