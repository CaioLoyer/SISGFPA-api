import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import {
  AuthApiError,
  changeCurrentUserPassword,
  updateCurrentUserName,
  verifyCurrentUserPassword,
} from '../auth/auth-api'
import { useSession } from '../auth/session-context'
import { PageHeader } from '../shared/PageHeader'
import './profile.css'

type PasswordDialogStep = 'verify' | 'change'

export function ProfilePage() {
  const { user, updateCurrentUserName: atualizarNomeNaSessao } = useSession()
  const [name, setName] = useState(user?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordStep, setPasswordStep] = useState<PasswordDialogStep>('verify')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const passwordTriggerRef = useRef<HTMLButtonElement>(null)
  const passwordDialogRef = useRef<HTMLElement>(null)
  const currentPasswordInputRef = useRef<HTMLInputElement>(null)
  const newPasswordInputRef = useRef<HTMLInputElement>(null)
  const passwordDialogWasOpenRef = useRef(false)

  useEffect(() => {
    if (passwordDialogOpen) {
      passwordDialogWasOpenRef.current = true
      const input = passwordStep === 'verify' ? currentPasswordInputRef.current : newPasswordInputRef.current
      input?.focus()
    } else if (passwordDialogWasOpenRef.current) {
      passwordTriggerRef.current?.focus()
      passwordDialogWasOpenRef.current = false
    }
  }, [passwordDialogOpen, passwordStep])

  if (!user) return null

  const userInitials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-BR')
  const roleLabel = user.role === 'ADMIN' ? 'Administrador' : 'Funcionário'

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameError('')
    setNameSaved(false)
    const normalizedName = name.trim()
    if (!normalizedName) {
      setNameError('Informe um nome.')
      return
    }

    setSavingName(true)
    try {
      await updateCurrentUserName(normalizedName)
      atualizarNomeNaSessao(normalizedName)
      setName(normalizedName)
      setNameSaved(true)
    } catch (caught) {
      setNameError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o nome.')
    } finally {
      setSavingName(false)
    }
  }

  function clearPasswordFields() {
    setCurrentPassword('')
    setNewPassword('')
    setPasswordConfirmation('')
    setPasswordError('')
  }

  function openPasswordDialog() {
    clearPasswordFields()
    setPasswordStep('verify')
    setPasswordSaved(false)
    setPasswordDialogOpen(true)
  }

  function closePasswordDialog() {
    if (savingPassword) return
    clearPasswordFields()
    setPasswordStep('verify')
    setPasswordDialogOpen(false)
  }

  async function handlePasswordVerificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSaved(false)
    setSavingPassword(true)
    try {
      await verifyCurrentUserPassword(currentPassword)
      setPasswordStep('change')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      setPasswordError(
        caught instanceof AuthApiError && message === 'Invalid password'
          ? 'A senha atual está incorreta.'
          : message || 'Não foi possível confirmar a senha atual.'
      )
      setCurrentPassword('')
    } finally {
      setSavingPassword(false)
    }
  }

  async function handlePasswordChangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSaved(false)
    if (newPassword !== passwordConfirmation) {
      setPasswordError('A confirmação não corresponde à nova senha.')
      return
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError('A nova senha deve ter de 8 a 128 caracteres.')
      return
    }

    setSavingPassword(true)
    try {
      await changeCurrentUserPassword({ currentPassword, newPassword })
      clearPasswordFields()
      setPasswordStep('verify')
      setPasswordDialogOpen(false)
      setPasswordSaved(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      if (caught instanceof AuthApiError && message === 'Invalid password') {
        clearPasswordFields()
        setPasswordStep('verify')
        setPasswordError('Confirme novamente sua senha atual para continuar.')
      } else {
        setPasswordError(message || 'Não foi possível alterar a senha.')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  function handlePasswordDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePasswordDialog()
      return
    }
    if (event.key !== 'Tab' || !passwordDialogRef.current) return

    const focusable = Array.from(
      passwordDialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    )
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return

    if (
      event.shiftKey &&
      (document.activeElement === first || !passwordDialogRef.current.contains(document.activeElement))
    ) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !passwordDialogRef.current.contains(document.activeElement))
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <section className="profile-page" aria-label="Meu perfil">
      <PageHeader
        title="Meu perfil"
        description="Gerencie seus dados pessoais e as informações de acesso à plataforma."
      />

      <div className="profile-content">
        <section className="profile-identity" aria-label="Conta conectada">
          <div className="profile-avatar" aria-hidden="true">
            {userInitials || 'U'}
          </div>
          <div className="profile-identity-copy">
            <span className="profile-overline">CONTA CONECTADA</span>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </div>
          <span className="profile-role">{roleLabel}</span>
        </section>

        <div className="profile-panels">
          <section className="profile-panel" aria-labelledby="profile-data-title">
            <div className="profile-panel-heading">
              <span className="profile-panel-icon" aria-hidden="true">
                01
              </span>
              <div>
                <h2 id="profile-data-title">Dados da conta</h2>
                <p>Atualize seu nome e consulte os dados vinculados ao seu acesso.</p>
              </div>
            </div>

            <div className="profile-readonly-grid">
              <div>
                <span>E-mail</span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>Tipo de usuário</span>
                <strong>{roleLabel}</strong>
              </div>
            </div>

            <form className="profile-form" onSubmit={(event) => void handleNameSubmit(event)}>
              <label className="field-label" htmlFor="profile-name">
                Nome
                <input
                  autoComplete="name"
                  id="profile-name"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              {nameError && (
                <p className="form-error" role="alert">
                  {nameError}
                </p>
              )}
              {nameSaved && (
                <p className="form-success" role="status">
                  Nome atualizado.
                </p>
              )}
              <button
                className="button button-primary"
                disabled={savingName || !name.trim() || name.trim() === user.name}
                type="submit"
              >
                {savingName ? 'Salvando…' : 'Salvar nome'}
              </button>
            </form>
          </section>

          <section className="profile-panel profile-security-panel" aria-labelledby="profile-password-title">
            <div className="profile-panel-heading">
              <span className="profile-panel-icon profile-panel-icon-security" aria-hidden="true">
                02
              </span>
              <div>
                <h2 id="profile-password-title">Segurança</h2>
                <p>Troque sua senha para manter sua conta protegida.</p>
              </div>
            </div>
            <p className="profile-security-note">
              Confirme sua senha atual para continuar. Sua sessão permanece conectada; as outras serão
              encerradas após a troca.
            </p>
            <div className="profile-security-actions">
              <button
                className="button button-primary"
                onClick={openPasswordDialog}
                ref={passwordTriggerRef}
                type="button"
              >
                Redefinir senha
              </button>
              {passwordSaved && (
                <p className="form-success" role="status">
                  Senha alterada. Esta sessão continua conectada; as outras foram encerradas.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {passwordDialogOpen && (
        <div
          className="profile-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePasswordDialog()
          }}
        >
          <section
            aria-describedby="profile-password-dialog-description"
            aria-labelledby="profile-password-dialog-title"
            aria-modal="true"
            className="profile-password-modal"
            onKeyDown={handlePasswordDialogKeyDown}
            ref={passwordDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="profile-password-modal-heading">
              <div>
                <span className="profile-overline">SEGURANÇA DA CONTA</span>
                <h2 id="profile-password-dialog-title">
                  {passwordStep === 'verify' ? 'Confirme sua senha atual' : 'Defina sua nova senha'}
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="profile-password-modal-close"
                disabled={savingPassword}
                onClick={closePasswordDialog}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="profile-password-modal-description" id="profile-password-dialog-description">
              {passwordStep === 'verify'
                ? 'A senha é confirmada com segurança pela API antes de liberar a próxima etapa.'
                : 'Digite uma senha de 8 a 128 caracteres e confirme para concluir a troca.'}
            </p>

            {passwordStep === 'verify' ? (
              <form
                className="profile-form profile-password-modal-form"
                onSubmit={(event) => void handlePasswordVerificationSubmit(event)}
              >
                <label className="field-label" htmlFor="profile-current-password">
                  Senha atual
                  <input
                    autoComplete="current-password"
                    id="profile-current-password"
                    maxLength={128}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    ref={currentPasswordInputRef}
                    required
                    type="password"
                    value={currentPassword}
                  />
                </label>
                {passwordError && (
                  <p className="form-error" role="alert">
                    {passwordError}
                  </p>
                )}
                <div className="profile-password-modal-actions">
                  <button
                    className="button button-secondary"
                    disabled={savingPassword}
                    onClick={closePasswordDialog}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button className="button button-primary" disabled={savingPassword} type="submit">
                    {savingPassword ? 'Confirmando…' : 'Continuar'}
                  </button>
                </div>
              </form>
            ) : (
              <form
                className="profile-form profile-password-modal-form"
                onSubmit={(event) => void handlePasswordChangeSubmit(event)}
              >
                <label className="field-label" htmlFor="profile-new-password">
                  Nova senha
                  <input
                    autoComplete="new-password"
                    id="profile-new-password"
                    maxLength={128}
                    minLength={8}
                    onChange={(event) => setNewPassword(event.target.value)}
                    ref={newPasswordInputRef}
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>
                <label className="field-label" htmlFor="profile-password-confirmation">
                  Confirme a nova senha
                  <input
                    autoComplete="new-password"
                    id="profile-password-confirmation"
                    maxLength={128}
                    minLength={8}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    required
                    type="password"
                    value={passwordConfirmation}
                  />
                </label>
                {passwordError && (
                  <p className="form-error" role="alert">
                    {passwordError}
                  </p>
                )}
                <div className="profile-password-modal-actions">
                  <button
                    className="button button-secondary"
                    disabled={savingPassword}
                    onClick={closePasswordDialog}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <div className="profile-password-modal-actions-end">
                    <button
                      className="button button-secondary"
                      disabled={savingPassword}
                      onClick={() => {
                        clearPasswordFields()
                        setPasswordStep('verify')
                      }}
                      type="button"
                    >
                      Voltar
                    </button>
                    <button className="button button-primary" disabled={savingPassword} type="submit">
                      {savingPassword ? 'Alterando…' : 'Alterar senha'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
