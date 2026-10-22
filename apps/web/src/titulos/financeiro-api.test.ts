import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  atualizarTitulo,
  buscarTitulo,
  cancelarTitulo,
  criarTitulo,
  listarCategorias,
  listarTitulos,
} from './financeiro-api'

const tituloDespesa = {
  id: 'd0000000-0000-4000-8000-000000000001',
  descricao: 'Compra de sacolas',
  fornecedor: 'Distribuidora ABC',
  fornecedorContatoId: 'c0000000-0000-4000-8000-000000000001',
  valor: 300,
  valorPago: 0,
  dataLancamento: '2026-10-01',
  dataVencimento: '2026-10-30',
  numeroParcelas: 3,
  observacoes: null,
  categoria: { id: 'a0000000-0000-4000-8000-000000000001', nome: 'Mercadorias' },
  status: 'PENDENTE',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
}

const entrada = {
  descricao: 'Venda de materiais',
  pessoa: 'Maria da Silva',
  contatoId: 'c0000000-0000-4000-8000-000000000002',
  valor: 150,
  dataLancamento: '2026-10-01',
  dataVencimento: '2026-10-15',
  parcelas: 2,
  categoriaId: 'a0000000-0000-4000-8000-000000000002',
  observacoes: '',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('cliente HTTP de despesas e recebimentos', () => {
  it('consulta despesas com os nomes de filtros da API e normaliza fornecedor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ items: [tituloDespesa], total: 1, page: 2, pageSize: 20 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listarTitulos('DESPESA', {
      pessoa: 'Distribuidora',
      status: 'PENDENTE',
      dataInicio: '2026-10-01',
      dataFim: '2026-10-31',
      page: 2,
    })

    expect(result.items[0]).toMatchObject({ pessoa: 'Distribuidora ABC', valorLiquidado: 0 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/despesas?')
    expect(url).toContain('fornecedor=Distribuidora')
    expect(url).toContain('dataInicio=2026-10-01')
    expect(url).toContain('page=2')
    expect(init.credentials).toBe('include')
  })

  it('consulta categorias do tipo selecionado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [{ id: 'a0000000-0000-4000-8000-000000000002', nome: 'Vendas', tipo: 'RECEBIMENTO' }],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listarCategorias('RECEBIMENTO')).resolves.toEqual([
      { id: 'a0000000-0000-4000-8000-000000000002', nome: 'Vendas', tipo: 'RECEBIMENTO' },
    ])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/categorias?tipo=RECEBIMENTO')
  })

  it('cria recebimento sem liquidar no ato e envia o contato do cliente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          ...tituloDespesa,
          cliente: entrada.pessoa,
          clienteContatoId: entrada.contatoId,
          valorRecebido: 0,
          status: 'PENDENTE',
          parcelas: [],
        },
        201
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await criarTitulo('RECEBIMENTO', entrada)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/recebimentos')
    expect(JSON.parse(String(init.body))).toMatchObject({
      cliente: 'Maria da Silva',
      clienteContatoId: entrada.contatoId,
      liquidarNoAto: false,
    })
  })

  it('cria despesa sem liquidar no ato e envia o contato do fornecedor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ...tituloDespesa, parcelas: [] }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await criarTitulo('DESPESA', {
      ...entrada,
      pessoa: 'Distribuidora ABC',
      contatoId: tituloDespesa.fornecedorContatoId,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/despesas')
    expect(JSON.parse(String(init.body))).toMatchObject({
      fornecedor: 'Distribuidora ABC',
      fornecedorContatoId: tituloDespesa.fornecedorContatoId,
      liquidarNoAto: false,
    })
  })

  it('consulta histórico, parcelas e pagamentos de uma despesa', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...tituloDespesa,
        parcelas: [
          {
            id: 'b0000000-0000-4000-8000-000000000001',
            numero: 1,
            valor: 100,
            valorLiquidado: 0,
            dataVencimento: '2026-10-30',
            status: 'PENDENTE',
          },
        ],
        pagamentos: [],
        historico: [],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await buscarTitulo('DESPESA', tituloDespesa.id)

    expect(result.parcelas).toHaveLength(1)
    expect(result.liquidacoes).toEqual([])
    expect(result.historico).toEqual([])
  })

  it('atualiza recebimento usando os campos cliente e clienteContatoId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...tituloDespesa,
        cliente: entrada.pessoa,
        clienteContatoId: entrada.contatoId,
        valorRecebido: 0,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await atualizarTitulo('RECEBIMENTO', tituloDespesa.id, entrada)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`http://localhost:8080/recebimentos/${tituloDespesa.id}`)
    expect(JSON.parse(String(init.body))).toMatchObject({
      cliente: 'Maria da Silva',
      clienteContatoId: entrada.contatoId,
      categoriaId: entrada.categoriaId,
    })
  })

  it.each([
    ['DESPESA', 'despesas'],
    ['RECEBIMENTO', 'recebimentos'],
  ] as const)('cancela um título de %s pela rota administrativa existente', async (tipo, endpoint) => {
    const body =
      tipo === 'DESPESA'
        ? { ...tituloDespesa, status: 'CANCELADO' }
        : {
            ...tituloDespesa,
            cliente: 'Maria da Silva',
            clienteContatoId: null,
            valorRecebido: 0,
            status: 'CANCELADO',
          }
    const fetchMock = vi.fn().mockResolvedValue(response(body))
    vi.stubGlobal('fetch', fetchMock)

    await cancelarTitulo(tipo, tituloDespesa.id)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`http://localhost:8080/${endpoint}/${tituloDespesa.id}/cancelar`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })
})
