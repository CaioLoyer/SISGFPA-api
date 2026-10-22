export type FinanceiroTipo = 'DESPESA' | 'RECEBIMENTO'
export type StatusTitulo = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADO'

export interface CategoriaFinanceira {
  id: string
  nome: string
  tipo: FinanceiroTipo
}

export interface TituloFinanceiro {
  id: string
  descricao: string
  pessoa: string
  contatoId: string | null
  valor: number
  valorLiquidado: number
  dataLancamento: string
  dataVencimento: string
  numeroParcelas: number
  observacoes: string | null
  categoria: Pick<CategoriaFinanceira, 'id' | 'nome'> | null
  status: StatusTitulo
  createdAt: string
  updatedAt: string
}

export interface ParcelaFinanceira {
  id: string
  numero: number
  valor: number
  valorLiquidado: number
  dataVencimento: string
  status: StatusTitulo
}

export interface EventoHistoricoFinanceiro {
  id: string
  acao: string
  statusAnterior: StatusTitulo | null
  statusNovo: StatusTitulo | null
  detalhes: string | null
  alteradoPorId: string
  createdAt: string
}

export interface LiquidacaoFinanceira {
  id: string
  valor: number
  data: string
  registradoPorId: string
}

export interface DetalheTituloFinanceiro extends TituloFinanceiro {
  parcelas: ParcelaFinanceira[]
  historico: EventoHistoricoFinanceiro[]
  liquidacoes: LiquidacaoFinanceira[]
}

export interface FiltrosTitulos {
  status?: StatusTitulo
  pessoa?: string
  categoriaId?: string
  dataInicio?: string
  dataFim?: string
  page?: number
  pageSize?: number
}

export interface EntradaTituloFinanceiro {
  descricao: string
  pessoa: string
  contatoId: string | null
  valor: number
  dataLancamento: string
  dataVencimento: string
  parcelas: number
  categoriaId: string | null
  observacoes: string
}

export interface ListaTitulosFinanceiros {
  items: TituloFinanceiro[]
  total: number
  page: number
  pageSize: number
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export class FinanceiroApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'FinanceiroApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStatus(value: unknown): value is StatusTitulo {
  return value === 'PENDENTE' || value === 'PARCIAL' || value === 'PAGO' || value === 'CANCELADO'
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
    throw new FinanceiroApiError('Não foi possível conectar à API Financeira.')
  }

  const rawBody = await response.text()
  let body: unknown = null
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      throw new FinanceiroApiError('A API Financeira retornou uma resposta inválida.', response.status)
    }
  }

  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : response.status === 401
          ? 'Sua sessão expirou. Entre novamente.'
          : response.status === 403
            ? 'Seu usuário não tem permissão para acessar este módulo.'
            : 'Não foi possível concluir a operação financeira.'
    throw new FinanceiroApiError(message, response.status)
  }

  return body
}

function parseTitulo(value: unknown, tipo: FinanceiroTipo): TituloFinanceiro {
  const campoPessoa = tipo === 'DESPESA' ? 'fornecedor' : 'cliente'
  const campoContato = tipo === 'DESPESA' ? 'fornecedorContatoId' : 'clienteContatoId'
  const campoLiquidado = tipo === 'DESPESA' ? 'valorPago' : 'valorRecebido'
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.descricao !== 'string' ||
    typeof value[campoPessoa] !== 'string' ||
    !(typeof value[campoContato] === 'string' || value[campoContato] === null) ||
    typeof value.valor !== 'number' ||
    typeof value[campoLiquidado] !== 'number' ||
    typeof value.dataLancamento !== 'string' ||
    typeof value.dataVencimento !== 'string' ||
    typeof value.numeroParcelas !== 'number' ||
    !(typeof value.observacoes === 'string' || value.observacoes === null) ||
    !isStatus(value.status) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new FinanceiroApiError('A API Financeira retornou um título em formato inválido.')
  }

  let categoria: TituloFinanceiro['categoria'] = null
  if (value.categoria !== null) {
    if (
      !isRecord(value.categoria) ||
      typeof value.categoria.id !== 'string' ||
      typeof value.categoria.nome !== 'string'
    ) {
      throw new FinanceiroApiError('A API Financeira retornou uma categoria em formato inválido.')
    }
    categoria = { id: value.categoria.id, nome: value.categoria.nome }
  }

  return {
    id: value.id,
    descricao: value.descricao,
    pessoa: value[campoPessoa],
    contatoId: value[campoContato],
    valor: value.valor,
    valorLiquidado: value[campoLiquidado],
    dataLancamento: value.dataLancamento,
    dataVencimento: value.dataVencimento,
    numeroParcelas: value.numeroParcelas,
    observacoes: value.observacoes,
    categoria,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function queryParams(input: FiltrosTitulos) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query.toString()
}

export async function listarTitulos(
  tipo: FinanceiroTipo,
  filtros: FiltrosTitulos = {}
): Promise<ListaTitulosFinanceiros> {
  const params = queryParams({ page: 1, pageSize: 20, ...filtros })
  const endpoint = tipo === 'DESPESA' ? 'despesas' : 'recebimentos'
  const campoPessoa = tipo === 'DESPESA' ? 'fornecedor' : 'cliente'
  const query = new URLSearchParams(params)
  const pessoa = query.get('pessoa')
  query.delete('pessoa')
  if (pessoa) query.set(campoPessoa, pessoa)

  const body = await request(`${apiBaseUrl}/${endpoint}?${query.toString()}`)
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    typeof body.total !== 'number' ||
    typeof body.page !== 'number' ||
    typeof body.pageSize !== 'number'
  ) {
    throw new FinanceiroApiError('A API Financeira retornou uma lista de títulos em formato inválido.')
  }
  return {
    items: body.items.map((item) => parseTitulo(item, tipo)),
    total: body.total,
    page: body.page,
    pageSize: body.pageSize,
  }
}

export async function listarCategorias(tipo: FinanceiroTipo): Promise<CategoriaFinanceira[]> {
  const body = await request(`${apiBaseUrl}/categorias?tipo=${tipo}`)
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new FinanceiroApiError('A API Financeira retornou as categorias em formato inválido.')
  }
  return body.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.nome !== 'string' ||
      (item.tipo !== 'DESPESA' && item.tipo !== 'RECEBIMENTO')
    ) {
      throw new FinanceiroApiError('A API Financeira retornou uma categoria em formato inválido.')
    }
    return { id: item.id, nome: item.nome, tipo: item.tipo }
  })
}

function parseParcela(value: unknown): ParcelaFinanceira {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.numero !== 'number' ||
    typeof value.valor !== 'number' ||
    typeof value.valorLiquidado !== 'number' ||
    typeof value.dataVencimento !== 'string' ||
    !isStatus(value.status)
  ) {
    throw new FinanceiroApiError('A API Financeira retornou uma parcela em formato inválido.')
  }
  return {
    id: value.id,
    numero: value.numero,
    valor: value.valor,
    valorLiquidado: value.valorLiquidado,
    dataVencimento: value.dataVencimento,
    status: value.status,
  }
}

export async function buscarTitulo(tipo: FinanceiroTipo, id: string): Promise<DetalheTituloFinanceiro> {
  const endpoint = tipo === 'DESPESA' ? 'despesas' : 'recebimentos'
  const body = await request(`${apiBaseUrl}/${endpoint}/${encodeURIComponent(id)}`)
  const titulo = parseTitulo(body, tipo)
  if (!isRecord(body) || !Array.isArray(body.parcelas) || !Array.isArray(body.historico)) {
    throw new FinanceiroApiError('A API Financeira retornou os detalhes do título em formato inválido.')
  }

  const campoLiquidacoes = tipo === 'DESPESA' ? 'pagamentos' : 'baixas'
  if (!Array.isArray(body[campoLiquidacoes])) {
    throw new FinanceiroApiError('A API Financeira retornou as liquidações em formato inválido.')
  }

  const liquidacoes = body[campoLiquidacoes].map((item): LiquidacaoFinanceira => {
    const campoData = tipo === 'DESPESA' ? 'pagoEm' : 'recebidoEm'
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.valor !== 'number' ||
      typeof item[campoData] !== 'string' ||
      typeof item.registradoPorId !== 'string'
    ) {
      throw new FinanceiroApiError('A API Financeira retornou uma liquidação em formato inválido.')
    }
    return {
      id: item.id,
      valor: item.valor,
      data: item[campoData],
      registradoPorId: item.registradoPorId,
    }
  })

  const historico = body.historico.map((item): EventoHistoricoFinanceiro => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.acao !== 'string' ||
      !(item.statusAnterior === null || isStatus(item.statusAnterior)) ||
      !(item.statusNovo === null || isStatus(item.statusNovo)) ||
      !(typeof item.detalhes === 'string' || item.detalhes === null) ||
      typeof item.alteradoPorId !== 'string' ||
      typeof item.createdAt !== 'string'
    ) {
      throw new FinanceiroApiError('A API Financeira retornou um evento de histórico em formato inválido.')
    }
    return {
      id: item.id,
      acao: item.acao,
      statusAnterior: item.statusAnterior,
      statusNovo: item.statusNovo,
      detalhes: item.detalhes,
      alteradoPorId: item.alteradoPorId,
      createdAt: item.createdAt,
    }
  })

  return {
    ...titulo,
    parcelas: body.parcelas.map(parseParcela),
    historico,
    liquidacoes,
  }
}

export async function criarTitulo(tipo: FinanceiroTipo, input: EntradaTituloFinanceiro) {
  const endpoint = tipo === 'DESPESA' ? 'despesas' : 'recebimentos'
  const body = {
    descricao: input.descricao,
    [tipo === 'DESPESA' ? 'fornecedor' : 'cliente']: input.pessoa,
    [tipo === 'DESPESA' ? 'fornecedorContatoId' : 'clienteContatoId']: input.contatoId || undefined,
    valor: input.valor,
    dataLancamento: input.dataLancamento,
    dataVencimento: input.dataVencimento,
    parcelas: input.parcelas,
    categoriaId: input.categoriaId || undefined,
    observacoes: input.observacoes || undefined,
    liquidarNoAto: false,
  }
  return parseTitulo(
    await request(`${apiBaseUrl}/${endpoint}`, { method: 'POST', body: JSON.stringify(body) }),
    tipo
  )
}

export async function atualizarTitulo(tipo: FinanceiroTipo, id: string, input: EntradaTituloFinanceiro) {
  const endpoint = tipo === 'DESPESA' ? 'despesas' : 'recebimentos'
  const body = {
    descricao: input.descricao,
    [tipo === 'DESPESA' ? 'fornecedor' : 'cliente']: input.pessoa,
    [tipo === 'DESPESA' ? 'fornecedorContatoId' : 'clienteContatoId']: input.contatoId,
    valor: input.valor,
    dataVencimento: input.dataVencimento,
    categoriaId: input.categoriaId,
    observacoes: input.observacoes || null,
  }
  return parseTitulo(
    await request(`${apiBaseUrl}/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    tipo
  )
}

export async function cancelarTitulo(tipo: FinanceiroTipo, id: string) {
  const endpoint = tipo === 'DESPESA' ? 'despesas' : 'recebimentos'
  return parseTitulo(
    await request(`${apiBaseUrl}/${endpoint}/${encodeURIComponent(id)}/cancelar`, { method: 'POST' }),
    tipo
  )
}
