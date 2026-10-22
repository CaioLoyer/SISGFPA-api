const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export type TipoRelatorio = 'PAGAR' | 'RECEBER'
export type StatusRelatorio = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADO'

export interface ItemRelatorio {
  id: string
  descricao: string
  contraparte: string
  categoria: string | null
  valor: number
  liquidado: number
  dataVencimento: string
  status: StatusRelatorio
}

export interface ResumoRelatorio {
  total: number
  liquidado: number
  pendente: number
  itens: ItemRelatorio[]
}

export interface FiltroRelatorio {
  dataInicio?: string
  dataFim?: string
}

export class RelatoriosApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'RelatoriosApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function fetchResponse(url: string): Promise<Response> {
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = null
      }
      const message =
        isRecord(body) && typeof body.error === 'string'
          ? body.error
          : response.status === 401
            ? 'Sua sessão expirou. Entre novamente.'
            : response.status === 403
              ? 'Somente ADMIN pode consultar relatórios financeiros.'
              : 'Não foi possível carregar o relatório.'
      throw new RelatoriosApiError(message, response.status)
    }
    return response
  } catch (error) {
    if (error instanceof RelatoriosApiError) throw error
    throw new RelatoriosApiError('Não foi possível conectar à API Financeira.')
  }
}

function urlRelatorio(tipo: TipoRelatorio, filtro: FiltroRelatorio, formato: 'json' | 'csv') {
  const params = new URLSearchParams({ formato })
  if (filtro.dataInicio) params.set('dataInicio', filtro.dataInicio)
  if (filtro.dataFim) params.set('dataFim', filtro.dataFim)
  const rota = tipo === 'PAGAR' ? 'contas-a-pagar' : 'contas-a-receber'
  return `${apiBaseUrl}/relatorios/${rota}?${params.toString()}`
}

function parseItem(value: unknown, tipo: TipoRelatorio): ItemRelatorio {
  const campoPessoa = tipo === 'PAGAR' ? 'fornecedor' : 'cliente'
  const campoLiquidado = tipo === 'PAGAR' ? 'valorPago' : 'valorRecebido'
  const categoria = isRecord(value) ? value.categoria : undefined
  const campoCategoria = categoria === null ? null : isRecord(categoria) ? categoria.nome : undefined
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.descricao !== 'string' ||
    typeof value[campoPessoa] !== 'string' ||
    typeof value.valor !== 'number' ||
    typeof value[campoLiquidado] !== 'number' ||
    typeof value.dataVencimento !== 'string' ||
    (value.status !== 'PENDENTE' &&
      value.status !== 'PARCIAL' &&
      value.status !== 'PAGO' &&
      value.status !== 'CANCELADO') ||
    !(campoCategoria === null || typeof campoCategoria === 'string')
  ) {
    throw new RelatoriosApiError('A API Financeira retornou um item de relatório inválido.')
  }

  return {
    id: value.id,
    descricao: value.descricao,
    contraparte: value[campoPessoa],
    categoria: campoCategoria,
    valor: value.valor,
    liquidado: value[campoLiquidado],
    dataVencimento: value.dataVencimento,
    status: value.status,
  }
}

export async function consultarRelatorio(
  tipo: TipoRelatorio,
  filtro: FiltroRelatorio
): Promise<ResumoRelatorio> {
  const response = await fetchResponse(urlRelatorio(tipo, filtro, 'json'))
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new RelatoriosApiError('A API Financeira retornou uma resposta inválida.', response.status)
  }

  const campoTotal = tipo === 'PAGAR' ? 'totalAPagar' : 'totalAReceber'
  const campoLiquidado = tipo === 'PAGAR' ? 'totalPago' : 'totalRecebido'
  if (
    !isRecord(body) ||
    typeof body[campoTotal] !== 'number' ||
    typeof body[campoLiquidado] !== 'number' ||
    typeof body.totalPendente !== 'number' ||
    !Array.isArray(body.itens)
  ) {
    throw new RelatoriosApiError('A API Financeira retornou um resumo de relatório inválido.')
  }

  return {
    total: body[campoTotal],
    liquidado: body[campoLiquidado],
    pendente: body.totalPendente,
    itens: body.itens.map((item) => parseItem(item, tipo)),
  }
}

export async function baixarRelatorioCsv(tipo: TipoRelatorio, filtro: FiltroRelatorio): Promise<string> {
  const response = await fetchResponse(urlRelatorio(tipo, filtro, 'csv'))
  try {
    return await response.text()
  } catch {
    throw new RelatoriosApiError('Não foi possível ler o arquivo CSV.', response.status)
  }
}
