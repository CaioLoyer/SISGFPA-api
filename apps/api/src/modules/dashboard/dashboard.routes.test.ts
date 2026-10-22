import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const state = vi.hoisted(() => ({ consultarResumo: vi.fn() }))

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

vi.mock('./dashboard.service.js', () => state)

describe('rotas do dashboard', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const [{ createApp }, { dashboardRoutes }] = await Promise.all([
      import('@sisgfpa/http'),
      import('./dashboard.routes.js'),
    ])
    app = await createApp({
      title: 'API Dashboard de teste',
      description: 'Verifica o resumo administrativo',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: ['http://localhost:8080'],
      rateLimitMax: 100,
      logger: false,
    })
    await app.register(dashboardRoutes, { prefix: '/dashboard' })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    state.consultarResumo.mockReset()
    state.consultarResumo.mockResolvedValue({
      periodo: { dataInicio: '2026-10-01', dataFim: '2026-10-31' },
      contasAPagar: { total: 100, pago: 25, pendente: 75 },
      contasAReceber: { total: 200, recebido: 50, pendente: 150 },
      caixa: { configurado: true, entradas: 50, saidas: 25, saldoLiquido: 25 },
    })
  })

  it('exige ADMIN e recebe um período válido', async () => {
    const anonimo = await app.inject({
      method: 'GET',
      url: '/dashboard/resumo?dataInicio=2026-10-01&dataFim=2026-10-31',
    })
    const funcionario = await app.inject({
      method: 'GET',
      url: '/dashboard/resumo?dataInicio=2026-10-01&dataFim=2026-10-31',
      headers: { 'x-test-role': 'FUNCIONARIO' },
    })
    const admin = await app.inject({
      method: 'GET',
      url: '/dashboard/resumo?dataInicio=2026-10-01&dataFim=2026-10-31',
      headers: { 'x-test-role': 'ADMIN' },
    })

    expect(anonimo.statusCode).toBe(401)
    expect(funcionario.statusCode).toBe(403)
    expect(admin.statusCode).toBe(200)
    expect(admin.json()).toMatchObject({ contasAPagar: { pendente: 75 }, caixa: { saldoLiquido: 25 } })
    expect(state.consultarResumo).toHaveBeenCalledWith({ dataInicio: '2026-10-01', dataFim: '2026-10-31' })
  })

  it('rejeita período invertido e parâmetros não declarados', async () => {
    const invertido = await app.inject({
      method: 'GET',
      url: '/dashboard/resumo?dataInicio=2026-10-31&dataFim=2026-10-01',
      headers: { 'x-test-role': 'ADMIN' },
    })
    const extra = await app.inject({
      method: 'GET',
      url: '/dashboard/resumo?dataInicio=2026-10-01&dataFim=2026-10-31&tipo=DESPESA',
      headers: { 'x-test-role': 'ADMIN' },
    })

    expect(invertido.statusCode).toBe(400)
    expect(extra.statusCode).toBe(400)
    expect(state.consultarResumo).not.toHaveBeenCalled()
  })
})
