import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({ auth: undefined as any }))

vi.mock('@sisgfpa/auth', async () => {
  const { fromNodeHeaders } = await import('better-auth/node')
  return {
    get auth() {
      return testState.auth
    },
    fromNodeHeaders,
  }
})

const origin = 'http://localhost:8080'
const password = 'senha-inicial-123'
const changedPassword = 'senha-alterada-456'
const userEmail = 'perfil@regression.test'
const adminEmail = 'perfil-admin@regression.test'

describe('perfil e segurança da própria conta', () => {
  let app: FastifyInstance
  let userId = ''
  let adminId = ''
  let originalSession = ''
  let otherSession = ''
  let adminSession = ''

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
        secret: 'better-auth-profile-regression-secret-long-enough-123456',
        trustedOrigins: [origin],
        emailAndPassword: emailAndPasswordOptions,
        plugins: [createSisgfpaAdminPlugin(), openAPI()],
      },
      { disableTestUser: true }
    )
    testState.auth = instance.auth

    const { createApp } = await import('@sisgfpa/http')
    const { authRoutes } = await import('./auth.routes.js')
    app = await createApp({
      title: 'API de teste',
      description: 'Teste do perfil do usuário',
      serverUrl: origin,
      trustedOrigins: [origin],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(authRoutes)
    await app.ready()

    const user = await instance.auth.api.createUser({
      body: { name: 'Funcionária Original', email: userEmail, password, role: 'FUNCIONARIO' },
    })
    const admin = await instance.auth.api.createUser({
      body: { name: 'Administrador Original', email: adminEmail, password, role: 'ADMIN' },
    })
    userId = user.user.id
    adminId = admin.user.id

    originalSession = await signIn(userEmail)
    otherSession = await signIn(userEmail)
    adminSession = await signIn(adminEmail)
  }, 30_000)

  afterAll(async () => {
    await app?.close()
  })

  function cookieFrom(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
    const header = response.headers['set-cookie']
    return (Array.isArray(header) ? header : header ? [header] : [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
  }

  async function signIn(email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { email, password },
    })
    expect(response.statusCode).toBe(200)
    return cookieFrom(response)
  }

  function post(path: string, payload: unknown, cookie?: string) {
    return app.inject({
      method: 'POST',
      url: path,
      headers: {
        host: 'localhost:8080',
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      payload,
    })
  }

  function getSession(cookie: string) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { host: 'localhost:8080', origin, cookie },
    })
  }

  it('protege a atualização, permite alterar o próprio nome e rejeita e-mail ou papel', async () => {
    const unauthenticated = await post('/api/auth/update-user', { name: 'Sem sessão' })
    expect(unauthenticated.statusCode).toBe(401)

    const emailChange = await post(
      '/api/auth/update-user',
      { email: 'outro@regression.test' },
      originalSession
    )
    expect(emailChange.statusCode).toBe(400)

    const roleChange = await post('/api/auth/update-user', { role: 'ADMIN' }, originalSession)
    expect(roleChange.statusCode).toBe(400)

    const update = await post(
      '/api/auth/update-user',
      { name: 'Funcionária Atualizada', userId: adminId },
      originalSession
    )
    expect(update.statusCode).toBe(200)
    expect(update.json()).toEqual({ status: true })

    const updatedSession = await getSession(cookieFrom(update) || originalSession)
    expect(updatedSession.json().user).toMatchObject({
      id: userId,
      name: 'Funcionária Atualizada',
      email: userEmail,
      role: 'FUNCIONARIO',
    })
    expect((await getSession(adminSession)).json().user).toMatchObject({
      id: adminId,
      name: 'Administrador Original',
      role: 'ADMIN',
    })
  })

  it('altera a própria senha, mantém a sessão atual e encerra as demais', async () => {
    const unauthenticated = await post('/api/auth/change-password', {
      currentPassword: password,
      newPassword: changedPassword,
    })
    expect(unauthenticated.statusCode).toBe(401)

    const invalidCurrentPassword = await post(
      '/api/auth/change-password',
      { currentPassword: 'incorreta', newPassword: changedPassword },
      originalSession
    )
    expect(invalidCurrentPassword.statusCode).toBe(400)

    const changed = await post(
      '/api/auth/change-password',
      { currentPassword: password, newPassword: changedPassword, revokeOtherSessions: true },
      originalSession
    )
    expect(changed.statusCode).toBe(200)
    const activeSession = cookieFrom(changed)
    expect(activeSession).not.toBe('')
    expect((await getSession(activeSession)).json().user).toMatchObject({
      id: userId,
      role: 'FUNCIONARIO',
    })
    expect((await getSession(otherSession)).json()).toBeNull()

    const oldPasswordLogin = await post('/api/auth/sign-in/email', { email: userEmail, password })
    const newPasswordLogin = await post('/api/auth/sign-in/email', {
      email: userEmail,
      password: changedPassword,
    })
    expect(oldPasswordLogin.statusCode).toBe(401)
    expect(newPasswordLogin.statusCode).toBe(200)
  })
})
