// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1', name: 'Maria da Silva', email: 'maria@example.test', role: 'FUNCIONARIO' as const },
  atualizarNome: vi.fn(),
  updateCurrentUserName: vi.fn(),
  verifyCurrentUserPassword: vi.fn(),
  changeCurrentUserPassword: vi.fn(),
  completeAdminPasswordReset: vi.fn(),
  getMyPasswordResetRequest: vi.fn(),
  requestAdminPasswordReset: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('../auth/session-context', () => ({
  useSession: () => ({
    user: state.user,
    updateCurrentUserName: state.atualizarNome,
    refresh: state.refresh,
  }),
}))
vi.mock('../auth/auth-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateCurrentUserName: state.updateCurrentUserName,
  verifyCurrentUserPassword: state.verifyCurrentUserPassword,
  changeCurrentUserPassword: state.changeCurrentUserPassword,
  completeAdminPasswordReset: state.completeAdminPasswordReset,
  getMyPasswordResetRequest: state.getMyPasswordResetRequest,
  requestAdminPasswordReset: state.requestAdminPasswordReset,
}))

import { AuthApiError } from '../auth/auth-api'
import { ProfilePage } from './ProfilePage'

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    )
  })
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label
  )
  expect(button, label).toBeTruthy()
  await act(async () => button!.click())
}

async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)
  expect(input, id).toBeTruthy()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  state.user = { id: 'user-1', name: 'Maria da Silva', email: 'maria@example.test', role: 'FUNCIONARIO' }
  state.atualizarNome.mockReset()
  state.updateCurrentUserName.mockReset()
  state.verifyCurrentUserPassword.mockReset().mockResolvedValue(undefined)
  state.changeCurrentUserPassword.mockReset().mockResolvedValue(undefined)
  state.completeAdminPasswordReset.mockReset().mockResolvedValue(undefined)
  state.getMyPasswordResetRequest.mockReset().mockResolvedValue(null)
  state.requestAdminPasswordReset.mockReset().mockResolvedValue({
    id: 'reset-1',
    status: 'PENDENTE',
    requestedAt: '2032-03-01T12:00:00.000Z',
    expiresAt: '2032-03-02T12:00:00.000Z',
    grantToken: null,
  })
  state.refresh.mockReset().mockResolvedValue(null)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('troca de senha pelo Perfil', () => {
  it('mantém os campos ocultos até abrir o popup e não avança com senha atual incorreta', async () => {
    state.verifyCurrentUserPassword.mockRejectedValueOnce(new AuthApiError('Invalid password', 400))
    await render()

    expect(container.querySelector('#profile-current-password')).toBeNull()
    expect(container.querySelector('#profile-new-password')).toBeNull()
    await click('Redefinir senha')
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()

    await fill('profile-current-password', 'errada')
    await click('Continuar')

    expect(state.verifyCurrentUserPassword).toHaveBeenCalledWith('errada')
    expect(container.textContent).toContain('A senha atual está incorreta.')
    expect(container.querySelector('#profile-new-password')).toBeNull()
    expect(container.querySelector<HTMLInputElement>('#profile-current-password')?.value).toBe('')
  })

  it('só permite enviar a nova senha após confirmação e mantém a sessão atual', async () => {
    await render()
    await click('Redefinir senha')
    await fill('profile-current-password', 'senha-atual-123')
    await click('Continuar')

    expect(state.verifyCurrentUserPassword).toHaveBeenCalledWith('senha-atual-123')
    expect(container.querySelector('#profile-current-password')).toBeNull()
    expect(container.querySelector('#profile-new-password')).toBeTruthy()

    await fill('profile-new-password', 'senha-nova-456')
    await fill('profile-password-confirmation', 'outra-senha-456')
    await click('Alterar senha')
    expect(container.textContent).toContain('A confirmação não corresponde à nova senha.')
    expect(state.changeCurrentUserPassword).not.toHaveBeenCalled()

    await fill('profile-new-password', 'curta12')
    await fill('profile-password-confirmation', 'curta12')
    await click('Alterar senha')
    expect(container.textContent).toContain('A nova senha deve ter de 8 a 128 caracteres.')
    expect(state.changeCurrentUserPassword).not.toHaveBeenCalled()

    await fill('profile-new-password', 'senha-nova-456')
    await fill('profile-password-confirmation', 'senha-nova-456')
    await click('Alterar senha')

    expect(state.changeCurrentUserPassword).toHaveBeenCalledWith({
      currentPassword: 'senha-atual-123',
      newPassword: 'senha-nova-456',
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain(
      'Senha alterada. Esta sessão continua conectada; as outras foram encerradas.'
    )
  })

  it('limpa os dados sensíveis ao cancelar o popup', async () => {
    await render()
    const trigger = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Redefinir senha'
    )!
    await click('Redefinir senha')
    await fill('profile-current-password', 'senha-atual-123')
    await click('Continuar')
    await fill('profile-new-password', 'senha-nova-456')
    await click('Cancelar')

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(state.verifyCurrentUserPassword).toHaveBeenCalledWith('senha-atual-123')

    await click('Redefinir senha')
    expect(container.querySelector<HTMLInputElement>('#profile-current-password')?.value).toBe('')
    expect(container.querySelector('#profile-new-password')).toBeNull()
  })

  it('solicita aprovação ao ADMIN, aguarda o status e envia a nova senha apenas após a liberação', async () => {
    state.getMyPasswordResetRequest.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'reset-1',
      status: 'APROVADA',
      requestedAt: '2032-03-01T12:00:00.000Z',
      expiresAt: '2032-03-01T12:10:00.000Z',
      grantToken: 'grant-token',
    })
    await render()
    await click('Redefinir senha')
    await click('Solicitar autorização ao ADMIN')
    expect(container.textContent).toContain('Não há solicitação ativa')
    expect(state.requestAdminPasswordReset).not.toHaveBeenCalled()

    await click('Solicitar autorização')
    expect(state.requestAdminPasswordReset).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('O pedido foi enviado')
    expect(container.querySelector('#profile-new-password')).toBeNull()

    await click('Atualizar status')
    expect(container.querySelector('#profile-new-password')).toBeTruthy()
    await fill('profile-new-password', 'senha-nova-456')
    await fill('profile-password-confirmation', 'senha-nova-456')
    const submit = container.querySelector<HTMLButtonElement>(
      '.profile-password-modal-actions-end .button-primary'
    )
    expect(submit?.textContent).toContain('Redefinir senha')
    await act(async () => submit?.click())

    expect(state.completeAdminPasswordReset).toHaveBeenCalledWith({
      grantToken: 'grant-token',
      newPassword: 'senha-nova-456',
    })
    expect(state.changeCurrentUserPassword).not.toHaveBeenCalled()
    expect(state.refresh).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
