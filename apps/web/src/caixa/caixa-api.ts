const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA'
export type OrigemMovimentacao = 'LIQUIDACAO' | 'ESTORNO'
export type StatusTituloCaixa = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADO'

export interface CaixaResumo {
  id: string
  codigo: 'PRINCIPAL'
  saldoInicial: number
  iniciadoEm: string
  totalEntradas: number
  totalSaidas: number
  quantidadeMovimentacoes: number
  saldoAtual: number
}

export interface MovimentoCaixa {
  id: string
  tipo: TipoMovimentacao
  origem: OrigemMovimentacao
  valor: number
  data: string
  descricao: string
  titulo: { id: string; descricao: string; pessoa: string; status: StatusTituloCaixa } | null
  estornoDeId: string | null
  valorEstornado: number
  saldoEstornavel: number
  podeEstornar: boolean
}

export interface ListaMovimentosCaixa {
  items: MovimentoCaixa[]
  total: number
  page: number
  pageSize: number
}

export interface FiltrosMovimentosCaixa {
  tipo?: TipoMovimentacao
  dataInicio?: string
  dataFim?: string
  page?: number
  pageSize?: number
}

export class CaixaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'CaixaApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new CaixaApiError('Não foi possível conectar à API Financeira.')
  }

  const rawBody = await response.text()
  let body: unknown = null
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      throw new CaixaApiError('A API Financeira retornou uma resposta inválida.', response.status)
    }
  }

  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : response.status === 401
          ? 'Sua sessão expirou. Entre novamente.'
          : response.status === 403
            ? 'Seu usuário não tem permissão para acessar o Caixa.'
            : 'Não foi possível concluir a operação no Caixa.'
    throw new CaixaApiError(message, response.status)
  }
  return body
}

function parseResumo(value: unknown): CaixaResumo | null {
  if (!isRecord(value) || !('caixa' in value)) throw new CaixaApiError('A API retornou um saldo inválido.')
  if (value.caixa === null) return null
  const caixa = value.caixa
  if (
    !isRecord(caixa) ||
    caixa.codigo !== 'PRINCIPAL' ||
    typeof caixa.id !== 'string' ||
    typeof caixa.saldoInicial !== 'number' ||
    typeof caixa.iniciadoEm !== 'string' ||
    typeof caixa.totalEntradas !== 'number' ||
    typeof caixa.totalSaidas !== 'number' ||
    typeof caixa.quantidadeMovimentacoes !== 'number' ||
    typeof caixa.saldoAtual !== 'number'
  ) {
    throw new CaixaApiError('A API retornou um saldo em formato inválido.')
  }
  return caixa as unknown as CaixaResumo
}

function parseMovimento(value: unknown): MovimentoCaixa {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.tipo !== 'ENTRADA' && value.tipo !== 'SAIDA') ||
    (value.origem !== 'LIQUIDACAO' && value.origem !== 'ESTORNO') ||
    typeof value.valor !== 'number' ||
    typeof value.data !== 'string' ||
    typeof value.descricao !== 'string' ||
    !(value.titulo === null || isRecord(value.titulo)) ||
    !(value.estornoDeId === null || typeof value.estornoDeId === 'string') ||
    typeof value.valorEstornado !== 'number' ||
    typeof value.saldoEstornavel !== 'number' ||
    typeof value.podeEstornar !== 'boolean'
  ) {
    throw new CaixaApiError('A API retornou uma movimentação em formato inválido.')
  }
  if (value.titulo !== null) {
    const titulo = value.titulo
    if (
      typeof titulo.id !== 'string' ||
      typeof titulo.descricao !== 'string' ||
      typeof titulo.pessoa !== 'string' ||
      !['PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO'].includes(String(titulo.status))
    ) {
      throw new CaixaApiError('A API retornou um título relacionado em formato inválido.')
    }
  }
  return value as unknown as MovimentoCaixa
}

function parseLista(value: unknown): ListaMovimentosCaixa {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    typeof value.total !== 'number' ||
    typeof value.page !== 'number' ||
    typeof value.pageSize !== 'number'
  ) {
    throw new CaixaApiError('A API retornou uma lista de movimentações em formato inválido.')
  }
  return {
    items: value.items.map(parseMovimento),
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
  }
}

export async function consultarCaixa() {
  return parseResumo(await request(`${apiBaseUrl}/caixa`))
}

export async function informarSaldoInicial(saldoInicial: number) {
  return parseResumo(
    await request(`${apiBaseUrl}/caixa/abertura`, {
      method: 'POST',
      body: JSON.stringify({ saldoInicial }),
    })
  )
}

export async function listarMovimentacoes(filtros: FiltrosMovimentosCaixa = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries({ page: 1, pageSize: 20, ...filtros })) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return parseLista(await request(`${apiBaseUrl}/caixa/movimentacoes?${query.toString()}`))
}

export async function estornarMovimentacao(id: string, valor: number) {
  return parseMovimento(
    await request(`${apiBaseUrl}/caixa/movimentacoes/${encodeURIComponent(id)}/estornos`, {
      method: 'POST',
      body: JSON.stringify({ valor }),
    })
  )
}
