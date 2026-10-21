import { prisma } from '@sisgfpa/database'
import { ForbiddenError, UnauthorizedError } from '@sisgfpa/http'
import type { FastifyRequest } from 'fastify'

export type FinancialModulePermission = 'despesas' | 'recebimentos'

async function funcionarioPode(
  request: FastifyRequest,
  permissoes: FinancialModulePermission[],
  exigirTodas = false
) {
  if (!request.user) throw new UnauthorizedError()
  if (request.user.role === 'ADMIN') return true

  const configuracao = await prisma.funcionarioPermissao.findUnique({
    where: { funcionarioId: request.user.id },
    select: { despesas: true, recebimentos: true },
  })

  // Ausência de configuração preserva o acesso atual dos FUNCIONARIO.
  const verifica = (permissao: FinancialModulePermission) => configuracao?.[permissao] ?? true
  return exigirTodas ? permissoes.every(verifica) : permissoes.some(verifica)
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
