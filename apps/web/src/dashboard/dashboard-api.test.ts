import { afterEach, describe, expect, it, vi } from 'vitest'
import { consultarVisaoGeral } from './dashboard-api'

const overview = {
  mes: '2026-11',
  permissoes: { despesas: true, recebimentos: false, caixa: false, relatorios: false },
  caixaConfigurado: true,
  indicadores: {
    entradas: { valor: 0, variacaoPercentual: null },
    saidas: { valor: 100, variacaoPercentual: 20 },
    resultado: { valor: -100, variacaoPercentual: null },
    ticketMedio: { valor: null, variacaoPercentual: null },
  },
  serieMensal: [{ mes: '2026-11', entradas: 0, saidas: 100 }],
  saidasPorCategoria: [{ nome: 'Material', valor: 100 }],
  ultimasMovimentacoes: [],
  resumo: { saldoAtual: null, aPagar: 200, aReceber: null },
}
afterEach(() => vi.unstubAllGlobals())

describe('cliente da dashboard mensal', () => {
  it('consulta mês com cookie e cancelamento, preservando valores restritos como null', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(overview))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    await expect(consultarVisaoGeral('2026-11', signal)).resolves.toEqual(overview)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/dashboard/visao-geral?mes=2026-11', {
      credentials: 'include',
      signal,
    })
  })
  it.each([
    { ...overview, mes: '2026-10' },
    { ...overview, serieMensal: [{ mes: '2026-11', entradas: -1, saidas: 100 }] },
    { ...overview, resumo: {} },
    { ...overview, permissoes: { despesas: true } },
    { ...overview, ultimasMovimentacoes: [{ data: 'invalida' }] },
  ])('rejeita contrato inválido ou resposta de outro mês', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    await expect(consultarVisaoGeral('2026-11')).rejects.toThrow('formato inválido')
  })
  it.each([401, 403, 500])('não aceita dados em resposta de erro HTTP %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(overview, { status })))
    await expect(consultarVisaoGeral('2026-11')).rejects.toMatchObject({ status })
  })
  it('preserva cancelamento de requisição para evitar respostas atrasadas', async () => {
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('Cancelada', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(consultarVisaoGeral('2026-11', controller.signal)).rejects.toBe(abort)
  })
  it('apresenta falha de rede sem gerar indicadores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    await expect(consultarVisaoGeral('2026-11')).rejects.toThrow(
      'Não foi possível conectar à API Financeira.'
    )
  })
  it('rejeita uma resposta que não seja JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Erro</html>')))
    await expect(consultarVisaoGeral('2026-11')).rejects.toThrow('resposta inválida')
  })
  it('não converte texto em valores monetários', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...overview,
          indicadores: { ...overview.indicadores, entradas: { valor: '100', variacaoPercentual: null } },
        })
      )
    )
    await expect(consultarVisaoGeral('2026-11')).rejects.toThrow('formato inválido')
  })
})
