import { afterEach, describe, expect, it, vi } from 'vitest'

import { consultarCaixa, estornarMovimentacao, informarSaldoInicial, listarMovimentacoes } from './caixa-api'

const movement = {
  id: '00000000-0000-4000-8000-000000000001',
  tipo: 'SAIDA',
  origem: 'LIQUIDACAO',
  valor: 25,
  data: '2026-10-21T12:00:00.000Z',
  descricao: 'Pagamento: sacolas',
  titulo: {
    id: '00000000-0000-4000-8000-000000000002',
    descricao: 'Compra de sacolas',
    pessoa: 'Fornecedor X',
    status: 'CANCELADO',
  },
  estornoDeId: null,
  valorEstornado: 0,
  saldoEstornavel: 25,
  podeEstornar: true,
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('cliente HTTP do Caixa', () => {
  it('consulta o saldo e mantém sessões por cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        caixa: {
          id: '00000000-0000-4000-8000-000000000003',
          codigo: 'PRINCIPAL',
          saldoInicial: 500,
          iniciadoEm: '2026-10-21T12:00:00.000Z',
          totalEntradas: 250,
          totalSaidas: 90,
          quantidadeMovimentacoes: 4,
          saldoAtual: 660,
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarCaixa()).resolves.toMatchObject({ saldoAtual: 660, quantidadeMovimentacoes: 4 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/caixa')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include')
  })

  it('informa saldo inicial sem enviar importação de liquidações antigas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ caixa: null }))
    vi.stubGlobal('fetch', fetchMock)

    await informarSaldoInicial(1250.5)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/caixa/abertura')
    expect(JSON.parse(String(init.body))).toEqual({ saldoInicial: 1250.5 })
  })

  it('lista movimentações com filtros de período e tipo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ items: [movement], total: 1, page: 2, pageSize: 20 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      listarMovimentacoes({ tipo: 'SAIDA', dataInicio: '2026-10-01', dataFim: '2026-10-31', page: 2 })
    ).resolves.toMatchObject({ items: [{ origem: 'LIQUIDACAO', podeEstornar: true }], total: 1 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('tipo=SAIDA')
    expect(url).toContain('dataInicio=2026-10-01')
    expect(url).toContain('dataFim=2026-10-31')
    expect(url).toContain('page=2')
  })

  it('registra uma devolução real ligada ao movimento original', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...movement,
        tipo: 'ENTRADA',
        origem: 'ESTORNO',
        estornoDeId: movement.id,
        valorEstornado: 25,
        saldoEstornavel: 0,
        podeEstornar: false,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await estornarMovimentacao(movement.id, 25)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`http://localhost:8080/caixa/movimentacoes/${movement.id}/estornos`)
    expect(JSON.parse(String(init.body))).toEqual({ valor: 25 })
  })

  it('apresenta erro de autorização retornado pela API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Somente ADMIN' }, 403)))

    await expect(consultarCaixa()).rejects.toMatchObject({ message: 'Somente ADMIN', status: 403 })
  })
})
