import type { Role } from '@sisgfpa/types'

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface CreatedFuncionario {
  id: string
  name: string
  email: string
  role: 'FUNCIONARIO'
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

async function request(
  url: string,
  init?: RequestInit,
  options: { invalidCredentials?: boolean } = {}
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
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
        ? options.invalidCredentials
          ? 'E-mail ou senha inválidos.'
          : 'Sua sessão expirou. Entre novamente.'
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
  await request(
    `${apiBaseUrl}/api/auth/sign-in/email`,
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { invalidCredentials: true }
  )
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const body = await request(`${apiBaseUrl}/api/auth/get-session`)
  if (body === null) return null

  if (typeof body === 'object' && body !== null && 'user' in body) {
    const user = body.user
    if (isAuthenticatedUser(user)) return user
  }

  throw new AuthApiError('A API Financeira retornou uma sessão inválida.')
}

export async function signOut(): Promise<void> {
  await request(`${apiBaseUrl}/api/auth/sign-out`, { method: 'POST' })
}

export async function createFuncionario(input: {
  name: string
  email: string
  password: string
}): Promise<CreatedFuncionario> {
  const body = await request(`${apiBaseUrl}/api/usuarios/funcionarios`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body && 'name' in body && 'email' in body && 'role' in body) ||
    typeof body.id !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.email !== 'string' ||
    body.role !== 'FUNCIONARIO'
  ) {
    throw new AuthApiError('A API Financeira retornou os dados do funcionário em formato inválido.')
  }

  return { id: body.id, name: body.name, email: body.email, role: body.role }
}
