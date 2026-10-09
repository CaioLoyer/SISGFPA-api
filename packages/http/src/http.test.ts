import type { AuthenticatedUser } from '@sisgfpa/auth'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import z from 'zod'

import { createApp, requireAdmin, requireAuth } from './index.js'
import { BusinessRuleError, ConflictError, NotFoundError } from './index.js'

const getAuthenticatedUser = vi.fn<() => Promise<AuthenticatedUser | null>>()
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }))

const admin: AuthenticatedUser = { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'ADMIN' }
const funcionario: AuthenticatedUser = { ...admin, id: 'u2', role: 'FUNCIONARIO' }

async function buildTestApp(): Promise<FastifyInstance> {
  const app = await createApp({
    title: 't',
    description: 'd',
    serverUrl: 'http://localhost',
    trustedOrigins: ['http://localhost:3000'],
    rateLimitMax: 1000,
    logger: false,
  })

  await app.register(async (scope) => {
    scope.addHook('onRequest', requireAuth)
    scope.get('/eu', async (request) => ({ id: request.user.id }))
    scope.get('/admin', { onRequest: requireAdmin }, async () => ({ ok: true }))
    scope.post('/validar', { schema: { body: z.object({ valor: z.number().positive() }) } }, async () => ({}))
  })
  app.get('/nao-achou', async () => {
    throw new NotFoundError('Despesa não encontrada')
  })
  app.get('/regra', async () => {
    throw new BusinessRuleError('VALOR_INVALIDO', 'Valor excede o saldo')
  })
  app.get('/conflito', async () => {
    throw new ConflictError('JA_EXISTE', 'Já existe')
  })
  app.get('/quebrou', async () => {
    throw new Error('senha do banco: 123')
  })
  return app
}

beforeEach(() => getAuthenticatedUser.mockReset())

describe('tratamento central de erros ({ error, code })', () => {
  it('erros de domínio usam o status e o código definidos', async () => {
    const app = await buildTestApp()
    const nf = await app.inject('/nao-achou')
    expect([nf.statusCode, nf.json()]).toEqual([404, { error: 'Despesa não encontrada', code: 'NOT_FOUND' }])
    const regra = await app.inject('/regra')
    expect([regra.statusCode, regra.json().code]).toEqual([400, 'VALOR_INVALIDO'])
    expect((await app.inject('/conflito')).statusCode).toBe(409)
  })

  it('validação Zod vira 400 VALIDATION_ERROR', async () => {
    getAuthenticatedUser.mockResolvedValue(funcionario)
    const app = await buildTestApp()
    const res = await app.inject({ method: 'POST', url: '/validar', payload: { valor: -1 } })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION_ERROR')
  })

  it('rota inexistente devolve o mesmo formato', async () => {
    const res = await (await buildTestApp()).inject('/nada')
    expect([res.statusCode, res.json().code]).toEqual([404, 'NOT_FOUND'])
  })

  it('erro inesperado vira 500 genérico, sem vazar a mensagem interna', async () => {
    const res = await (await buildTestApp()).inject('/quebrou')
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Erro interno do servidor', code: 'INTERNAL_SERVER_ERROR' })
    expect(res.body).not.toContain('senha')
  })
})

describe('autenticação e autorização por hook', () => {
  it('sem sessão: 401', async () => {
    getAuthenticatedUser.mockResolvedValue(null)
    const res = await (await buildTestApp()).inject('/eu')
    expect([res.statusCode, res.json().code]).toEqual([401, 'UNAUTHORIZED'])
  })

  it('com sessão: o handler recebe request.user', async () => {
    getAuthenticatedUser.mockResolvedValue(funcionario)
    const res = await (await buildTestApp()).inject('/eu')
    expect(res.json()).toEqual({ id: 'u2' })
  })

  it('FUNCIONARIO em rota de ADMIN: 403; ADMIN: 200', async () => {
    const app = await buildTestApp()
    getAuthenticatedUser.mockResolvedValue(funcionario)
    expect((await app.inject('/admin')).statusCode).toBe(403)
    getAuthenticatedUser.mockResolvedValue(admin)
    expect((await app.inject('/admin')).statusCode).toBe(200)
  })

  it('hook do plugin + requireAdmin da rota consultam a sessão uma única vez', async () => {
    getAuthenticatedUser.mockResolvedValue(admin)
    await (await buildTestApp()).inject('/admin')
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(1)
  })
})
