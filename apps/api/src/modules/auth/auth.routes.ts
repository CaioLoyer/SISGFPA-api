import { auth, fromNodeHeaders } from '@sisgfpa/auth'
import { responses } from '@sisgfpa/http'
import { SignInBodySchema } from '@sisgfpa/validation'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

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

  // Demais rotas do Better Auth (fora da documentação).
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    handler: encaminharParaAuth,
  })
}
