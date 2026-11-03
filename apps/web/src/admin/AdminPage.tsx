import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { canAccessAdmin } from '../auth/protected-route'
import { createFuncionario, listFuncionarios, updateFuncionarioPermissoes } from '../auth/auth-api'
import type { FuncionarioAdmin, FuncionarioPermissoes } from '../auth/auth-api'
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
        description="Cadastre funcionários e gerencie o acesso às áreas financeiras."
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
  const [funcionarios, setFuncionarios] = useState<FuncionarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [retryVersion, setRetryVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedId, setSavedId] = useState('')
  const [savingId, setSavingId] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    void listFuncionarios()
      .then((items) => {
        if (active) setFuncionarios(items)
      })
      .catch((caught: unknown) => {
        if (active)
          setLoadError(
            caught instanceof Error ? caught.message : 'Não foi possível carregar os funcionários.'
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshKey, retryVersion])

  function changePermission(funcionarioId: string, key: keyof FuncionarioPermissoes, enabled: boolean) {
    setFuncionarios((current) =>
      current.map((funcionario) =>
        funcionario.id === funcionarioId
          ? { ...funcionario, permissoes: { ...funcionario.permissoes, [key]: enabled } }
          : funcionario
      )
    )
    setSavedId('')
    setSaveError('')
  }

  async function savePermissions(funcionario: FuncionarioAdmin) {
    setSavingId(funcionario.id)
    setSaveError('')
    setSavedId('')
    try {
      const permissoes = await updateFuncionarioPermissoes(funcionario.id, funcionario.permissoes)
      setFuncionarios((current) =>
        current.map((item) => (item.id === funcionario.id ? { ...item, permissoes } : item))
      )
      setSavedId(funcionario.id)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Não foi possível salvar as permissões.')
    } finally {
      setSavingId('')
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
          <h2 id="employee-permissions-title">Funcionários e permissões</h2>
          <p>O acesso é definido por funcionário para cada módulo financeiro.</p>
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
      {loading ? (
        <p className="admin-list-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Carregando funcionários…
        </p>
      ) : loadError ? null : funcionarios.length === 0 ? (
        <p className="admin-list-state">Ainda não há funcionários cadastrados.</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-employee-table">
            <thead>
              <tr>
                <th scope="col">Funcionário</th>
                <th scope="col">Contas a pagar</th>
                <th scope="col">Contas a receber</th>
                <th scope="col">
                  <span className="admin-screen-reader">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((funcionario) => (
                <tr key={funcionario.id}>
                  <th scope="row">
                    <div className="admin-employee-identity">
                      <span className="admin-employee-avatar" aria-hidden="true">
                        {funcionario.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <span className="admin-employee-copy">
                        <strong>{funcionario.name}</strong>
                        <span>{funcionario.email}</span>
                      </span>
                      <span className="admin-role-pill">Funcionário</span>
                    </div>
                  </th>
                  <td data-label="Contas a pagar">
                    <label className="admin-switch">
                      <span className="admin-screen-reader">
                        Permitir contas a pagar para {funcionario.name}
                      </span>
                      <input
                        checked={funcionario.permissoes.despesas}
                        disabled={savingId === funcionario.id}
                        onChange={(event) =>
                          changePermission(funcionario.id, 'despesas', event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span className="admin-switch-track" aria-hidden="true" />
                    </label>
                  </td>
                  <td data-label="Contas a receber">
                    <label className="admin-switch">
                      <span className="admin-screen-reader">
                        Permitir contas a receber para {funcionario.name}
                      </span>
                      <input
                        checked={funcionario.permissoes.recebimentos}
                        disabled={savingId === funcionario.id}
                        onChange={(event) =>
                          changePermission(funcionario.id, 'recebimentos', event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span className="admin-switch-track" aria-hidden="true" />
                    </label>
                  </td>
                  <td data-label="Ações">
                    <div className="admin-row-action">
                      <button
                        className="button button-primary admin-save-button"
                        disabled={savingId === funcionario.id}
                        onClick={() => void savePermissions(funcionario)}
                        type="button"
                      >
                        {savingId === funcionario.id ? 'Salvando…' : 'Salvar'}
                      </button>
                      {savedId === funcionario.id && (
                        <span className="admin-saved" role="status">
                          Salvo
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="admin-permission-note">
        Cancelamentos, relatórios e administração continuam exclusivos de ADMIN.
      </p>
    </section>
  )
}
