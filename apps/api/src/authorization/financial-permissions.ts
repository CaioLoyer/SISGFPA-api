import { prisma } from '@sisgfpa/database'
import { ForbiddenError, UnauthorizedError } from '@sisgfpa/http'
import type { FastifyRequest } from 'fastify'
import type { AuthenticatedUser } from '@sisgfpa/auth'

export type FinancialModulePermission = 'despesas' | 'recebimentos'
export type ContatoPapelPermitido = 'CLIENTE' | 'FORNECEDOR'

export async function consultarPermissoesFinanceiras(user: AuthenticatedUser) {
  if (user.role === 'ADMIN') return { despesas: true, recebimentos: true }
  const configuracao = await prisma.funcionarioPermissao.findUnique({
    where: { funcionarioId: user.id },
    select: { despesas: true, recebimentos: true },
  })
  return {
    despesas: configuracao?.despesas ?? true,
    recebimentos: configuracao?.recebimentos ?? true,
  }
}

async function funcionarioPode(
  request: FastifyRequest,
  permissoes: FinancialModulePermission[],
  exigirTodas = false
) {
  if (!request.user) throw new UnauthorizedError()
  const configuracao = await consultarPermissoesFinanceiras(request.user)
  const verifica = (permissao: FinancialModulePermission) => configuracao[permissao]
  return exigirTodas ? permissoes.every(verifica) : permissoes.some(verifica)
}

export async function papeisContatoPermitidos(request: FastifyRequest): Promise<ContatoPapelPermitido[]> {
  if (!request.user) throw new UnauthorizedError()
  const { despesas, recebimentos } = await consultarPermissoesFinanceiras(request.user)
  const papeis: ContatoPapelPermitido[] = []
  if (recebimentos) papeis.push('CLIENTE')
  if (despesas) papeis.push('FORNECEDOR')
  return papeis
}

export async function exigirPapeisContato(request: FastifyRequest, papeis: ContatoPapelPermitido[]) {
  const permitidos = await papeisContatoPermitidos(request)
  if (!papeis.every((papel) => permitidos.includes(papel))) {
    throw new ForbiddenError('Seu usuário não tem permissão para acessar este tipo de contato')
  }
}

export function requireFinancialPermission(permissao: FinancialModulePermission) {
  return async (request: FastifyRequest) => {
    if (!(await funcionarioPode(request, [permissao]))) {
      throw new ForbiddenError('Seu usuário não tem acesso a este módulo financeiro')
    }
  }
}

export async function requireAnyFinancialPermission(request: FastifyRequest) {
  const tipo = (request.query as { tipo?: string }).tipo
  const permissoes: FinancialModulePermission[] =
    tipo === 'DESPESA'
      ? ['despesas']
      : tipo === 'RECEBIMENTO'
        ? ['recebimentos']
        : ['despesas', 'recebimentos']

  if (!(await funcionarioPode(request, permissoes, tipo === undefined))) {
    throw new ForbiddenError('Seu usuário não tem acesso a este módulo financeiro')
  }
}
