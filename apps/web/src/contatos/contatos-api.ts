import type { PapelContato, TipoPessoa } from '@sisgfpa/types'

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export type SituacaoContato = 'ATIVOS' | 'INATIVOS' | 'TODOS'
export type TipoTituloContato = 'DESPESA' | 'RECEBIMENTO'

export interface Contato {
  id: string
  codigo: number
  nome: string
  documento: string
  tipoPessoa: TipoPessoa
  papeis: PapelContato[]
  telefone: string
  cidade: string | null
  uf: string | null
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export interface ContatoInput {
  nome: string
  documento: string
  tipoPessoa: TipoPessoa
  papeis: PapelContato[]
  telefone: string
  cidade?: string | null
  uf?: string | null
}

export interface ListaContatos {
  items: Contato[]
  total: number
  page: number
  pageSize: number
  papeisPermitidos: PapelContato[]
}

export interface TituloSemContato {
  id: string
  descricao: string
  nomeOriginal: string
  valor: number
  dataVencimento: string
  status: 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'CANCELADO'
}

export class ContatosApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'ContatosApiError'
  }
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
    throw new ContatosApiError('Não foi possível conectar à API Financeira.')
  }

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw new ContatosApiError('A API Financeira retornou uma resposta inválida.', response.status)
    }
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : response.status === 401
          ? 'Sua sessão expirou. Entre novamente.'
          : 'Não foi possível concluir a operação com contatos.'
    throw new ContatosApiError(message, response.status)
  }
  return body
}

function isContato(value: unknown): value is Contato {
  if (typeof value !== 'object' || value === null) return false
  return (
    'id' in value &&
    'codigo' in value &&
    'nome' in value &&
    'documento' in value &&
    'tipoPessoa' in value &&
    'papeis' in value &&
    'telefone' in value &&
    'cidade' in value &&
    'uf' in value &&
    'ativo' in value &&
    'createdAt' in value &&
    'updatedAt' in value &&
    typeof value.id === 'string' &&
    typeof value.codigo === 'number' &&
    typeof value.nome === 'string' &&
    typeof value.documento === 'string' &&
    (value.tipoPessoa === 'FISICA' || value.tipoPessoa === 'JURIDICA') &&
    Array.isArray(value.papeis) &&
    value.papeis.every((papel) => papel === 'CLIENTE' || papel === 'FORNECEDOR') &&
    typeof value.telefone === 'string' &&
    (value.cidade === null || typeof value.cidade === 'string') &&
    (value.uf === null || typeof value.uf === 'string') &&
    typeof value.ativo === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function parseContato(value: unknown): Contato {
  if (!isContato(value)) throw new ContatosApiError('A API Financeira retornou dados de contato inválidos.')
  return value
}

function params(input: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) if (value !== undefined) query.set(key, String(value))
  return query.toString()
}

export async function listarContatos(
  input: {
    papel?: PapelContato
    busca?: string
    situacao?: SituacaoContato
    page?: number
    pageSize?: number
  } = {}
): Promise<ListaContatos> {
  const body = await request(`${apiBaseUrl}/contatos?${params(input)}`)
  if (
    typeof body !== 'object' ||
    body === null ||
    !(
      'items' in body &&
      'total' in body &&
      'page' in body &&
      'pageSize' in body &&
      'papeisPermitidos' in body
    ) ||
    !Array.isArray(body.items) ||
    !body.items.every(isContato) ||
    !Array.isArray(body.papeisPermitidos) ||
    !body.papeisPermitidos.every((papel) => papel === 'CLIENTE' || papel === 'FORNECEDOR') ||
    typeof body.total !== 'number' ||
    typeof body.page !== 'number' ||
    typeof body.pageSize !== 'number'
  ) {
    throw new ContatosApiError('A API Financeira retornou a lista de contatos em formato inválido.')
  }
  return {
    items: body.items,
    total: body.total,
    page: body.page,
    pageSize: body.pageSize,
    papeisPermitidos: body.papeisPermitidos,
  }
}

export async function criarContato(input: ContatoInput): Promise<Contato> {
  return parseContato(
    await request(`${apiBaseUrl}/contatos`, { method: 'POST', body: JSON.stringify(input) })
  )
}

export async function atualizarContato(id: string, input: Partial<ContatoInput>): Promise<Contato> {
  return parseContato(
    await request(`${apiBaseUrl}/contatos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  )
}

export async function alterarSituacaoContato(id: string, ativo: boolean): Promise<Contato> {
  return parseContato(
    await request(`${apiBaseUrl}/contatos/${encodeURIComponent(id)}/situacao`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo }),
    })
  )
}

export async function listarTitulosSemContato(input: {
  tipo: TipoTituloContato
  busca?: string
  page?: number
  pageSize?: number
}): Promise<{ items: TituloSemContato[]; total: number; page: number; pageSize: number }> {
  const body = await request(`${apiBaseUrl}/contatos/vinculos-pendentes?${params(input)}`)
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body && 'total' in body && 'page' in body && 'pageSize' in body) ||
    !Array.isArray(body.items) ||
    typeof body.total !== 'number' ||
    typeof body.page !== 'number' ||
    typeof body.pageSize !== 'number'
  ) {
    throw new ContatosApiError('A API Financeira retornou títulos sem contato em formato inválido.')
  }
  return body as { items: TituloSemContato[]; total: number; page: number; pageSize: number }
}

export async function sugerirContatos(papel: PapelContato, nome: string): Promise<Contato[]> {
  const body = await request(`${apiBaseUrl}/contatos/sugestoes?${params({ papel, nome })}`)
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(isContato)
  ) {
    throw new ContatosApiError('A API Financeira retornou sugestões em formato inválido.')
  }
  return body.items
}

export async function vincularTitulos(
  tipo: TipoTituloContato,
  itens: { tituloId: string; contatoId: string }[]
): Promise<number> {
  const body = await request(`${apiBaseUrl}/contatos/vinculos`, {
    method: 'POST',
    body: JSON.stringify({ tipo, itens }),
  })
  if (
    typeof body !== 'object' ||
    body === null ||
    !('vinculados' in body) ||
    typeof body.vinculados !== 'number'
  ) {
    throw new ContatosApiError('A API Financeira retornou uma quantidade de vínculos inválida.')
  }
  return body.vinculados
}
