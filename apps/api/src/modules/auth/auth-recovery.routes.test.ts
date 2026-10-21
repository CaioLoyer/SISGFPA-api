import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({
  auth: undefined as any,
  emailConfigured: false,
}))

vi.mock('@sisgfpa/auth', async () => {
  const { fromNodeHeaders } = await import('better-auth/node')
  return {
    get auth() {
      return testState.auth
    },
    fromNodeHeaders,
    isEmailRecoveryConfigured: () => testState.emailConfigured,
  }
})

const origin = 'http://localhost:8080'
const email = 'recuperacao@regression.test'
const oldPassword = 'senha-antiga-123'
const newPassword = 'senha-nova-456'

describe('recuperação de senha por código', () => {
  let app: FastifyInstance
  let auth: any
  const sentCodes: Array<{ email: string; otp: string }> = []

  beforeAll(async () => {
    const [
      { getTestInstance },
      { openAPI },
      { createSisgfpaAdminPlugin, createSisgfpaEmailOTPPlugin, emailAndPasswordOptions },
    ] = await Promise.all([
      import('better-auth/test'),
      import('better-auth/plugins'),
      import('../../../../../packages/auth/src/account-config.js'),
    ])

    const instance = await getTestInstance(
      {
        baseURL: origin,
        basePath: '/api/auth',
        secret: 'better-auth-recovery-regression-secret-long-enough-123456',
        trustedOrigins: [origin],
        emailAndPassword: emailAndPasswordOptions,
        plugins: [
          createSisgfpaAdminPlugin(),
          createSisgfpaEmailOTPPlugin(async ({ email: recipient, otp }) => {
            sentCodes.push({ email: recipient, otp })
          }),
          openAPI(),
        ],
      },
      { disableTestUser: true }
    )
    auth = instance.auth
    testState.auth = auth
    testState.emailConfigured = false

    const { createApp } = await import('@sisgfpa/http')
    const { authRoutes } = await import('./auth.routes.js')
    app = await createApp({
      title: 'API de teste',
      description: 'Teste do fluxo de recuperação de senha',
      serverUrl: origin,
      trustedOrigins: [origin],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(authRoutes)
    await app.ready()

    await auth.api.createUser({
      body: { name: 'Usuária Regression', email, password: oldPassword, role: 'FUNCIONARIO' },
    })
  }, 30_000)

  afterAll(async () => {
    await app?.close()
  })

  function post(url: string, payload: unknown) {
    return app.inject({
      method: 'POST',
      url,
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload,
    })
  }

  it('documenta as duas rotas de recuperação com exemplos de payload', () => {
    const spec = app.swagger() as { paths: Record<string, Record<string, any>> }
    const requestBody =
      spec.paths['/api/auth/email-otp/request-password-reset']?.post?.requestBody?.content?.[
        'application/json'
      ]?.schema
    const resetBody =
      spec.paths['/api/auth/email-otp/reset-password']?.post?.requestBody?.content?.['application/json']
        ?.schema

    expect(requestBody?.example).toEqual({ email: 'admin@sisgfpa.dev' })
    expect(resetBody?.example).toEqual({
      email: 'admin@sisgfpa.dev',
      otp: '123456',
      password: 'nova-senha-123',
    })
  })

  it('nega cadastro público e impede criar, consultar ou solicitar OTP por rotas auxiliares', async () => {
    const signup = await post('/api/auth/sign-up/email', {
      name: 'Conta indevida',
      email: 'publico@regression.test',
      password: oldPassword,
    })
    expect(signup.statusCode).toBeGreaterThanOrEqual(400)

    expect(
      (await post('/api/auth/email-otp/create-verification-otp', { email, type: 'forget-password' }))
        .statusCode
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/email-otp/get-verification-otp?email=recuperacao%40regression.test&type=forget-password',
          headers: { host: 'localhost:8080', origin },
        })
      ).statusCode
    ).toBe(404)
    expect((await post('/api/auth/request-password-reset', { email })).statusCode).toBe(404)
  })

  it('mantém resposta uniforme enquanto o envio SMTP não está configurado', async () => {
    const registered = await post('/api/auth/email-otp/request-password-reset', {
      email: email.toUpperCase(),
    })
    const unknown = await post('/api/auth/email-otp/request-password-reset', {
      email: 'inexistente@regression.test',
    })

    expect(registered.statusCode).toBe(503)
    expect(unknown.statusCode).toBe(503)
    expect(registered.body).toBe(unknown.body)
    expect(sentCodes).toHaveLength(0)
  })

  it('não revela se o e-mail existe e redefine a senha apenas com código válido de uso único', async () => {
    testState.emailConfigured = true
    const registered = await post('/api/auth/email-otp/request-password-reset', {
      email: email.toUpperCase(),
    })
    const unknown = await post('/api/auth/email-otp/request-password-reset', {
      email: 'inexistente@regression.test',
    })

    expect(registered.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(200)
    expect(registered.body).toBe(unknown.body)
    expect(sentCodes).toHaveLength(1)
    expect(sentCodes[0]).toMatchObject({ email })
    expect(sentCodes[0]?.otp).toMatch(/^\d{6}$/)

    const verificationIdentifier = `forget-password-otp-${email}`
    const authContext = await auth.$context
    const storedCode = await authContext.internalAdapter.findVerificationValue(verificationIdentifier)
    expect(storedCode.value).not.toContain(sentCodes[0]!.otp)
    await authContext.internalAdapter.updateVerificationByIdentifier(verificationIdentifier, {
      expiresAt: new Date(Date.now() - 1000),
    })
    const expiredCode = await post('/api/auth/email-otp/reset-password', {
      email,
      otp: sentCodes[0]!.otp,
      password: newPassword,
    })
    expect(expiredCode.statusCode).toBe(400)

    const resent = await post('/api/auth/email-otp/request-password-reset', { email })
    expect(resent.statusCode).toBe(200)
    expect(sentCodes).toHaveLength(2)

    const sessionBeforeReset = await post('/api/auth/sign-in/email', { email, password: oldPassword })
    expect(sessionBeforeReset.statusCode).toBe(200)
    const sessionCookie = sessionBeforeReset.headers['set-cookie']
    expect(sessionCookie).toBeDefined()

    const otp = sentCodes[1]!.otp

    const reset = await post('/api/auth/email-otp/reset-password', { email, otp, password: newPassword })
    expect(reset.statusCode).toBe(200)
    expect(reset.json()).toEqual({ success: true })

    const replay = await post('/api/auth/email-otp/reset-password', { email, otp, password: newPassword })
    expect(replay.statusCode).toBe(400)

    const oldLogin = await post('/api/auth/sign-in/email', { email, password: oldPassword })
    const newLogin = await post('/api/auth/sign-in/email', { email, password: newPassword })
    expect(oldLogin.statusCode).toBe(401)
    expect(newLogin.statusCode).toBe(200)

    const cookies = sessionCookie as string | string[]
    const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies])
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { host: 'localhost:8080', origin, cookie: cookieHeader },
    })
    expect(oldSession.json()).toBeNull()
  })
})
