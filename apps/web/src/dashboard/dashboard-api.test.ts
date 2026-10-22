import { afterEach, describe, expect, it, vi } from 'vitest'

import { consultarResumoDashboard } from './dashboard-api'

const periodo = { dataInicio: '2026-10-01', dataFim: '2026-10-31' }
const resumo = {
  periodo,
  contasAPagar: { total: 2000, pago: 500, pendente: 1500 },
  contasAReceber: { total: 3000, recebido: 1000, pendente: 2000 },
  caixa: { configurado: true, entradas: 1250.75, saidas: 600, saldoLiquido: 650.75 },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cliente do resumo do dashboard', () => {
  it('envia o período com sessão e valida os indicadores recebidos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(resumo))
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarResumoDashboard(periodo)).resolves.toEqual(resumo)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/dashboard/resumo?dataInicio=2026-10-01&dataFim=2026-10-31',
      { credentials: 'include' }
    )
  })

  it('não aceita resposta sem um dos valores esperados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...resumo, contasAPagar: { total: 2000 } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarResumoDashboard(periodo)).rejects.toThrow(
      'A API Financeira retornou um resumo em formato inválido.'
    )
  })

  it('apresenta a recusa da API para funcionário sem acesso ao dashboard', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Somente ADMIN pode acessar' }), { status: 403 })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(consultarResumoDashboard(periodo)).rejects.toThrow('Somente ADMIN pode acessar')
  })
})
