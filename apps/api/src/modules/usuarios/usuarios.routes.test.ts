import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({
  auth: undefined as any,
  users: new Map<string, { id: string }>(),
}))

vi.mock('@sisgfpa/auth', async () => {
  const { fromNodeHeaders } = await import('better-auth/node')
  return {
    get auth() {
      return testState.auth
    },
    fromNodeHeaders,
    getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
      const session = await testState.auth.api.getSession({ headers: fromNodeHeaders(headers) })
      if (!session) return null
      const { id, name, email, role } = session.user
      return { id, name, email, role }
    },
  }
})

vi.mock('@sisgfpa/database', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        const user = testState.users.get(where.email)
        return user ? { id: user.id, email: where.email } : null
      },
    },
  },
}))

const origin = 'http://localhost:8080'
const password = 'senha-inicial-123'
const adminEmail = 'admin@regression.test'
const existingFuncionarioEmail = 'funcionario@regression.test'
const createdFuncionarioEmail = 'novo-funcionario@regression.test'

describe('criação administrativa de contas', () => {
  let app: FastifyInstance
  let adminCookie = ''
  let funcionarioCookie = ''
  let createResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let unauthenticatedCreateResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let publicSignupResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let genericAdminResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioCreateResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminRoleInjectionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminSessionAfterCreation: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioLoginResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioSession: Awaited<ReturnType<FastifyInstance['inject']>>

  beforeAll(async () => {
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
        secret: 'better-auth-regression-test-secret-long-enough-123456',
        trustedOrigins: [origin],
        emailAndPassword: emailAndPasswordOptions,
        plugins: [createSisgfpaAdminPlugin(), openAPI()],
      },
      { disableTestUser: true }
    )
    testState.auth = instance.auth

    const { createApp } = await import('@sisgfpa/http')
    const [{ authRoutes }, { usuariosRoutes }] = await Promise.all([
      import('../auth/auth.routes.js'),
      import('./usuarios.routes.js'),
    ])
    app = await createApp({
      title: 'API de teste',
      description: 'Teste de regressão do fluxo de contas',
      serverUrl: origin,
      trustedOrigins: [origin],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(authRoutes)
    await app.register(usuariosRoutes, { prefix: '/usuarios' })
    await app.ready()

    const admin = await instance.auth.api.createUser({
      body: { name: 'Admin Regression', email: adminEmail, password, role: 'ADMIN' },
    })
    testState.users.set(adminEmail, { id: admin.user.id })
    const funcionario = await instance.auth.api.createUser({
      body: {
        name: 'Funcionario Regression',
        email: existingFuncionarioEmail,
        password,
        role: 'FUNCIONARIO',
      },
    })
    testState.users.set(existingFuncionarioEmail, { id: funcionario.user.id })

    const login = async (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
        payload: { email, password },
      })
    const responseCookie = (response: Awaited<ReturnType<FastifyInstance['inject']>>) => {
      const value = response.headers['set-cookie']
      return (Array.isArray(value) ? value : value ? [value] : [])
        .map((cookie) => cookie.split(';')[0])
        .join('; ')
    }

    adminCookie = responseCookie(await login(adminEmail))
    funcionarioCookie = responseCookie(await login(existingFuncionarioEmail))
    expect(adminCookie).not.toBe('')
    expect(funcionarioCookie).not.toBe('')

    publicSignupResult = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { name: 'Cadastro Público', email: 'publico@regression.test', password },
    })

    genericAdminResult = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/create-user',
      headers: { host: 'localhost:8080', origin, cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Outro Admin', email: 'outro-admin@regression.test', password, role: 'ADMIN' },
    })

    unauthenticatedCreateResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Sem sessão', email: 'sem-sessao@regression.test', password },
    })

    funcionarioCreateResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: funcionarioCookie, 'content-type': 'application/json' },
      payload: { name: 'Não autorizado', email: 'nao-autorizado@regression.test', password },
    })

    adminRoleInjectionResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Papel Injetado', email: 'papel-injetado@regression.test', password, role: 'ADMIN' },
    })

    createResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Novo Funcionário', email: createdFuncionarioEmail, password },
    })
    const createdUser = createResult.json()
    testState.users.set(createdFuncionarioEmail, { id: createdUser.id })

    adminSessionAfterCreation = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { host: 'localhost:8080', origin, cookie: adminCookie },
    })
    funcionarioLoginResult = await login(createdFuncionarioEmail)
    funcionarioSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: {
        host: 'localhost:8080',
        origin,
        cookie: responseCookie(funcionarioLoginResult),
      },
    })
  }, 30_000)

  afterAll(async () => {
    await app?.close()
  })

  it('nega cadastro público e não expõe o create-user genérico do plugin', () => {
    expect(publicSignupResult.statusCode).toBeGreaterThanOrEqual(400)
    expect(genericAdminResult.statusCode).toBe(404)
  })

  it('impede FUNCIONARIO de criar contas', () => {
    expect(unauthenticatedCreateResult.statusCode).toBe(401)
    expect(funcionarioCreateResult.statusCode).toBe(403)
  })

  it('permite ADMIN criar somente FUNCIONARIO, sem substituir sua sessão', () => {
    expect(adminRoleInjectionResult.statusCode).toBe(400)
    expect(createResult.statusCode).toBe(201)
    expect(createResult.json()).toMatchObject({ email: createdFuncionarioEmail, role: 'FUNCIONARIO' })
    expect(createResult.headers['set-cookie']).toBeUndefined()
    expect(adminSessionAfterCreation.statusCode).toBe(200)
    expect(adminSessionAfterCreation.json().user).toMatchObject({ email: adminEmail, role: 'ADMIN' })
  })

  it('cria uma credencial que pode fazer login como FUNCIONARIO', () => {
    expect(funcionarioLoginResult.statusCode).toBe(200)
    expect(funcionarioSession.statusCode).toBe(200)
    expect(funcionarioSession.json().user).toMatchObject({
      email: createdFuncionarioEmail,
      role: 'FUNCIONARIO',
    })
  })
})
