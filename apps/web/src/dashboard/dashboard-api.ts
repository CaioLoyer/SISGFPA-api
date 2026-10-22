const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export interface FiltroDashboard {
  dataInicio: string
  dataFim: string
}

export interface ResumoDashboard {
  periodo: FiltroDashboard
  contasAPagar: { total: number; pago: number; pendente: number }
  contasAReceber: { total: number; recebido: number; pendente: number }
  caixa: { configurado: boolean; entradas: number; saidas: number; saldoLiquido: number }
}

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'DashboardApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMetrics(value: unknown, keys: string[]): value is Record<string, number> {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
}

export async function consultarResumoDashboard(filtro: FiltroDashboard): Promise<ResumoDashboard> {
  const params = new URLSearchParams({ dataInicio: filtro.dataInicio, dataFim: filtro.dataFim })
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/dashboard/resumo?${params}`, { credentials: 'include' })
  } catch {
    throw new DashboardApiError('Não foi possível conectar à API Financeira.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DashboardApiError('A API Financeira retornou uma resposta inválida.', response.status)
  }

  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : response.status === 401
          ? 'Sua sessão expirou. Entre novamente.'
          : response.status === 403
            ? 'Somente ADMIN pode consultar o resumo financeiro.'
            : 'Não foi possível carregar o resumo financeiro.'
    throw new DashboardApiError(message, response.status)
  }

  if (
    !isRecord(body) ||
    !isRecord(body.periodo) ||
    typeof body.periodo.dataInicio !== 'string' ||
    typeof body.periodo.dataFim !== 'string' ||
    !isMetrics(body.contasAPagar, ['total', 'pago', 'pendente']) ||
    !isMetrics(body.contasAReceber, ['total', 'recebido', 'pendente']) ||
    !isRecord(body.caixa) ||
    typeof body.caixa.configurado !== 'boolean' ||
    typeof body.caixa.entradas !== 'number' ||
    typeof body.caixa.saidas !== 'number' ||
    typeof body.caixa.saldoLiquido !== 'number'
  ) {
    throw new DashboardApiError('A API Financeira retornou um resumo em formato inválido.')
  }

  return body as unknown as ResumoDashboard
}
