import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const state = vi.hoisted(() => ({
  consultarCaixa: vi.fn(),
  abrirCaixa: vi.fn(),
  listarMovimentacoes: vi.fn(),
  registrarEstorno: vi.fn(),
  registrarLancamentoAvulso: vi.fn(),
}))

vi.mock('@sisgfpa/auth', () => ({
  getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
    const role = headers['x-test-role']
    if (role !== 'ADMIN' && role !== 'FUNCIONARIO') return null
    return {
      id: role === 'ADMIN' ? 'admin-1' : 'funcionario-1',
      name: 'Usuário teste',
      email: 'teste@example.com',
      role,
    }
  },
}))

vi.mock('./caixa.service.js', () => state)

describe('rotas do Caixa', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const [{ createApp }, { caixaRoutes }] = await Promise.all([
      import('@sisgfpa/http'),
      import('./caixa.routes.js'),
    ])
    app = await createApp({
      title: 'API Caixa de teste',
      description: 'Verifica as operações administrativas do Caixa',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: ['http://localhost:8080'],
      rateLimitMax: 100,
      logger: false,
    })
    await app.register(caixaRoutes, { prefix: '/caixa' })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    for (const mock of Object.values(state)) mock.mockReset()
    state.consultarCaixa.mockResolvedValue({ caixa: null })
    state.abrirCaixa.mockResolvedValue({
      caixa: {
        id: '00000000-0000-4000-8000-000000000001',
        codigo: 'PRINCIPAL',
        saldoInicial: 100,
        iniciadoEm: '2026-10-21T12:00:00.000Z',
        totalEntradas: 0,
        totalSaidas: 0,
        quantidadeMovimentacoes: 0,
        saldoAtual: 100,
      },
    })
    state.listarMovimentacoes.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    state.registrarLancamentoAvulso.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      tipo: 'ENTRADA',
      origem: 'AVULSA',
      valor: 150,
      data: '2026-11-18T04:00:00.000Z',
      descricao: 'Aporte de capital',
      titulo: null,
      estornoDeId: null,
      valorEstornado: 0,
      saldoEstornavel: 150,
      podeEstornar: true,
    })
  })

  it('exige ADMIN para consultar e configurar o Caixa', async () => {
    const anonimo = await app.inject({ method: 'GET', url: '/caixa/' })
    const funcionario = await app.inject({
      method: 'GET',
      url: '/caixa/',
      headers: { 'x-test-role': 'FUNCIONARIO' },
    })
    const admin = await app.inject({ method: 'GET', url: '/caixa/', headers: { 'x-test-role': 'ADMIN' } })
    const abertura = await app.inject({
      method: 'POST',
      url: '/caixa/abertura',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { saldoInicial: 100 },
    })

    expect(anonimo.statusCode).toBe(401)
    expect(funcionario.statusCode).toBe(403)
    expect(admin.statusCode).toBe(200)
    expect(abertura.statusCode).toBe(200)
    expect(state.abrirCaixa).toHaveBeenCalledWith({ saldoInicial: 100 })
  })

  it('permite ADMIN filtrar movimentos e registrar estorno com valor validado', async () => {
    const lista = await app.inject({
      method: 'GET',
      url: '/caixa/movimentacoes?tipo=SAIDA&dataInicio=2026-10-01&page=2',
      headers: { 'x-test-role': 'ADMIN' },
    })
    const estorno = await app.inject({
      method: 'POST',
      url: '/caixa/movimentacoes/00000000-0000-4000-8000-000000000001/estornos',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { valor: 15 },
    })

    expect(lista.statusCode).toBe(200)
    expect(state.listarMovimentacoes).toHaveBeenCalledWith({
      tipo: 'SAIDA',
      dataInicio: '2026-10-01',
      page: 2,
      pageSize: 20,
    })
    expect(estorno.statusCode).toBe(200)
    expect(state.registrarEstorno).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      { valor: 15 },
      'admin-1'
    )
  })

  it('permite somente ADMIN criar lançamento avulso com autoria do usuário autenticado', async () => {
    const body = {
      tipo: 'ENTRADA',
      valor: 150,
      data: '2026-11-18',
      descricao: 'Aporte de capital',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    }
    const funcionario = await app.inject({
      method: 'POST',
      url: '/caixa/movimentacoes/avulsas',
      headers: { 'x-test-role': 'FUNCIONARIO', 'content-type': 'application/json' },
      payload: body,
    })
    const admin = await app.inject({
      method: 'POST',
      url: '/caixa/movimentacoes/avulsas',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: body,
    })

    expect(funcionario.statusCode).toBe(403)
    expect(admin.statusCode).toBe(200)
    expect(admin.json()).toMatchObject({ origem: 'AVULSA', tipo: 'ENTRADA', titulo: null })
    expect(state.registrarLancamentoAvulso).toHaveBeenCalledExactlyOnceWith(body, 'admin-1')
  })

  it('recusa origem controlada pelo cliente e valores com mais de duas casas', async () => {
    const base = {
      tipo: 'ENTRADA',
      valor: 25,
      data: '2026-11-18',
      descricao: 'Aporte de capital',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    }
    const origem = await app.inject({
      method: 'POST',
      url: '/caixa/movimentacoes/avulsas',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { ...base, origem: 'ESTORNO' },
    })
    const casasDecimais = await app.inject({
      method: 'POST',
      url: '/caixa/movimentacoes/avulsas',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { ...base, valor: 25.005 },
    })

    expect(origem.statusCode).toBe(400)
    expect(casasDecimais.statusCode).toBe(400)
    expect(state.registrarLancamentoAvulso).not.toHaveBeenCalled()
  })

  it('rejeita saldo inicial negativo e campos adicionais', async () => {
    const negativo = await app.inject({
      method: 'POST',
      url: '/caixa/abertura',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { saldoInicial: -1 },
    })
    const extra = await app.inject({
      method: 'POST',
      url: '/caixa/abertura',
      headers: { 'x-test-role': 'ADMIN', 'content-type': 'application/json' },
      payload: { saldoInicial: 1, codigo: 'OUTRO' },
    })

    expect(negativo.statusCode).toBe(400)
    expect(extra.statusCode).toBe(400)
    expect(state.abrirCaixa).not.toHaveBeenCalled()
  })
})
