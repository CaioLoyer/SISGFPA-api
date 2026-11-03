import type { DashboardOverview } from '@sisgfpa/types'

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'DashboardApiError'
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nullableNumber = (value: unknown) => value === null || number(value)
const nullableString = (value: unknown) => value === null || typeof value === 'string'
const month = (value: unknown) => typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)
const metric = (value: unknown) =>
  record(value) && nullableNumber(value.valor) && nullableNumber(value.variacaoPercentual)

function isOverview(body: unknown): body is DashboardOverview {
  if (!record(body)) return false
  const { permissoes, indicadores, resumo } = body
  return (
    month(body.mes) &&
    record(permissoes) &&
    ['despesas', 'recebimentos', 'caixa', 'relatorios'].every(
      (key) => typeof permissoes[key] === 'boolean'
    ) &&
    (body.caixaConfigurado === null || typeof body.caixaConfigurado === 'boolean') &&
    record(indicadores) &&
    ['entradas', 'saidas', 'resultado', 'ticketMedio'].every((key) => metric(indicadores[key])) &&
    Array.isArray(body.serieMensal) &&
    body.serieMensal.every(
      (point) =>
        record(point) &&
        month(point.mes) &&
        number(point.entradas) &&
        point.entradas >= 0 &&
        number(point.saidas) &&
        point.saidas >= 0
    ) &&
    Array.isArray(body.saidasPorCategoria) &&
    body.saidasPorCategoria.every(
      (point) => record(point) && typeof point.nome === 'string' && number(point.valor) && point.valor > 0
    ) &&
    Array.isArray(body.ultimasMovimentacoes) &&
    body.ultimasMovimentacoes.every(
      (item) =>
        record(item) &&
        typeof item.id === 'string' &&
        typeof item.descricao === 'string' &&
        typeof item.data === 'string' &&
        Number.isFinite(Date.parse(item.data)) &&
        nullableString(item.categoria) &&
        number(item.valor) &&
        item.valor > 0 &&
        ['ENTRADA', 'SAIDA'].includes(String(item.tipo)) &&
        ['LIQUIDACAO', 'ESTORNO'].includes(String(item.origem)) &&
        nullableString(item.tituloId) &&
        (item.tipoTitulo === null || ['DESPESA', 'RECEBIMENTO'].includes(String(item.tipoTitulo)))
    ) &&
    record(resumo) &&
    ['saldoAtual', 'aPagar', 'aReceber'].every((key) => nullableNumber(resumo[key]))
  )
}

export async function consultarVisaoGeral(mes: string, signal?: AbortSignal): Promise<DashboardOverview> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/dashboard/visao-geral?${new URLSearchParams({ mes })}`, {
      credentials: 'include',
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new DashboardApiError('Não foi possível conectar à API Financeira.')
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DashboardApiError('A API Financeira retornou uma resposta inválida.', response.status)
  }
  if (!response.ok) {
    throw new DashboardApiError(
      response.status === 401
        ? 'Sua sessão expirou. Entre novamente.'
        : response.status === 403
          ? 'Sua conta não tem acesso a estes dados financeiros.'
          : record(body) && typeof body.error === 'string'
            ? body.error
            : 'Não foi possível carregar a dashboard.',
      response.status
    )
  }
  if (!isOverview(body) || body.mes !== mes)
    throw new DashboardApiError('A API Financeira retornou uma dashboard em formato inválido.')
  return body
}
