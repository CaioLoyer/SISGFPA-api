import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AuthApiError,
  changeCurrentUserPassword,
  completeAdminPasswordReset,
  createFuncionario,
  decideAdminPasswordResetRequest,
  getCurrentUser,
  getCurrentPermissions,
  getMyPasswordResetRequest,
  listAdminPasswordResetRequests,
  listUsuariosAdministracao,
  listFuncionarios,
  promoverFuncionario,
  requestPasswordRecoveryCode,
  requestAdminPasswordReset,
  resetPasswordWithCode,
  signIn,
  signOut,
  updateCurrentUserName,
  updateFuncionarioPermissoes,
  verifyCurrentUserPassword,
} from './auth-api'

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

  it('atualiza somente o nome próprio pelo endpoint Better Auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateCurrentUserName('Nome atualizado')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/update-user',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ name: 'Nome atualizado' }),
      })
    )
  })

  it('altera a senha própria e solicita revogação das outras sessões', async () => {
    const user = { id: 'u1', name: 'Funcionária', email: 'func@example.com', role: 'FUNCIONARIO' }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: 'nova-sessao', user }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      changeCurrentUserPassword({ currentPassword: 'senha-atual', newPassword: 'senha-nova-123' })
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: 'senha-atual',
          newPassword: 'senha-nova-123',
          revokeOtherSessions: true,
        }),
      })
    )
  })

  it('confirma a senha atual pelo endpoint sensível do Better Auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyCurrentUserPassword('senha-atual')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/verify-password',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ password: 'senha-atual' }),
      })
    )
  })

  it('solicita e valida o código de recuperação pelas rotas Better Auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestPasswordRecoveryCode('maria@example.com')).resolves.toBeUndefined()
    await expect(
      resetPasswordWithCode({
        email: 'maria@example.com',
        otp: '123456',
        password: 'nova-senha-123',
      })
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/api/auth/email-otp/request-password-reset',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'maria@example.com' }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/api/auth/email-otp/reset-password',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'maria@example.com', otp: '123456', password: 'nova-senha-123' }),
      })
    )
  })

  it('traduz indisponibilidade uniforme do serviço de recuperação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Recuperação de senha indisponível no momento.',
            code: 'EMAIL_RECOVERY_UNAVAILABLE',
          }),
          { status: 503 }
        )
      )
    )

    await expect(requestPasswordRecoveryCode('maria@example.com')).rejects.toMatchObject({
      message: 'Recuperação de senha indisponível no momento.',
      status: 503,
    })
  })

  it('cadastra funcionário na rota administrativa sem enviar papel e preserva cookies', async () => {
    const created = { id: 'u2', name: 'Nova funcionária', email: 'nova@example.com', role: 'FUNCIONARIO' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createFuncionario({ name: 'Nova funcionária', email: 'nova@example.com', password: 'senha-segura' })
    ).resolves.toEqual(created)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/usuarios/funcionarios',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          name: 'Nova funcionária',
          email: 'nova@example.com',
          password: 'senha-segura',
        }),
      })
    )
  })

  it('apresenta erro de conflito retornado ao cadastrar e-mail já utilizado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Já existe uma conta com este e-mail', code: 'USER_ALREADY_EXISTS' }),
          {
            status: 409,
          }
        )
      )
    )

    await expect(
      createFuncionario({ name: 'Funcionário', email: 'existente@example.com', password: 'senha-segura' })
    ).rejects.toMatchObject({ message: 'Já existe uma conta com este e-mail', status: 409 })
  })

  it('carrega permissões de funcionários e salva as alterações no endpoint administrativo', async () => {
    const item = {
      id: 'func-1',
      name: 'Funcionária',
      email: 'func@example.com',
      createdAt: '2026-10-21T12:00:00.000Z',
      permissoes: { comercial: true, despesas: true, recebimentos: false, relatorios: false },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            funcionarioId: item.id,
            permissoes: { comercial: false, despesas: false, recebimentos: false, relatorios: false },
          }),
          {
            status: 200,
          }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listFuncionarios()).resolves.toEqual([item])
    await expect(
      updateFuncionarioPermissoes(item.id, {
        comercial: false,
        despesas: false,
        recebimentos: false,
        relatorios: false,
      })
    ).resolves.toEqual({ comercial: false, despesas: false, recebimentos: false, relatorios: false })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/usuarios/funcionarios')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:8080/usuarios/funcionarios/${item.id}/permissoes`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ comercial: false, despesas: false, recebimentos: false, relatorios: false }),
      })
    )
  })
})

describe('permissões efetivas da própria sessão', () => {
  it('consulta o catálogo completo autenticado', async () => {
    const permissions = {
      comercial: false,
      despesas: false,
      recebimentos: true,
      relatorios: true,
      caixa: false,
      administracao: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(permissions)))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getCurrentPermissions()).resolves.toEqual(permissions)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/usuarios/me/permissoes',
      expect.objectContaining({ credentials: 'include' })
    )
  })
  it('recusa respostas incompletas em vez de presumir acesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ despesas: true }))))
    await expect(getCurrentPermissions()).rejects.toThrow('permissões em formato inválido')
  })
})

describe('gestão de papéis na área ADMIN', () => {
  it('carrega funcionários e administradores sem presumir papel para registros inválidos', async () => {
    const accounts = [
      {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.com',
        createdAt: '2032-03-01T12:00:00.000Z',
        role: 'ADMIN',
      },
      {
        id: 'func-1',
        name: 'Funcionário',
        email: 'func@example.com',
        createdAt: '2032-03-02T12:00:00.000Z',
        role: 'FUNCIONARIO',
        permissoes: { comercial: true, despesas: true, recebimentos: false, relatorios: false },
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: accounts })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listUsuariosAdministracao()).resolves.toEqual(accounts)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/usuarios/contas',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('confirma a promoção pelo endpoint próprio e exige resposta com papel ADMIN', async () => {
    const promoted = {
      id: 'func-1',
      name: 'Funcionário',
      email: 'func@example.com',
      createdAt: '2032-03-02T12:00:00.000Z',
      role: 'ADMIN',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(promoted)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(promoverFuncionario('func-1')).resolves.toEqual(promoted)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/usuarios/funcionarios/func-1/promover',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...promoted, role: 'FUNCIONARIO' })))
    )
    await expect(promoverFuncionario('func-1')).rejects.toThrow('não confirmou a promoção')
  })
})

describe('aprovação administrativa de redefinição de senha', () => {
  it('usa as rotas próprias para solicitar, acompanhar, concluir e decidir pedidos', async () => {
    const request = {
      id: 'request-1',
      status: 'APROVADA',
      requestedAt: '2032-03-01T12:00:00.000Z',
      expiresAt: '2032-03-01T12:10:00.000Z',
      grantToken: 'grant-token',
    }
    const pending = {
      id: 'request-2',
      requesterId: 'user-2',
      requesterName: 'Funcionário',
      requesterEmail: 'func@example.com',
      requestedAt: '2032-03-01T12:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...request, status: 'PENDENTE', grantToken: null }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(request), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [pending] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: pending.id, status: 'APROVADA' }), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestAdminPasswordReset()).resolves.toMatchObject({ status: 'PENDENTE', grantToken: null })
    await expect(getMyPasswordResetRequest()).resolves.toEqual(request)
    await expect(
      completeAdminPasswordReset({ grantToken: 'grant-token', newPassword: 'senha-nova-123' })
    ).resolves.toBeUndefined()
    await expect(listAdminPasswordResetRequests()).resolves.toEqual([pending])
    await expect(decideAdminPasswordResetRequest(pending.id, 'APROVAR')).resolves.toBeUndefined()

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['http://localhost:8080/usuarios/me/redefinicao-senha', 'POST'],
      ['http://localhost:8080/usuarios/me/redefinicao-senha', undefined],
      ['http://localhost:8080/usuarios/me/redefinicao-senha/concluir', 'POST'],
      ['http://localhost:8080/usuarios/redefinicoes-senha', undefined],
      ['http://localhost:8080/usuarios/redefinicoes-senha/request-2', 'PATCH'],
    ])
  })

  it('rejeita resposta de solicitação sem token/status válido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'request-1' }), { status: 201 }))
    )
    await expect(requestAdminPasswordReset()).rejects.toThrow('solicitação em formato inválido')
  })
})
