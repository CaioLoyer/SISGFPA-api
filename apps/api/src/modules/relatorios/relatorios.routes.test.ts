import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
const state = vi.hoisted(() => ({
  permission: vi.fn(),
  contasAPagar: vi.fn(),
  contasAReceber: vi.fn(),
  contasAPagarCsv: vi.fn(),
  contasAReceberCsv: vi.fn(),
}))
vi.mock('@sisgfpa/auth', () => ({
  getAuthenticatedUser: async (headers: Record<string, string>) =>
    headers['x-test-role']
      ? { id: 'usuario', name: 'Usuário', email: 'teste@example.com', role: headers['x-test-role'] }
      : null,
}))
vi.mock('@sisgfpa/database', () => ({ prisma: { funcionarioPermissao: { findUnique: state.permission } } }))
vi.mock('./relatorios.service.js', () => state)

describe('relatórios autorizados por módulo e tipo financeiro', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    const { createApp } = await import('@sisgfpa/http')
    const { relatoriosRoutes } = await import('./relatorios.routes.js')
    app = await createApp({
      title: 'Teste',
      description: 'Permissões de relatórios',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: [],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(relatoriosRoutes, { prefix: '/relatorios' })
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
  })
  beforeEach(() => {
    vi.resetAllMocks()
    state.contasAPagar.mockResolvedValue({ totalAPagar: 100, totalPago: 25, totalPendente: 75, itens: [] })
    state.contasAReceber.mockResolvedValue({
      totalAReceber: 100,
      totalRecebido: 25,
      totalPendente: 75,
      itens: [],
    })
    state.contasAPagarCsv.mockResolvedValue('descricao;valor\nDespesa;100')
    state.contasAReceberCsv.mockResolvedValue('descricao;valor\nRecebimento;100')
  })

  it.each(
    Array.from({ length: 8 }, (_, n) => ({
      despesas: !!(n & 1),
      recebimentos: !!(n & 2),
      relatorios: !!(n & 4),
    }))
  )('aplica a combinação %j igualmente no JSON e CSV', async (config) => {
    state.permission.mockResolvedValue({ ...config, comercial: false })
    for (const tipo of ['pagar', 'receber'])
      for (const formato of ['json', 'csv']) {
        const allowed = config.relatorios && (tipo === 'pagar' ? config.despesas : config.recebimentos)
        const result = await app.inject({
          url: `/relatorios/contas-a-${tipo}?formato=${formato}`,
          headers: { 'x-test-role': 'FUNCIONARIO' },
        })
        expect(result.statusCode, `${tipo}/${formato}`).toBe(allowed ? 200 : 403)
        if (allowed && formato === 'csv') expect(result.headers['content-type']).toContain('text/csv')
        const service =
          tipo === 'pagar'
            ? formato === 'csv'
              ? state.contasAPagarCsv
              : state.contasAPagar
            : formato === 'csv'
              ? state.contasAReceberCsv
              : state.contasAReceber
        expect(service).toHaveBeenCalledTimes(allowed ? 1 : 0)
      }
  })

  it('mantém ADMIN com todos os relatórios e nega sessão ausente', async () => {
    expect((await app.inject({ url: '/relatorios/contas-a-pagar' })).statusCode).toBe(401)
    for (const tipo of ['pagar', 'receber'])
      for (const formato of ['json', 'csv']) {
        expect(
          (
            await app.inject({
              url: `/relatorios/contas-a-${tipo}?formato=${formato}`,
              headers: { 'x-test-role': 'ADMIN' },
            })
          ).statusCode
        ).toBe(200)
      }
    expect(state.permission).not.toHaveBeenCalled()
  })
})
