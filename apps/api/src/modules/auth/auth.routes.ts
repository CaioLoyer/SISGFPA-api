import { auth, fromNodeHeaders, isEmailRecoveryConfigured } from '@sisgfpa/auth'
import { responses } from '@sisgfpa/http'
import { SignInBodySchema } from '@sisgfpa/validation'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

const RequestPasswordRecoveryBodySchema = z
  .object({ email: z.email().trim().toLowerCase() })
  .meta({ example: { email: 'admin@sisgfpa.dev' } })
const ResetPasswordWithCodeBodySchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    otp: z.string().length(6).meta({ example: '123456' }),
    password: z.string().min(8).max(128).meta({ example: 'nova-senha-123' }),
  })
  .meta({ example: { email: 'admin@sisgfpa.dev', otp: '123456', password: 'nova-senha-123' } })
const RecoveryRequestedSchema = z.object({ success: z.boolean() }).meta({ example: { success: true } })
const PasswordResetSchema = z.object({ success: z.boolean() }).meta({ example: { success: true } })
const emailOtpPrefix = '/api/auth/email-otp/'
const allowedEmailOtpPaths = new Set([
  '/api/auth/email-otp/request-password-reset',
  '/api/auth/email-otp/reset-password',
])

/** Repassa a requisição ao Better Auth (Fetch API) e devolve a resposta dele, incluindo Set-Cookie. */
async function encaminharParaAuth(request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url, `http://${request.headers.host}`)
  // O plugin admin habilita métodos internos usados pela API e pelo bootstrap CLI.
  // Suas rotas HTTP genéricas permitem criar ADMIN/alterar papéis, então nunca as exponha no curinga.
  let normalizedPath: string
  try {
    normalizedPath = decodeURIComponent(url.pathname).toLowerCase()
  } catch {
    return reply.code(404).send({ error: 'Rota não encontrada', code: 'NOT_FOUND' })
  }
  if (normalizedPath === '/api/auth/admin' || normalizedPath.startsWith('/api/auth/admin/')) {
    return reply.code(404).send({ error: 'Rota não encontrada', code: 'NOT_FOUND' })
  }

  if (normalizedPath.startsWith(emailOtpPrefix) && !allowedEmailOtpPaths.has(normalizedPath)) {
    return reply.code(404).send({ error: 'Rota não encontrada', code: 'NOT_FOUND' })
  }
  if (
    normalizedPath === '/api/auth/forget-password/email-otp' ||
    normalizedPath === '/api/auth/request-password-reset' ||
    normalizedPath === '/api/auth/reset-password' ||
    normalizedPath.startsWith('/api/auth/reset-password/')
  ) {
    return reply.code(404).send({ error: 'Rota não encontrada', code: 'NOT_FOUND' })
  }
  if (
    normalizedPath === '/api/auth/email-otp/request-password-reset' &&
    request.method === 'POST' &&
    !isEmailRecoveryConfigured()
  ) {
    return reply.code(503).send({
      error: 'Recuperação de senha indisponível no momento.',
      code: 'EMAIL_RECOVERY_UNAVAILABLE',
    })
  }

  const req = new Request(url.toString(), {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  })
  const response = await auth.handler(req)

  reply.status(response.status)
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && key !== 'content-length') reply.header(key, value)
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) reply.header('set-cookie', cookies)

  return reply.send(response.body ? await response.text() : null)
}

const SessionSchema = z.any().meta({
  example: {
    user: { id: 'u1', name: 'Administrador Demo', email: 'admin@sisgfpa.dev', role: 'ADMIN' },
    session: { id: 's1', expiresAt: '2026-10-07T12:00:00.000Z' },
  },
})

/**
 * Rotas de autenticação documentadas (Scalar). As rotas restantes de /api/auth/* passam
 * pela rota curinga, exceto pelas rotas administrativas internas do Better Auth. A API é o único ponto de login.
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/api/auth/sign-in/email',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Login',
        description:
          'Usuário de demonstração criado por `pnpm db:seed:demo` (ADMIN). O cookie de sessão vale para a API e para o Chatbot.',
        body: SignInBodySchema,
        response: { ...responses({ 200: z.any() }), 401: z.any() },
      },
    },
    encaminharParaAuth
  )

  app.post(
    '/api/auth/sign-out',
    { schema: { tags: ['Autenticação'], summary: 'Logout', response: responses({ 200: z.any() }) } },
    encaminharParaAuth
  )

  app.get(
    '/api/auth/get-session',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Sessão atual (null se não autenticado)',
        response: responses({ 200: SessionSchema }),
      },
    },
    encaminharParaAuth
  )

  app.post(
    '/api/auth/email-otp/request-password-reset',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Solicitar código de recuperação de senha',
        description:
          'Responde da mesma forma para contas existentes e inexistentes. O código tem seis dígitos, expira em cinco minutos e pode ser solicitado novamente até três vezes por minuto.',
        body: RequestPasswordRecoveryBodySchema,
        response: {
          200: RecoveryRequestedSchema,
          400: z.any(),
          429: z.any(),
          503: z.any(),
        },
      },
    },
    encaminharParaAuth
  )

  app.post(
    '/api/auth/email-otp/reset-password',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Redefinir senha com código',
        description:
          'Valida um código de uso único enviado por e-mail e redefine a senha pelo Better Auth. A redefinição encerra as sessões existentes da conta.',
        body: ResetPasswordWithCodeBodySchema,
        response: { 200: PasswordResetSchema, 400: z.any(), 403: z.any(), 429: z.any() },
      },
    },
    encaminharParaAuth
  )

  // Demais rotas do Better Auth (fora da documentação).
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    handler: encaminharParaAuth,
  })
}
