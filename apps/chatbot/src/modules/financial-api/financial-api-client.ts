import { AppError } from '@sisgfpa/http'
import type {
  CategoriaDto,
  CreateDespesaBody,
  CreateRecebimentoBody,
  DespesaComParcelasDto,
  DespesaDto,
  RecebimentoComParcelasDto,
  RecebimentoDto,
} from '@sisgfpa/validation'

/**
 * Erro devolvido pela API Financeira (formato padrão { error, code }).
 * `apiStatus` é o status original; para quem chamou o Chatbot, sessão expirada continua 401 e
 * qualquer outra falha vira 502 (a falha foi na integração, não na requisição do usuário).
 */
export class FinancialApiError extends AppError {
  constructor(
    readonly apiStatus: number,
    code: string,
    message: string
  ) {
    super(apiStatus === 401 ? 401 : 502, code, message)
  }
}

/** Credenciais do próprio usuário, repassadas como vieram: a API Financeira é quem autoriza. */
export interface ForwardedAuth {
  cookie?: string
  authorization?: string
}

interface ListResult<T> {
  items: T[]
  total: number
}

type FetchLike = typeof fetch

/**
 * Único ponto de acesso do Chatbot ao domínio financeiro (HTTP/REST).
 * O Chatbot nunca escreve tabelas financeiras nem replica regras: só chama estes métodos.
 */
export class FinancialApiClient {
  constructor(
    private readonly auth: ForwardedAuth,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.auth.cookie) headers.cookie = this.auth.cookie
    if (this.auth.authorization) headers.authorization = this.auth.authorization
    if (body !== undefined) headers['content-type'] = 'application/json'

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new FinancialApiError(502, 'FINANCIAL_API_UNAVAILABLE', 'API Financeira indisponível')
    }

    const text = await response.text()
    const data = text ? (JSON.parse(text) as unknown) : null

    if (!response.ok) {
      const err = (data ?? {}) as { error?: string; code?: string }
      throw new FinancialApiError(
        response.status,
        err.code ?? 'FINANCIAL_API_ERROR',
        err.error ?? `Erro ${response.status} na API Financeira`
      )
    }
    return data as T
  }

  listCategorias(tipo: 'DESPESA' | 'RECEBIMENTO') {
    return this.request<ListResult<CategoriaDto>>('GET', `/categorias?tipo=${tipo}`)
  }

  listDespesas(params: { fornecedor: string }) {
    const q = new URLSearchParams({ fornecedor: params.fornecedor, pageSize: '100' })
    return this.request<ListResult<DespesaDto>>('GET', `/despesas?${q}`)
  }

  listRecebimentos(params: { cliente: string }) {
    const q = new URLSearchParams({ cliente: params.cliente, pageSize: '100' })
    return this.request<ListResult<RecebimentoDto>>('GET', `/recebimentos?${q}`)
  }

  createDespesa(body: CreateDespesaBody) {
    return this.request<DespesaComParcelasDto>('POST', '/despesas', body)
  }

  createRecebimento(body: CreateRecebimentoBody) {
    return this.request<RecebimentoComParcelasDto>('POST', '/recebimentos', body)
  }

  registrarPagamento(id: string, valor: number) {
    return this.request<DespesaDto>('POST', `/despesas/${id}/pagamentos`, { valor })
  }

  registrarBaixa(id: string, valor: number) {
    return this.request<RecebimentoDto>('POST', `/recebimentos/${id}/baixas`, { valor })
  }

  cancelarDespesa(id: string) {
    return this.request<DespesaDto>('POST', `/despesas/${id}/cancelar`)
  }

  cancelarRecebimento(id: string) {
    return this.request<RecebimentoDto>('POST', `/recebimentos/${id}/cancelar`)
  }
}
