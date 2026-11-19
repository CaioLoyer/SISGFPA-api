import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AuthApiError,
  changeCurrentUserPassword,
  completeAdminPasswordReset,
  getMyPasswordResetRequest,
  requestAdminPasswordReset,
  updateCurrentUserName,
  verifyCurrentUserPassword,
} from '../auth/auth-api'
import type { PasswordResetRequest, PasswordResetRequestStatus } from '../auth/auth-api'
import { useSession } from '../auth/session-context'
import { PageHeader } from '../shared/PageHeader'
import './profile.css'

type PasswordDialogStep = 'verify' | 'change' | 'waiting' | 'approved'

export function ProfilePage() {
  const { user, updateCurrentUserName: atualizarNomeNaSessao, refresh } = useSession()
  const navigate = useNavigate()
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
  const [requestStatus, setRequestStatus] = useState<PasswordResetRequest | null>(null)
  const [grantToken, setGrantToken] = useState('')
  const [checkingRequest, setCheckingRequest] = useState(false)
  const [requestingAdmin, setRequestingAdmin] = useState(false)
  const [requestError, setRequestError] = useState('')
  const passwordTriggerRef = useRef<HTMLButtonElement>(null)
  const passwordDialogRef = useRef<HTMLElement>(null)
  const currentPasswordInputRef = useRef<HTMLInputElement>(null)
  const newPasswordInputRef = useRef<HTMLInputElement>(null)
  const passwordDialogWasOpenRef = useRef(false)

  useEffect(() => {
    if (passwordDialogOpen) {
      passwordDialogWasOpenRef.current = true
      const input =
        passwordStep === 'verify'
          ? currentPasswordInputRef.current
          : passwordStep === 'change' || passwordStep === 'approved'
            ? newPasswordInputRef.current
            : null
      if (input) input.focus()
      else passwordDialogRef.current?.focus()
    } else if (passwordDialogWasOpenRef.current) {
      passwordTriggerRef.current?.focus()
      passwordDialogWasOpenRef.current = false
    }
  }, [passwordDialogOpen, passwordStep])

  useEffect(() => {
    if (
      !passwordDialogOpen ||
      passwordStep !== 'waiting' ||
      requestStatus?.status !== 'PENDENTE' ||
      checkingRequest
    )
      return
    let active = true
    const checkStatus = async () => {
      try {
        const latest = await getMyPasswordResetRequest()
        if (!active || !latest) return
        setRequestStatus(latest)
        setRequestError('')
        if (latest.status === 'APROVADA' && latest.grantToken) {
          setGrantToken(latest.grantToken)
          setPasswordStep('approved')
        }
      } catch (caught) {
        if (active)
          setRequestError(
            caught instanceof Error ? caught.message : 'Não foi possível consultar a solicitação.'
          )
      }
    }
    const interval = window.setInterval(() => void checkStatus(), 10_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [checkingRequest, passwordDialogOpen, passwordStep, requestStatus?.status])

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
    setRequestError('')
    setGrantToken('')
  }

  function openPasswordDialog() {
    clearPasswordFields()
    setPasswordStep('verify')
    setRequestStatus(null)
    setPasswordSaved(false)
    setPasswordDialogOpen(true)
  }

  function closePasswordDialog() {
    if (savingPassword || requestingAdmin || checkingRequest) return
    clearPasswordFields()
    setPasswordStep('verify')
    setRequestStatus(null)
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
      if (passwordStep === 'approved') {
        if (!grantToken) {
          setPasswordError('A autorização expirou. Consulte novamente o status com o administrador.')
          setPasswordStep('waiting')
          return
        }
        await completeAdminPasswordReset({ grantToken, newPassword })
        setPasswordDialogOpen(false)
        await refresh()
        navigate('/login', { replace: true })
        return
      }
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

  async function openAdminResetFlow() {
    setPasswordError('')
    setRequestError('')
    setRequestStatus(null)
    setGrantToken('')
    setPasswordStep('waiting')
    setCheckingRequest(true)
    try {
      const latest = await getMyPasswordResetRequest()
      if (latest) {
        setRequestStatus(latest)
        if (latest.status === 'APROVADA' && latest.grantToken) {
          setGrantToken(latest.grantToken)
          setPasswordStep('approved')
        }
      }
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Não foi possível consultar a solicitação.')
    } finally {
      setCheckingRequest(false)
    }
  }

  async function submitAdminResetRequest() {
    setRequestError('')
    setRequestingAdmin(true)
    try {
      const createdRequest = await requestAdminPasswordReset()
      setRequestStatus(createdRequest)
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Não foi possível solicitar a redefinição.')
    } finally {
      setRequestingAdmin(false)
    }
  }

  async function refreshAdminResetStatus() {
    setRequestError('')
    setCheckingRequest(true)
    try {
      const latest = await getMyPasswordResetRequest()
      setRequestStatus(latest)
      if (latest?.status === 'APROVADA' && latest.grantToken) {
        setGrantToken(latest.grantToken)
        setPasswordStep('approved')
      }
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Não foi possível consultar a solicitação.')
    } finally {
      setCheckingRequest(false)
    }
  }

  function passwordRequestMessage(status: PasswordResetRequestStatus | undefined) {
    if (status === 'PENDENTE') return 'O pedido foi enviado. Aguarde a análise de um ADMIN.'
    if (status === 'APROVADA') return 'O ADMIN aprovou o pedido. Atualize o status para continuar.'
    if (status === 'RECUSADA') return 'O ADMIN recusou a solicitação. Você pode enviar um novo pedido.'
    if (status === 'EXPIRADA') return 'A solicitação expirou. Envie um novo pedido para continuar.'
    if (status === 'CONSUMIDA') return 'Esta autorização já foi utilizada. Se necessário, solicite novamente.'
    return 'Não há solicitação ativa. Você pode pedir autorização ao ADMIN.'
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
              Troque a senha com sua senha atual ou solicite autorização ao ADMIN. A redefinição aprovada
              encerra todas as sessões e direciona ao login.
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
                  {passwordStep === 'verify'
                    ? 'Confirme sua senha atual'
                    : passwordStep === 'waiting'
                      ? 'Autorização do administrador'
                      : 'Defina sua nova senha'}
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="profile-password-modal-close"
                disabled={savingPassword || requestingAdmin || checkingRequest}
                onClick={closePasswordDialog}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="profile-password-modal-description" id="profile-password-dialog-description">
              {passwordStep === 'verify'
                ? 'A senha é confirmada com segurança pela API antes de liberar a próxima etapa.'
                : passwordStep === 'waiting'
                  ? 'A senha nova só poderá ser informada depois que um ADMIN autorizar o pedido.'
                  : passwordStep === 'approved'
                    ? 'Defina a senha em até 10 minutos. Ao concluir, todas as sessões serão encerradas.'
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
                <button
                  className="profile-password-request-link"
                  disabled={savingPassword || checkingRequest}
                  onClick={() => void openAdminResetFlow()}
                  type="button"
                >
                  Solicitar autorização ao ADMIN
                </button>
              </form>
            ) : passwordStep === 'waiting' ? (
              <div className="profile-password-request-state">
                <p className="profile-password-request-status" role="status">
                  {checkingRequest
                    ? 'Consultando solicitação…'
                    : passwordRequestMessage(requestStatus?.status)}
                </p>
                {requestError && (
                  <p className="form-error" role="alert">
                    {requestError}
                  </p>
                )}
                <div className="profile-password-modal-actions">
                  <button
                    className="button button-secondary"
                    disabled={checkingRequest || requestingAdmin}
                    onClick={() => {
                      setPasswordStep('verify')
                      setRequestError('')
                    }}
                    type="button"
                  >
                    Voltar
                  </button>
                  <div className="profile-password-modal-actions-end">
                    {(requestStatus?.status === 'PENDENTE' ||
                      requestStatus?.status === 'APROVADA' ||
                      !requestStatus) && (
                      <button
                        className="button button-secondary"
                        disabled={checkingRequest || requestingAdmin}
                        onClick={() => void refreshAdminResetStatus()}
                        type="button"
                      >
                        Atualizar status
                      </button>
                    )}
                    {(!requestStatus ||
                      ['RECUSADA', 'EXPIRADA', 'CONSUMIDA'].includes(requestStatus.status)) && (
                      <button
                        className="button button-primary"
                        disabled={checkingRequest || requestingAdmin}
                        onClick={() => void submitAdminResetRequest()}
                        type="button"
                      >
                        {requestingAdmin ? 'Enviando…' : 'Solicitar autorização'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
                        setNewPassword('')
                        setPasswordConfirmation('')
                        setPasswordError('')
                        if (passwordStep === 'approved') {
                          setPasswordStep('waiting')
                          void refreshAdminResetStatus()
                        } else {
                          clearPasswordFields()
                          setPasswordStep('verify')
                        }
                      }}
                      type="button"
                    >
                      Voltar
                    </button>
                    <button className="button button-primary" disabled={savingPassword} type="submit">
                      {savingPassword
                        ? 'Alterando…'
                        : passwordStep === 'approved'
                          ? 'Redefinir senha'
                          : 'Alterar senha'}
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
