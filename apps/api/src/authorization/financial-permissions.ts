import { prisma } from '@sisgfpa/database'
import { ForbiddenError, UnauthorizedError } from '@sisgfpa/http'
import type { FastifyRequest } from 'fastify'

export type FinancialModulePermission = 'despesas' | 'recebimentos'
export type ContatoPapelPermitido = 'CLIENTE' | 'FORNECEDOR'

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

export async function papeisContatoPermitidos(request: FastifyRequest): Promise<ContatoPapelPermitido[]> {
  if (!request.user) throw new UnauthorizedError()
  if (request.user.role === 'ADMIN') return ['CLIENTE', 'FORNECEDOR']

  const configuracao = await prisma.funcionarioPermissao.findUnique({
    where: { funcionarioId: request.user.id },
    select: { despesas: true, recebimentos: true },
  })
  const despesas = configuracao?.despesas ?? true
  const recebimentos = configuracao?.recebimentos ?? true
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
