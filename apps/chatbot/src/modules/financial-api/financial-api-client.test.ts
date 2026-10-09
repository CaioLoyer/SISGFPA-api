import { describe, expect, it, vi } from 'vitest'

import { FinancialApiClient, FinancialApiError } from './financial-api-client.js'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('FinancialApiClient', () => {
  it('repassa o cookie do usuário e envia o body em JSON', async () => {
    const fetchMock = vi.fn(async () => json(201, { id: 'd1' }))
    const client = new FinancialApiClient(
      { cookie: 'sessao=abc' },
      'http://api',
      fetchMock as unknown as typeof fetch
    )

    await client.createDespesa({
      descricao: 'Compra',
      fornecedor: 'ABC',
      valor: 10,
      dataVencimento: '2026-10-30',
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api/despesas')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).cookie).toBe('sessao=abc')
    expect(JSON.parse(init.body as string).fornecedor).toBe('ABC')
  })

  it('403 da API vira FinancialApiError preservando status e código', async () => {
    const client = new FinancialApiClient({}, 'http://api', (async () =>
      json(403, { error: 'Sem permissão', code: 'FORBIDDEN' })) as unknown as typeof fetch)
    const erro = await client.cancelarDespesa('d1').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(FinancialApiError)
    expect(erro).toMatchObject({ apiStatus: 403, code: 'FORBIDDEN', statusCode: 502 })
  })

  it('401 continua 401 para quem chamou o Chatbot', async () => {
    const client = new FinancialApiClient({}, 'http://api', (async () =>
      json(401, { error: 'Não autenticado', code: 'UNAUTHORIZED' })) as unknown as typeof fetch)
    expect(await client.listCategorias('DESPESA').catch((e: unknown) => e)).toMatchObject({ statusCode: 401 })
  })

  it('API fora do ar vira FINANCIAL_API_UNAVAILABLE', async () => {
    const client = new FinancialApiClient({}, 'http://api', (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch)
    expect(await client.listDespesas({ fornecedor: 'x' }).catch((e: unknown) => e)).toMatchObject({
      code: 'FINANCIAL_API_UNAVAILABLE',
    })
  })
})
