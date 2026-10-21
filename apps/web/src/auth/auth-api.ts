import type { Role } from '@sisgfpa/types'

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: Role
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'AuthApiError'
  }
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) return undefined
  return typeof body.message === 'string' ? body.message : undefined
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/auth${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new AuthApiError('Não foi possível conectar à API Financeira.')
  }

  const rawBody = await response.text()
  let body: unknown = null
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      throw new AuthApiError('A API Financeira retornou uma resposta inválida.', response.status)
    }
  }

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'E-mail ou senha inválidos.'
        : response.status === 429
          ? 'Muitas tentativas. Aguarde um pouco e tente novamente.'
          : readMessage(body) || 'Não foi possível concluir a operação de autenticação.'
    throw new AuthApiError(message, response.status)
  }

  return body
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value && 'name' in value && 'email' in value && 'role' in value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    (value.role === 'ADMIN' || value.role === 'FUNCIONARIO')
  )
}

export async function signIn(email: string, password: string): Promise<void> {
  await request('/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const body = await request('/get-session')
  if (body === null) return null

  if (typeof body === 'object' && body !== null && 'user' in body) {
    const user = body.user
    if (isAuthenticatedUser(user)) return user
  }

  throw new AuthApiError('A API Financeira retornou uma sessão inválida.')
}

export async function signOut(): Promise<void> {
  await request('/sign-out', { method: 'POST' })
}
