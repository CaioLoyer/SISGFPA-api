import { ForbiddenError, UnauthorizedError } from '@sisgfpa/http'
import type { FastifyRequest } from 'fastify'
import { permissoesDaRequisicao, requireModulePermission } from './module-permissions.js'

export type FinancialModulePermission = 'despesas' | 'recebimentos'
export type ContatoPapelPermitido = 'CLIENTE' | 'FORNECEDOR'

async function funcionarioPode(
  request: FastifyRequest,
  permissoes: FinancialModulePermission[],
  exigirTodas = false
) {
  if (!request.user) throw new UnauthorizedError()
  const configuracao = await permissoesDaRequisicao(request)
  const verifica = (permissao: FinancialModulePermission) => configuracao[permissao]
  return exigirTodas ? permissoes.every(verifica) : permissoes.some(verifica)
}

export async function papeisContatoPermitidos(request: FastifyRequest): Promise<ContatoPapelPermitido[]> {
  if (!request.user) throw new UnauthorizedError()
  const { comercial } = await permissoesDaRequisicao(request)
  return comercial ? ['CLIENTE', 'FORNECEDOR'] : []
}

export async function exigirPapeisContato(request: FastifyRequest, papeis: ContatoPapelPermitido[]) {
  await requireModulePermission('comercial')(request)
  const permitidos = await papeisContatoPermitidos(request)
  if (!papeis.every((papel) => permitidos.includes(papel))) {
    throw new ForbiddenError('Seu usuário não tem permissão para acessar este tipo de contato')
  }
}

export function requireFinancialPermission(permissao: FinancialModulePermission) {
  return requireModulePermission(permissao)
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
