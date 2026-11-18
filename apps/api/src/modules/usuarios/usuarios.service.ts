import { auth, fromNodeHeaders } from '@sisgfpa/auth'
import { prisma } from '@sisgfpa/database'
import { BusinessRuleError, ConflictError, NotFoundError } from '@sisgfpa/http'
import { employeePermissions } from '@sisgfpa/types'
import type { CreateFuncionarioBodySchema } from '@sisgfpa/validation'
import type { FastifyRequest } from 'fastify'
import type { z } from 'zod'

type CreateFuncionarioInput = z.infer<typeof CreateFuncionarioBodySchema>

/** Cria a credencial pelo Better Auth; o papel não é derivado de dados enviados pelo cliente. */
export async function criarFuncionario(input: CreateFuncionarioInput, headers: FastifyRequest['headers']) {
  const email = input.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ConflictError('USER_ALREADY_EXISTS', 'Já existe uma conta com este e-mail')

  const { user } = await auth.api.createUser({
    headers: fromNodeHeaders(headers),
    body: {
      name: input.name,
      email,
      password: input.password,
      role: 'FUNCIONARIO',
    },
  })

  return { id: user.id, name: user.name, email: user.email, role: 'FUNCIONARIO' as const }
}

/** Lista contas da equipe via Better Auth e inclui permissões apenas para FUNCIONARIO. */
export async function listarContasAdministrativas(headers: FastifyRequest['headers']) {
  const users: Awaited<ReturnType<typeof auth.api.listUsers>>['users'] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY

  while (offset < total) {
    const page = await auth.api.listUsers({
      headers: fromNodeHeaders(headers),
      query: { limit: 100, offset, sortBy: 'name', sortDirection: 'asc' },
    })
    users.push(...page.users)
    total = page.total
    if (page.users.length === 0) break
    offset += page.users.length
  }

  const employeeIds = users.filter((user) => user.role === 'FUNCIONARIO').map((user) => user.id)
  const configs = employeeIds.length
    ? await prisma.funcionarioPermissao.findMany({
        where: { funcionarioId: { in: employeeIds } },
        select: {
          funcionarioId: true,
          comercial: true,
          despesas: true,
          recebimentos: true,
          relatorios: true,
        },
      })
    : []
  const permissionsByUser = new Map(
    configs.map(({ funcionarioId, ...permissions }) => [funcionarioId, permissions])
  )

  return {
    items: users.map((user) => {
      const common = {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      }
      if (user.role === 'ADMIN') return { ...common, role: 'ADMIN' as const }
      return {
        ...common,
        role: 'FUNCIONARIO' as const,
        permissoes: employeePermissions(permissionsByUser.get(user.id)),
      }
    }),
  }
}

/** Promove um funcionário por meio do endpoint interno do Better Auth e registra a decisão. */
export async function promoverFuncionario(
  funcionarioId: string,
  alteradoPorId: string,
  headers: FastifyRequest['headers']
) {
  if (funcionarioId === alteradoPorId) {
    throw new BusinessRuleError('AUTOPROMOCAO_NAO_PERMITIDA', 'Não é permitido alterar o próprio papel')
  }

  const funcionario = await prisma.user.findUnique({
    where: { id: funcionarioId },
    select: { id: true, role: true },
  })
  if (!funcionario || funcionario.role !== 'FUNCIONARIO')
    throw new NotFoundError('Funcionário não encontrado')

  const { user } = await auth.api.setRole({
    headers: fromNodeHeaders(headers),
    body: { userId: funcionarioId, role: 'ADMIN' },
  })
  if (user.role !== 'ADMIN') throw new Error('O Better Auth não confirmou a promoção para ADMIN')

  await prisma.usuarioPapelHistorico.create({
    data: {
      usuarioId: funcionarioId,
      alteradoPorId,
      papelAnterior: 'FUNCIONARIO',
      papelNovo: 'ADMIN',
    },
  })

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    role: 'ADMIN' as const,
  }
}
