import { afterEach, describe, expect, it, vi } from 'vitest'

import { baixarRelatorioCsv, consultarRelatorio } from './relatorios-api'

const filtro = { dataInicio: '2026-10-01', dataFim: '2026-10-31' }
const despesa = {
  id: '00000000-0000-4000-8000-000000000001',
  descricao: 'Compra de papel',
  fornecedor: 'Fornecedor ABC',
  valor: 250,
  valorPago: 50,
  dataVencimento: '2026-10-15',
  status: 'PARCIAL',
  categoria: { id: '00000000-0000-4000-8000-000000000002', nome: 'Mercadorias' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cliente de relatórios financeiros', () => {
  it('consulta JSON de contas a pagar com o período informado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ totalAPagar: 250, totalPago: 50, totalPendente: 200, itens: [despesa] })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarRelatorio('PAGAR', filtro)).resolves.toEqual({
      total: 250,
      liquidado: 50,
      pendente: 200,
      itens: [
        {
          id: despesa.id,
          descricao: 'Compra de papel',
          contraparte: 'Fornecedor ABC',
          categoria: 'Mercadorias',
          valor: 250,
          liquidado: 50,
          dataVencimento: '2026-10-15',
          status: 'PARCIAL',
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/relatorios/contas-a-pagar?formato=json&dataInicio=2026-10-01&dataFim=2026-10-31',
      { credentials: 'include' }
    )
  })

  it('consulta JSON de contas a receber pelo mesmo filtro de período', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        totalAReceber: 300,
        totalRecebido: 100,
        totalPendente: 200,
        itens: [
          {
            ...despesa,
            cliente: 'Cliente XYZ',
            valor: 300,
            valorRecebido: 100,
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const resultado = await consultarRelatorio('RECEBER', filtro)

    expect(resultado.total).toBe(300)
    expect(resultado.itens[0]?.contraparte).toBe('Cliente XYZ')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:8080/relatorios/contas-a-receber?formato=json&dataInicio=2026-10-01&dataFim=2026-10-31'
    )
  })

  it('baixa o CSV com exatamente o mesmo tipo e filtro do JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Descrição,Fornecedor\nPapel,ABC', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(baixarRelatorioCsv('PAGAR', filtro)).resolves.toContain('Descrição,Fornecedor')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/relatorios/contas-a-pagar?formato=csv&dataInicio=2026-10-01&dataFim=2026-10-31',
      { credentials: 'include' }
    )
  })

  it('retorna a mensagem da API quando o acesso é negado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Somente ADMIN pode consultar relatórios' }), { status: 403 })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarRelatorio('RECEBER', filtro)).rejects.toThrow(
      'Somente ADMIN pode consultar relatórios'
    )
  })
})
