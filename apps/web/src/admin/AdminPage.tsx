import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { canAccessAdmin } from '../auth/protected-route'
import {
  createFuncionario,
  listUsuariosAdministracao,
  promoverFuncionario,
  updateFuncionarioPermissoes,
} from '../auth/auth-api'
import type { FuncionarioPermissoes, UsuarioAdministracao } from '../auth/auth-api'
import { useSession } from '../auth/session-context'
import { Icon } from '../shared/Icon'
import { PageHeader } from '../shared/PageHeader'
import './admin.css'

function AdminAccessDenied() {
  return (
    <section className="admin-content">
      <div className="admin-state" role="alert">
        <h2>Área exclusiva para ADMIN</h2>
        <p>Seu perfil não pode cadastrar funcionários nem alterar suas permissões.</p>
        <Link to="/dashboard">Voltar para a dashboard →</Link>
      </div>
    </section>
  )
}

export function AdminPage() {
  const { user } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshFuncionarios, setRefreshFuncionarios] = useState(0)

  if (!canAccessAdmin(user?.role)) return <AdminAccessDenied />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setCreated(null)
    setSubmitting(true)

    try {
      const funcionario = await createFuncionario({ name: name.trim(), email: email.trim(), password })
      setCreated({ name: funcionario.name, email: funcionario.email })
      setName('')
      setEmail('')
      setPassword('')
      setRefreshFuncionarios((version) => version + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o funcionário.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="admin-page">
      <PageHeader
        title="Painel de Administração"
        description="Cadastre funcionários, gerencie permissões e conceda acesso administrativo."
      />
      <div className="admin-content">
        <div className="admin-grid">
          <section className="admin-panel admin-create-panel" aria-labelledby="employee-form-title">
            <header className="admin-panel-heading">
              <span className="admin-heading-icon">
                <Icon name="user" />
              </span>
              <div>
                <h2 id="employee-form-title">Cadastrar funcionário</h2>
                <p>Crie uma nova conta para a equipe.</p>
              </div>
            </header>
            <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
              <label className="field-label" htmlFor="employee-name">
                Nome
                <input
                  autoComplete="name"
                  id="employee-name"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="field-label" htmlFor="employee-email">
                E-mail
                <input
                  autoComplete="email"
                  id="employee-email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="field-label" htmlFor="employee-password">
                Senha inicial
                <input
                  autoComplete="new-password"
                  id="employee-password"
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <p className="admin-form-hint">
                A senha deve ter de 8 a 128 caracteres. O tipo FUNCIONARIO é atribuído pelo servidor.
              </p>
              {error && (
                <p className="admin-alert admin-alert-error" role="alert">
                  {error}
                </p>
              )}
              {created && (
                <p className="admin-alert admin-alert-success" role="status">
                  Funcionário {created.name} ({created.email}) cadastrado.
                </p>
              )}
              <button
                className="button button-primary admin-create-button"
                disabled={submitting}
                type="submit"
              >
                {submitting ? 'Cadastrando…' : 'Cadastrar funcionário'}
              </button>
            </form>
          </section>
          <EmployeePermissionsPanel refreshKey={refreshFuncionarios} />
        </div>
      </div>
    </section>
  )
}

function EmployeePermissionsPanel({ refreshKey }: { refreshKey: number }) {
  const [usuarios, setUsuarios] = useState<UsuarioAdministracao[]>([])
  const [loading, setLoading] = useState(true)
  const [retryVersion, setRetryVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedId, setSavedId] = useState('')
  const [savingId, setSavingId] = useState('')
  const [promotionTargetId, setPromotionTargetId] = useState('')
  const [promotingId, setPromotingId] = useState('')
  const [promotionError, setPromotionError] = useState('')
  const [promotedId, setPromotedId] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    void listUsuariosAdministracao()
      .then((items) => {
        if (active) setUsuarios(items)
      })
      .catch((caught: unknown) => {
        if (active)
          setLoadError(caught instanceof Error ? caught.message : 'Não foi possível carregar as contas.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshKey, retryVersion])

  function changePermission(usuarioId: string, key: keyof FuncionarioPermissoes, enabled: boolean) {
    setUsuarios((current) =>
      current.map((usuario) => {
        if (usuario.id !== usuarioId || usuario.role !== 'FUNCIONARIO') return usuario
        return { ...usuario, permissoes: { ...usuario.permissoes, [key]: enabled } }
      })
    )
    setSavedId('')
    setSaveError('')
  }

  async function savePermissions(funcionario: Extract<UsuarioAdministracao, { role: 'FUNCIONARIO' }>) {
    setSavingId(funcionario.id)
    setSaveError('')
    setSavedId('')
    try {
      const permissoes = await updateFuncionarioPermissoes(funcionario.id, funcionario.permissoes)
      setUsuarios((current) =>
        current.map((item) => (item.id === funcionario.id ? { ...item, permissoes } : item))
      )
      setSavedId(funcionario.id)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Não foi possível salvar as permissões.')
    } finally {
      setSavingId('')
    }
  }

  async function confirmPromotion(funcionario: Extract<UsuarioAdministracao, { role: 'FUNCIONARIO' }>) {
    setPromotingId(funcionario.id)
    setPromotionError('')
    setPromotedId('')
    try {
      const promoted = await promoverFuncionario(funcionario.id)
      setUsuarios((current) => current.map((item) => (item.id === funcionario.id ? promoted : item)))
      setPromotionTargetId('')
      setPromotedId(funcionario.id)
    } catch (caught) {
      setPromotionError(caught instanceof Error ? caught.message : 'Não foi possível promover o funcionário.')
    } finally {
      setPromotingId('')
    }
  }

  function retryLoad() {
    setRetryVersion((version) => version + 1)
  }

  return (
    <section className="admin-panel admin-employees-panel" aria-labelledby="employee-permissions-title">
      <header className="admin-panel-heading">
        <span className="admin-heading-icon">
          <Icon name="settings" />
        </span>
        <div>
          <h2 id="employee-permissions-title">Contas da equipe e permissões</h2>
          <p>Gerencie acessos de funcionários e consulte as contas ADMIN.</p>
        </div>
      </header>
      {loadError && (
        <p className="admin-alert admin-alert-error" role="alert">
          {loadError}{' '}
          <button type="button" onClick={retryLoad}>
            Tentar novamente
          </button>
        </p>
      )}
      {saveError && (
        <p className="admin-alert admin-alert-error" role="alert">
          {saveError}
        </p>
      )}
      {promotionError && (
        <p className="admin-alert admin-alert-error" role="alert">
          {promotionError}
        </p>
      )}
      {loading ? (
        <p className="admin-list-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Carregando contas…
        </p>
      ) : loadError ? null : usuarios.length === 0 ? (
        <p className="admin-list-state">Ainda não há contas cadastradas.</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-employee-table">
            <thead>
              <tr>
                <th scope="col">Usuário</th>
                {['Comercial', 'Financeiro', 'Contas a pagar', 'Contas a receber', 'Relatórios'].map(
                  (label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  )
                )}
                <th scope="col">
                  <span className="admin-screen-reader">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <th scope="row">
                    <div className="admin-employee-identity">
                      <span className="admin-employee-avatar" aria-hidden="true">
                        {usuario.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <span className="admin-employee-copy">
                        <strong>{usuario.name}</strong>
                        <span>{usuario.email}</span>
                      </span>
                      <span
                        className={`admin-role-pill${usuario.role === 'ADMIN' ? ' admin-role-pill-admin' : ''}`}
                      >
                        {usuario.role === 'ADMIN' ? 'ADMIN' : 'Funcionário'}
                      </span>
                    </div>
                  </th>
                  {usuario.role === 'FUNCIONARIO' ? (
                    <>
                      {(
                        [
                          ['comercial', 'Comercial'],
                          ['financeiro', 'Financeiro'],
                          ['despesas', 'Contas a pagar'],
                          ['recebimentos', 'Contas a receber'],
                          ['relatorios', 'Relatórios'],
                        ] as const
                      ).map(([key, label]) => (
                        <td data-label={label} key={key}>
                          <label className="admin-switch">
                            <span className="admin-screen-reader">
                              Permitir {label.toLowerCase()} para {usuario.name}
                            </span>
                            <input
                              type="checkbox"
                              checked={
                                key === 'financeiro'
                                  ? usuario.permissoes.despesas && usuario.permissoes.recebimentos
                                  : usuario.permissoes[key]
                              }
                              disabled={savingId === usuario.id || promotingId === usuario.id}
                              onChange={(event) => {
                                const enabled = event.target.checked
                                if (key === 'financeiro') {
                                  changePermission(usuario.id, 'despesas', enabled)
                                  changePermission(usuario.id, 'recebimentos', enabled)
                                } else changePermission(usuario.id, key, enabled)
                              }}
                            />
                            <span className="admin-switch-track" aria-hidden="true" />
                          </label>
                        </td>
                      ))}
                      <td data-label="Ações">
                        <div className="admin-row-action">
                          <button
                            className="button button-primary admin-save-button"
                            disabled={savingId === usuario.id || promotingId === usuario.id}
                            onClick={() => void savePermissions(usuario)}
                            type="button"
                          >
                            {savingId === usuario.id ? 'Salvando…' : 'Salvar'}
                          </button>
                          {savedId === usuario.id && (
                            <span className="admin-saved" role="status">
                              Salvo
                            </span>
                          )}
                          {promotedId === usuario.id && (
                            <span className="admin-saved" role="status">
                              Papel ADMIN salvo
                            </span>
                          )}
                          {promotionTargetId === usuario.id ? (
                            <div
                              className="admin-promotion-confirm"
                              role="group"
                              aria-label={`Confirmar promoção de ${usuario.name}`}
                            >
                              <p>ADMIN terá acesso completo à plataforma. Confirma?</p>
                              <button
                                className="button button-primary admin-save-button"
                                disabled={promotingId === usuario.id}
                                onClick={() => void confirmPromotion(usuario)}
                                type="button"
                              >
                                {promotingId === usuario.id ? 'Promovendo…' : 'Confirmar promoção'}
                              </button>
                              <button
                                className="button button-secondary admin-save-button"
                                disabled={promotingId === usuario.id}
                                onClick={() => setPromotionTargetId('')}
                                type="button"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              className="button button-secondary admin-save-button admin-promote-button"
                              disabled={savingId === usuario.id || promotingId !== ''}
                              onClick={() => {
                                setPromotionTargetId(usuario.id)
                                setPromotionError('')
                                setPromotedId('')
                              }}
                              type="button"
                            >
                              Tornar ADMIN
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="admin-account-access" colSpan={5} data-label="Acesso">
                        Acesso completo de ADMIN
                      </td>
                      <td data-label="Ações">—</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="admin-permission-note">
        ADMIN possui acesso completo. Relatórios de funcionários mostram somente os tipos financeiros
        autorizados. Comercial gerencia clientes e fornecedores; Financeiro alterna pagar e receber em
        conjunto. Caixa e cancelamentos continuam exclusivos de ADMIN.
      </p>
    </section>
  )
}
