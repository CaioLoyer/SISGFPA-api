import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthApiError, getCurrentUser, signIn, signOut } from './auth-api'

afterEach(() => vi.unstubAllGlobals())

describe('cliente de autenticação da API Financeira', () => {
  it('envia e-mail e senha com cookies habilitados ao fazer login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: 'sessao' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await signIn('funcionario@example.com', 'senha-segura')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'funcionario@example.com', password: 'senha-segura' }),
      })
    )
  })

  it('restaura a sessão com o usuário e papel retornados pela API', async () => {
    const user = { id: 'u1', name: 'Funcionária', email: 'func@example.com', role: 'FUNCIONARIO' }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user, session: { id: 's1' } }), { status: 200 }))
    )

    await expect(getCurrentUser()).resolves.toEqual(user)
  })

  it('interpreta sessão ausente como usuário anônimo após expiração', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('null', { status: 200 })))

    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('traduz credenciais inválidas e encerra a sessão no endpoint real', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid email or password' }), { status: 401 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await signIn('nao@example.com', 'errada').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AuthApiError)
    expect(error).toMatchObject({
      message: 'E-mail ou senha inválidos.',
      status: 401,
    })
    await expect(signOut()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/api/auth/sign-out',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )
  })
})
