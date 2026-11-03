import { useState } from 'react'
import type { FormEvent } from 'react'

import { AuthApiError, changeCurrentUserPassword, updateCurrentUserName } from '../auth/auth-api'
import { useSession } from '../auth/session-context'
import { PageHeader } from '../shared/PageHeader'
import './profile.css'

export function ProfilePage() {
  const { user, updateCurrentUserName: atualizarNomeNaSessao } = useSession()
  const [name, setName] = useState(user?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

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

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
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
      setCurrentPassword('')
      setNewPassword('')
      setPasswordConfirmation('')
      setPasswordSaved(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      setPasswordError(
        caught instanceof AuthApiError && message === 'Invalid password'
          ? 'A senha atual está incorreta.'
          : message || 'Não foi possível alterar a senha.'
      )
    } finally {
      setSavingPassword(false)
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
              Confirme a senha atual. Por segurança, as outras sessões da sua conta serão encerradas.
            </p>
            <form
              className="profile-form profile-password-form"
              onSubmit={(event) => void handlePasswordSubmit(event)}
            >
              <label className="field-label" htmlFor="profile-current-password">
                Senha atual
                <input
                  autoComplete="current-password"
                  id="profile-current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label className="field-label" htmlFor="profile-new-password">
                Nova senha
                <input
                  autoComplete="new-password"
                  id="profile-new-password"
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => setNewPassword(event.target.value)}
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
              {passwordSaved && (
                <p className="form-success" role="status">
                  Senha alterada. Esta sessão continua conectada; as outras foram encerradas.
                </p>
              )}
              <button className="button button-primary" disabled={savingPassword} type="submit">
                {savingPassword ? 'Alterando…' : 'Alterar senha'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </section>
  )
}
