import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const state = vi.hoisted(() => ({ pagamento: vi.fn(), baixa: vi.fn() }))
vi.mock('@sisgfpa/auth', () => ({
  getAuthenticatedUser: async () => ({
    id: 'admin',
    name: 'Admin',
    email: 'admin@teste.local',
    role: 'ADMIN',
  }),
}))
vi.mock('../modules/despesas/despesas.service.js', () => ({ registrarPagamento: state.pagamento }))
vi.mock('../modules/recebimentos/recebimentos.service.js', () => ({ registrarBaixa: state.baixa }))

describe('cabeçalho de idempotência nas rotas de liquidação', () => {
  let app: FastifyInstance
  const id = '00000000-0000-4000-8000-000000000001'
  const key = '00000000-0000-4000-8000-000000000002'
  beforeAll(async () => {
    const { createApp } = await import('@sisgfpa/http')
    const { despesasRoutes } = await import('../modules/despesas/despesas.routes.js')
    const { recebimentosRoutes } = await import('../modules/recebimentos/recebimentos.routes.js')
    app = await createApp({
      title: 'Teste',
      description: 'Liquidação',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: [],
      rateLimitMax: 100,
      logger: false,
    })
    await app.register(despesasRoutes, { prefix: '/despesas' })
    await app.register(recebimentosRoutes, { prefix: '/recebimentos' })
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    const response = {
      id,
      descricao: 'Título',
      fornecedor: 'Fornecedor',
      cliente: 'Cliente',
      fornecedorContatoId: null,
      clienteContatoId: null,
      valor: 100,
      valorPago: 25,
      valorRecebido: 25,
      dataLancamento: '2032-03-01',
      dataVencimento: '2032-03-10',
      numeroParcelas: 1,
      observacoes: null,
      categoria: null,
      status: 'PARCIAL',
      createdAt: '2032-03-01T12:00:00Z',
      updatedAt: '2032-03-01T12:00:00Z',
    }
    state.pagamento.mockResolvedValue(response)
    state.baixa.mockResolvedValue(response)
  })

  it.each(['despesas', 'recebimentos'] as const)(
    'encaminha a chave do cabeçalho em %s e recusa chave divergente ou inválida',
    async (module) => {
      const url = `/${module}/${id}/${module === 'despesas' ? 'pagamentos' : 'baixas'}`
      const service = module === 'despesas' ? state.pagamento : state.baixa
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { 'idempotency-key': key },
        payload: { valor: 25 },
      })
      expect(response.statusCode).toBe(200)
      expect(service).toHaveBeenCalledExactlyOnceWith(id, { valor: 25, idempotencyKey: key }, 'admin')
      const mismatch = await app.inject({
        method: 'POST',
        url,
        headers: { 'idempotency-key': key },
        payload: { valor: 25, idempotencyKey: id },
      })
      expect(mismatch.statusCode).toBe(400)
      const invalid = await app.inject({
        method: 'POST',
        url,
        headers: { 'idempotency-key': 'invalida' },
        payload: { valor: 25 },
      })
      expect(invalid.statusCode).toBe(400)
      expect(service).toHaveBeenCalledTimes(1)
    }
  )
})
