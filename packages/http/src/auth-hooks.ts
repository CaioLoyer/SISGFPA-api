import { type AuthenticatedUser, getAuthenticatedUser } from '@sisgfpa/auth'
import type { FastifyRequest } from 'fastify'

import { ForbiddenError, UnauthorizedError } from './errors.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo hook `requireAuth`. */
    user: AuthenticatedUser
  }
}

/** Hook `onRequest`: exige sessão válida (cookie do Better Auth) e disponibiliza `request.user`. */
export async function requireAuth(request: FastifyRequest) {
  const user = await getAuthenticatedUser(request.headers)
  if (!user) throw new UnauthorizedError()
  request.user = user
}

/** Hook `onRequest`: exige sessão válida e perfil ADMIN. A API é a única autoridade de autorização. */
export async function requireAdmin(request: FastifyRequest) {
  if (!request.user) await requireAuth(request) // evita 2ª consulta se um hook de plugin já autenticou
  if (request.user.role !== 'ADMIN') throw new ForbiddenError()
}
