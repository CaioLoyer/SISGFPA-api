import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({
  auth: undefined as any,
  requests: [] as Array<Record<string, any>>,
  users: new Map<string, { id: string; name: string; email: string }>(),
}))

vi.mock('@sisgfpa/auth', async () => {
  const { fromNodeHeaders } = await import('better-auth/node')
  return {
    get auth() {
      return testState.auth
    },
    fromNodeHeaders,
    isEmailRecoveryConfigured: () => false,
    getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
      const session = await testState.auth.api.getSession({ headers: fromNodeHeaders(headers) })
      if (!session) return null
      const { id, name, email, role } = session.user
      return { id, name, email, role }
    },
  }
})

vi.mock('@sisgfpa/database', () => {
  const matches = (request: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, expected]) => {
      if (key === 'status' && typeof expected === 'object' && 'in' in expected)
        return expected.in.includes(request.status)
      if (key === 'requestedAt' && typeof expected === 'object')
        return (
          (!expected.gte || request.requestedAt >= expected.gte) &&
          (!expected.lte || request.requestedAt <= expected.lte)
        )
      if (key === 'expiresAt' && typeof expected === 'object')
        return (
          (!expected.gt || request.expiresAt > expected.gt) &&
          (!expected.lte || request.expiresAt <= expected.lte)
        )
      return request[key] === expected
    })
  const applyUpdate = (request: Record<string, any>, data: Record<string, any>) => {
    Object.assign(request, data)
    return { ...request }
  }
  const passwordResetRequest = {
    create: async ({ data }: any) => {
      const request = { id: randomUUID(), ...data }
      testState.requests.push(request)
      return { ...request }
    },
    findFirst: async ({ where, orderBy }: any) => {
      const filtered = testState.requests.filter((request) => matches(request, where))
      if (orderBy?.requestedAt === 'desc')
        filtered.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      return filtered[0] ? { ...filtered[0] } : null
    },
    findMany: async ({ where }: any) =>
      testState.requests
        .filter((request) => matches(request, where))
        .map((request) => ({ ...request, requester: testState.users.get(request.requesterId) })),
    findUnique: async ({ where }: any) => {
      const request = testState.requests.find((item) => item.id === where.id)
      return request ? { ...request } : null
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const request = testState.requests.find((item) => item.id === where.id)
      if (!request) throw new Error('Solicitação não encontrada')
      return { ...request }
    },
    count: async ({ where }: any) => testState.requests.filter((request) => matches(request, where)).length,
    update: async ({ where, data }: any) => {
      const request = testState.requests.find((item) => item.id === where.id)
      if (!request) throw new Error('Solicitação não encontrada')
      return applyUpdate(request, data)
    },
    updateMany: async ({ where, data }: any) => {
      const filtered = testState.requests.filter((request) => matches(request, where))
      filtered.forEach((request) => applyUpdate(request, data))
      return { count: filtered.length }
    },
  }
  const prisma: any = {
    $queryRaw: async () => [],
    passwordResetRequest,
    $transaction: async (callback: (transaction: any) => unknown) => callback(prisma),
  }
  return { prisma }
})

const origin = 'http://localhost:8080'
const initialPassword = 'senha-inicial-123'
const resetPassword = 'senha-redefinida-456'

function cookieFrom(response: { headers: Record<string, unknown> }) {
  const value = response.headers['set-cookie']
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((cookie) => String(cookie).split(';')[0])
    .join('; ')
}

describe('solicitações administrativas de redefinição de senha', () => {
  let app: FastifyInstance
  let adminCookie = ''
  let funcionarioCookie = ''
  let funcionarioOtherCookie = ''
  let adminId = ''
  let funcionarioId = ''
  let funcionarioRequestId = ''
  let adminRequestId = ''

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = 'password-reset-regression-test-secret-with-more-than-32-chars'
    const [{ getTestInstance }, { openAPI }, { createSisgfpaAdminPlugin, emailAndPasswordOptions }] =
      await Promise.all([
        import('better-auth/test'),
        import('better-auth/plugins'),
        import('../../../../../packages/auth/src/account-config.js'),
      ])
    const instance = await getTestInstance(
      {
        baseURL: origin,
        basePath: '/api/auth',
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: [origin],
        emailAndPassword: emailAndPasswordOptions,
        plugins: [createSisgfpaAdminPlugin(), openAPI()],
      },
      { disableTestUser: true }
    )
    testState.auth = instance.auth
    testState.requests.length = 0
    testState.users.clear()

    const { createApp } = await import('@sisgfpa/http')
    const [{ authRoutes }, { usuariosRoutes }] = await Promise.all([
      import('../auth/auth.routes.js'),
      import('./usuarios.routes.js'),
    ])
    app = await createApp({
      title: 'API de teste',
      description: 'Teste de redefinição de senha',
      serverUrl: origin,
      trustedOrigins: [origin],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(authRoutes)
    await app.register(usuariosRoutes, { prefix: '/usuarios' })
    await app.ready()

    const admin = await instance.auth.api.createUser({
      body: {
        name: 'Admin Teste',
        email: 'admin-reset@example.test',
        password: initialPassword,
        role: 'ADMIN',
      },
    })
    const funcionario = await instance.auth.api.createUser({
      body: {
        name: 'Funcionária Teste',
        email: 'funcionario-reset@example.test',
        password: initialPassword,
        role: 'FUNCIONARIO',
      },
    })
    adminId = admin.user.id
    funcionarioId = funcionario.user.id
    testState.users.set(adminId, { id: adminId, name: admin.user.name, email: admin.user.email })
    testState.users.set(funcionarioId, {
      id: funcionarioId,
      name: funcionario.user.name,
      email: funcionario.user.email,
    })

    const login = async (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
        payload: { email, password: initialPassword },
      })
    adminCookie = cookieFrom(await login(admin.user.email))
    funcionarioCookie = cookieFrom(await login(funcionario.user.email))
  })

  afterAll(async () => {
    await app?.close()
  })

  it('documenta todos os endpoints do fluxo e exemplos dos corpos obrigatórios', async () => {
    const response = await app.inject({ method: 'GET', url: '/swagger.json' })
    expect(response.statusCode).toBe(200)
    const paths = response.json().paths
    expect(paths['/usuarios/me/redefinicao-senha']).toMatchObject({ get: {}, post: {} })
    const completionSchema =
      paths['/usuarios/me/redefinicao-senha/concluir'].post.requestBody.content['application/json'].schema
    expect(completionSchema.properties.grantToken.example).toBe('token-de-autorizacao-temporario')
    expect(completionSchema.properties.newPassword.example).toBe('senha-nova-123')
    expect(paths['/usuarios/redefinicoes-senha']).toMatchObject({ get: {} })
    expect(
      paths['/usuarios/redefinicoes-senha/{id}'].patch.requestBody.content['application/json'].schema
        .properties.decisao.example
    ).toBe('APROVAR')
  })

  it('exige sessão para pedir, recusa funcionários na fila administrativa e impede pedidos duplicados', async () => {
    const unauthenticated = await app.inject({ method: 'POST', url: '/usuarios/me/redefinicao-senha' })
    expect(unauthenticated.statusCode).toBe(401)

    const created = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie: funcionarioCookie },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ status: 'PENDENTE', grantToken: null })
    funcionarioRequestId = created.json().id

    const duplicate = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie: funcionarioCookie },
    })
    expect(duplicate.statusCode).toBe(409)

    const deniedList = await app.inject({
      method: 'GET',
      url: '/usuarios/redefinicoes-senha',
      headers: { cookie: funcionarioCookie },
    })
    expect(deniedList.statusCode).toBe(403)
  })

  it('ADMIN vê somente dados necessários, não consegue aprovar a própria solicitação e mantém sua sessão', async () => {
    const ownRequest = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie: adminCookie },
    })
    expect(ownRequest.statusCode).toBe(201)
    adminRequestId = ownRequest.json().id

    const pending = await app.inject({
      method: 'GET',
      url: '/usuarios/redefinicoes-senha',
      headers: { cookie: adminCookie },
    })
    expect(pending.statusCode).toBe(200)
    expect(pending.json().items).toHaveLength(2)
    expect(JSON.stringify(pending.json())).not.toContain('password')
    expect(pending.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requesterId: funcionarioId,
          requesterEmail: 'funcionario-reset@example.test',
        }),
      ])
    )

    const selfApproval = await app.inject({
      method: 'PATCH',
      url: `/usuarios/redefinicoes-senha/${adminRequestId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { decisao: 'APROVAR' },
    })
    expect(selfApproval.statusCode).toBe(400)

    const adminSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: adminCookie, host: 'localhost:8080', origin },
    })
    expect(adminSession.statusCode).toBe(200)
    expect(adminSession.json().user.id).toBe(adminId)
  })

  it('aprova outro usuário, rejeita autorização adulterada e usa o Better Auth para redefinir uma vez', async () => {
    const approval = await app.inject({
      method: 'PATCH',
      url: `/usuarios/redefinicoes-senha/${funcionarioRequestId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { decisao: 'APROVAR' },
    })
    expect(approval.statusCode).toBe(200)
    expect(approval.json()).toMatchObject({ status: 'APROVADA' })
    expect('grantToken' in approval.json()).toBe(false)

    const afterApproval = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: adminCookie, host: 'localhost:8080', origin },
    })
    expect(afterApproval.statusCode).toBe(200)

    const approvedStatus = await app.inject({
      method: 'GET',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie: funcionarioCookie },
    })
    expect(approvedStatus.statusCode).toBe(200)
    expect(approvedStatus.json()).toMatchObject({ status: 'APROVADA' })
    const grantToken = approvedStatus.json().grantToken as string
    expect(grantToken).toBeTruthy()

    const anotherLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { email: 'funcionario-reset@example.test', password: initialPassword },
    })
    funcionarioOtherCookie = cookieFrom(anotherLogin)
    expect(anotherLogin.statusCode).toBe(200)

    const invalidGrant = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha/concluir',
      headers: { cookie: funcionarioCookie, 'content-type': 'application/json' },
      payload: { grantToken: `${grantToken}x`, newPassword: resetPassword },
    })
    expect(invalidGrant.statusCode).toBe(400)

    const wrongSession = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha/concluir',
      headers: { cookie: funcionarioOtherCookie, 'content-type': 'application/json' },
      payload: { grantToken, newPassword: resetPassword },
    })
    expect(wrongSession.statusCode).toBe(400)

    const unauthorizedNativeReset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: {
        cookie: funcionarioCookie,
        host: 'localhost:8080',
        origin,
        'content-type': 'application/json',
      },
      payload: { token: grantToken, newPassword: resetPassword },
    })
    expect(unauthorizedNativeReset.statusCode).toBe(404)

    const completionAttempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: 'POST',
          url: '/usuarios/me/redefinicao-senha/concluir',
          headers: { cookie: funcionarioCookie, 'content-type': 'application/json' },
          payload: { grantToken, newPassword: resetPassword },
        })
      )
    )
    const completed = completionAttempts.find((attempt) => attempt.statusCode === 200)
    const rejectedDuplicate = completionAttempts.find((attempt) => attempt.statusCode !== 200)
    expect(completed).toBeTruthy()
    expect([400, 401, 409]).toContain(rejectedDuplicate?.statusCode)
    expect(completed.statusCode).toBe(200)
    expect(completed.json()).toEqual({ success: true })
    expect(testState.requests.find((request) => request.id === funcionarioRequestId)?.status).toBe(
      'CONSUMIDA'
    )

    const revokedSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: funcionarioCookie, host: 'localhost:8080', origin },
    })
    expect(revokedSession.body).toBe('null')
    const revokedOtherSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: funcionarioOtherCookie, host: 'localhost:8080', origin },
    })
    expect(revokedOtherSession.body).toBe('null')

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { email: 'funcionario-reset@example.test', password: resetPassword },
    })
    expect(newLogin.statusCode).toBe(200)

    const reuse = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha/concluir',
      headers: { cookie: cookieFrom(newLogin), 'content-type': 'application/json' },
      payload: { grantToken, newPassword: 'outra-senha-789' },
    })
    expect(reuse.statusCode).toBe(400)
  })

  it('permite recusar um pedido e mantém o resultado consultável pelo solicitante', async () => {
    const employeeLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { email: 'funcionario-reset@example.test', password: resetPassword },
    })
    const cookie = cookieFrom(employeeLogin)
    const newRequest = await app.inject({
      method: 'POST',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie },
    })
    expect(newRequest.statusCode).toBe(201)

    const denied = await app.inject({
      method: 'PATCH',
      url: `/usuarios/redefinicoes-senha/${newRequest.json().id}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { decisao: 'RECUSAR' },
    })
    expect(denied.statusCode).toBe(200)
    expect(denied.json().status).toBe('RECUSADA')

    const status = await app.inject({
      method: 'GET',
      url: '/usuarios/me/redefinicao-senha',
      headers: { cookie },
    })
    expect(status.json()).toMatchObject({ status: 'RECUSADA', grantToken: null })
  })

  it('expira um pedido antes de registrar a decisão administrativa', async () => {
    const request = testState.requests.find((item) => item.id === adminRequestId)
    expect(request).toBeTruthy()
    request!.expiresAt = new Date(Date.now() - 1_000)

    const expiredDecision = await app.inject({
      method: 'PATCH',
      url: `/usuarios/redefinicoes-senha/${adminRequestId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { decisao: 'RECUSAR' },
    })
    expect(expiredDecision.statusCode).toBe(409)
    expect(request?.status).toBe('EXPIRADA')
  })
})
