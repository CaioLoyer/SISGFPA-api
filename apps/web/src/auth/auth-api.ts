import { MODULE_PERMISSION_KEYS } from '@sisgfpa/types'
import type { Role, ModulePermissions, EffectivePermissions } from '@sisgfpa/types'
import { notifyPermissionDenied } from './module-access'

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

export type FuncionarioPermissoes = ModulePermissions

export interface FuncionarioAdmin {
  id: string
  name: string
  email: string
  createdAt: string
  permissoes: FuncionarioPermissoes
}

interface UsuarioAdministracaoBase {
  id: string
  name: string
  email: string
  createdAt: string
}

export type UsuarioAdministracao =
  | (UsuarioAdministracaoBase & { role: 'ADMIN' })
  | (UsuarioAdministracaoBase & { role: 'FUNCIONARIO'; permissoes: FuncionarioPermissoes })

export interface PromotedAdmin extends UsuarioAdministracaoBase {
  role: 'ADMIN'
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
  if (typeof body !== 'object' || body === null) return undefined
  if ('message' in body && typeof body.message === 'string') return body.message
  if ('error' in body && typeof body.error === 'string') return body.error
  return undefined
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
    notifyPermissionDenied(response.status)
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

export async function updateCurrentUserName(name: string): Promise<void> {
  const body = await request(`${apiBaseUrl}/api/auth/update-user`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  if (typeof body !== 'object' || body === null || !('status' in body) || body.status !== true) {
    throw new AuthApiError('A API Financeira não confirmou a atualização do nome.')
  }
}

export async function changeCurrentUserPassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  const body = await request(`${apiBaseUrl}/api/auth/change-password`, {
    method: 'POST',
    body: JSON.stringify({ ...input, revokeOtherSessions: true }),
  })

  if (typeof body !== 'object' || body === null || !('user' in body) || !isAuthenticatedUser(body.user)) {
    throw new AuthApiError('A API Financeira retornou uma resposta inválida ao alterar a senha.')
  }
}

export async function requestPasswordRecoveryCode(email: string): Promise<void> {
  const body = await request(`${apiBaseUrl}/api/auth/email-otp/request-password-reset`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (typeof body !== 'object' || body === null || !('success' in body) || body.success !== true) {
    throw new AuthApiError('Não foi possível solicitar o código de recuperação.')
  }
}

export async function resetPasswordWithCode(input: {
  email: string
  otp: string
  password: string
}): Promise<void> {
  const body = await request(`${apiBaseUrl}/api/auth/email-otp/reset-password`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (typeof body !== 'object' || body === null || !('success' in body) || body.success !== true) {
    throw new AuthApiError('Não foi possível redefinir a senha. Confira o código e tente novamente.')
  }
}

export async function createFuncionario(input: {
  name: string
  email: string
  password: string
}): Promise<CreatedFuncionario> {
  const body = await request(`${apiBaseUrl}/usuarios/funcionarios`, {
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

function isModulePermissions(value: unknown): value is ModulePermissions {
  return (
    typeof value === 'object' &&
    value !== null &&
    MODULE_PERMISSION_KEYS.every(
      (key) => key in value && typeof value[key as keyof typeof value] === 'boolean'
    )
  )
}

export async function getCurrentPermissions(): Promise<EffectivePermissions> {
  const body = await request(`${apiBaseUrl}/usuarios/me/permissoes`)
  if (
    !isModulePermissions(body) ||
    !('caixa' in body) ||
    typeof body.caixa !== 'boolean' ||
    !('administracao' in body) ||
    typeof body.administracao !== 'boolean'
  )
    throw new AuthApiError('A API Financeira retornou as permissões em formato inválido.')
  return { ...body, caixa: body.caixa, administracao: body.administracao }
}

function isFuncionarioAdmin(value: unknown): value is FuncionarioAdmin {
  if (typeof value !== 'object' || value === null) return false
  if (!(
    'id' in value &&
    'name' in value &&
    'email' in value &&
    'createdAt' in value &&
    'permissoes' in value
  )) {
    return false
  }
  if (!isModulePermissions(value.permissoes)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    typeof value.createdAt === 'string'
  )
}

export async function listFuncionarios(): Promise<FuncionarioAdmin[]> {
  const body = await request(`${apiBaseUrl}/usuarios/funcionarios`)
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(isFuncionarioAdmin)
  ) {
    throw new AuthApiError('A API Financeira retornou a lista de funcionários em formato inválido.')
  }
  return body.items
}

function isUsuarioAdministracao(value: unknown): value is UsuarioAdministracao {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value && 'name' in value && 'email' in value && 'createdAt' in value && 'role' in value))
    return false
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.createdAt !== 'string'
  )
    return false
  if (value.role === 'ADMIN') return true
  return value.role === 'FUNCIONARIO' && 'permissoes' in value && isModulePermissions(value.permissoes)
}

export async function listUsuariosAdministracao(): Promise<UsuarioAdministracao[]> {
  const body = await request(`${apiBaseUrl}/usuarios/contas`)
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !body.items.every(isUsuarioAdministracao)
  ) {
    throw new AuthApiError('A API Financeira retornou a lista de contas em formato inválido.')
  }
  return body.items
}

export async function promoverFuncionario(funcionarioId: string): Promise<PromotedAdmin> {
  const body = await request(
    `${apiBaseUrl}/usuarios/funcionarios/${encodeURIComponent(funcionarioId)}/promover`,
    { method: 'POST' }
  )
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body && 'name' in body && 'email' in body && 'createdAt' in body && 'role' in body) ||
    typeof body.id !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.createdAt !== 'string' ||
    body.role !== 'ADMIN'
  ) {
    throw new AuthApiError('A API Financeira não confirmou a promoção para ADMIN.')
  }
  return {
    id: body.id,
    name: body.name,
    email: body.email,
    createdAt: body.createdAt,
    role: 'ADMIN',
  }
}

export async function updateFuncionarioPermissoes(
  funcionarioId: string,
  permissoes: FuncionarioPermissoes
): Promise<FuncionarioPermissoes> {
  const body = await request(
    `${apiBaseUrl}/usuarios/funcionarios/${encodeURIComponent(funcionarioId)}/permissoes`,
    { method: 'PATCH', body: JSON.stringify(permissoes) }
  )

  if (
    typeof body !== 'object' ||
    body === null ||
    !('permissoes' in body) ||
    !isModulePermissions(body.permissoes)
  ) {
    throw new AuthApiError('A API Financeira retornou as permissões em formato inválido.')
  }

  return body.permissoes
}
