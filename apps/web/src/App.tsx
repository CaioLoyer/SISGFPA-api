import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'

import { canAccessAdmin, decideProtectedRoute, safeReturnPath } from './auth/protected-route'
import { createFuncionario, listFuncionarios, updateFuncionarioPermissoes } from './auth/auth-api'
import type { FuncionarioAdmin, FuncionarioPermissoes } from './auth/auth-api'
import { useSession } from './auth/session-context'

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M20 32V14M20 19c-7 0-11-4-11-10 7 0 11 4 11 10ZM20 24c7 0 11-4 11-10-7 0-11 4-11 10Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M11 32h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function LoadingScreen({ label = 'Verificando sua sessão…' }: { label?: string }) {
  return (
    <main className="full-screen-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </main>
  )
}

function ApiUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="full-screen-state full-screen-error">
      <div className="state-card">
        <BrandMark small />
        <h1>Não foi possível conectar</h1>
        <p>Confira se a API Financeira está em execução e tente novamente.</p>
        <button className="button button-primary" onClick={onRetry} type="button">
          Tentar novamente
        </button>
      </div>
    </main>
  )
}

function LoginPage() {
  const { status, login, refresh } = useSession()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const returnTo = safeReturnPath(searchParams.get('returnTo'))

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unavailable')
    return <ApiUnavailable onRetry={() => void refresh().catch(() => undefined)} />
  if (status === 'authenticated') return <Navigate to={returnTo} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(email.trim(), password)
      navigate(returnTo, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar na conta.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" aria-hidden="true" />
      <div className="auth-decoration auth-decoration-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-accent" />
        <div className="auth-content">
          <BrandMark />
          <p className="eyebrow">MIL FOLHAS PAPELARIA</p>
          <h1 id="login-title">Bem-vindo de volta</h1>
          <p className="auth-intro">Entre com seu e-mail e senha para continuar.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="email">
              E-mail
              <input
                autoComplete="username"
                autoFocus
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com.br"
                required
                type="email"
                value={email}
              />
            </label>
            <label className="field-label" htmlFor="password">
              Senha
              <input
                autoComplete="current-password"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
                type="password"
                value={password}
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button className="button button-primary login-submit" disabled={submitting} type="submit">
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="auth-help">
            Precisa redefinir sua senha? Peça ao administrador enquanto a recuperação por código é
            configurada.
          </p>
        </div>
        <footer className="auth-footer">Acesso restrito a usuários cadastrados pela administração</footer>
      </section>
    </main>
  )
}

function ProtectedLayout() {
  const { status, user, refresh, logout } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')
  const decision = decideProtectedRoute(status, `${location.pathname}${location.search}${location.hash}`)

  if (decision.kind === 'loading') return <LoadingScreen />
  if (decision.kind === 'unavailable')
    return <ApiUnavailable onRetry={() => void refresh().catch(() => undefined)} />
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />
  if (!user) return <LoadingScreen label="Carregando sua conta…" />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="sidebar-brand" to="/" aria-label="Mil Folhas, início">
          <BrandMark small />
          <span>
            <strong>Mil Folhas</strong>
            <small>Papelaria</small>
          </span>
        </Link>

        <div className="nav-caption">MENU PRINCIPAL</div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`} end to="/">
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m3.5 10 8.5-7 8.5 7v10.5h-6v-6h-5v6h-6V10Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Visão geral
          </NavLink>
          {canAccessAdmin(user.role) && (
            <NavLink
              className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
              to="/admin"
            >
              <span className="nav-icon" aria-hidden="true">
                ＋
              </span>
              Administração
            </NavLink>
          )}
        </nav>

        <p className="sidebar-note">Os módulos financeiros serão integrados por etapas.</p>

        <div className="sidebar-user">
          <div className="avatar" aria-hidden="true">
            {initials(user.name)}
          </div>
          <div className="sidebar-user-copy">
            <strong>{user.name}</strong>
            <span>{roleLabel(user.role)}</span>
          </div>
          <button
            aria-label="Sair da conta"
            className="icon-button"
            onClick={async () => {
              setLogoutError('')
              try {
                await logout()
                navigate('/login', { replace: true })
              } catch (error) {
                setLogoutError(error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.')
              }
            }}
            title="Sair"
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <path
                d="M10 17l5-5-5-5M15 12H3m9-8h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>
            Mil Folhas <span className="topbar-divider">/</span> Área segura
          </span>
          <span className="role-pill">{roleLabel(user.role)}</span>
        </header>
        <Outlet />
      </main>
      {logoutError && (
        <div className="logout-alert" role="alert">
          {logoutError}
        </div>
      )}
    </div>
  )
}

function HomePage() {
  const { user } = useSession()

  return (
    <section className="welcome-page">
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>
          <h1>Olá, {user?.name}</h1>
          <p>Seu acesso está ativo. Esta área será preenchida conforme os módulos forem integrados.</p>
        </div>
        <div className="welcome-icon" aria-hidden="true">
          <BrandMark small />
        </div>
      </div>

      <section className="welcome-panel" aria-labelledby="next-title">
        <div className="panel-icon" aria-hidden="true">
          ✓
        </div>
        <div>
          <h2 id="next-title">Sessão conectada à API Financeira</h2>
          <p>
            Você entrou como <strong>{roleLabel(user?.role)}</strong>. Os dados e operações financeiras
            aparecerão aqui depois da integração dos módulos correspondentes.
          </p>
        </div>
      </section>

      <p className="welcome-footnote">
        Esta tela não exibe indicadores de demonstração nem altera dados financeiros.
      </p>
    </section>
  )
}

function NotFoundPage() {
  return (
    <section className="welcome-page">
      <p className="eyebrow">PÁGINA NÃO ENCONTRADA</p>
      <h1>Este endereço não está disponível</h1>
      <p>
        <Link className="text-link" to="/">
          Voltar para a visão geral
        </Link>
      </p>
    </section>
  )
}

function AdminPage() {
  const { user } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshFuncionarios, setRefreshFuncionarios] = useState(0)

  if (!canAccessAdmin(user?.role)) {
    return (
      <section className="welcome-page" role="alert">
        <p className="eyebrow">ACESSO RESTRITO</p>
        <h1>Área exclusiva para ADMIN</h1>
        <p>Seu perfil não pode cadastrar funcionários.</p>
        <Link className="text-link" to="/">
          Voltar para a visão geral
        </Link>
      </section>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      const apiError = caught instanceof Error ? caught.message : 'Não foi possível cadastrar o funcionário.'
      setError(apiError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="welcome-page admin-page">
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Cadastrar funcionário</h1>
          <p>Crie uma conta para acesso à plataforma. O papel FUNCIONARIO é atribuído pelo servidor.</p>
        </div>
      </div>

      <section className="admin-card" aria-labelledby="employee-form-title">
        <h2 id="employee-form-title">Dados da conta</h2>
        <p className="admin-card-description">A senha inicial deve ter de 8 a 128 caracteres.</p>
        <form className="admin-form" onSubmit={handleSubmit}>
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

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {created && (
            <p className="form-success" role="status">
              Funcionário {created.name} ({created.email}) cadastrado com sucesso.
            </p>
          )}

          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? 'Cadastrando…' : 'Cadastrar funcionário'}
          </button>
        </form>
      </section>

      <EmployeePermissionsPanel refreshKey={refreshFuncionarios} />
    </section>
  )
}

function EmployeePermissionsPanel({ refreshKey }: { refreshKey: number }) {
  const [funcionarios, setFuncionarios] = useState<FuncionarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
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
  }, [refreshKey])

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

  return (
    <section className="admin-card permission-card" aria-labelledby="employee-permissions-title">
      <h2 id="employee-permissions-title">Funcionários e permissões</h2>
      <p className="admin-card-description">
        Defina o acesso de cada funcionário às contas a pagar e a receber. Cancelamentos, relatórios e gestão
        de contas continuam exclusivos de ADMIN.
      </p>

      {loading && (
        <p className="permission-empty" role="status">
          Carregando funcionários…
        </p>
      )}
      {!loading && loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {!loading && !loadError && funcionarios.length === 0 && (
        <p className="permission-empty">Ainda não há funcionários cadastrados.</p>
      )}
      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}

      {!loading && !loadError && funcionarios.length > 0 && (
        <ul className="employee-permission-list">
          {funcionarios.map((funcionario) => (
            <li className="employee-permission-item" key={funcionario.id}>
              <div className="employee-permission-heading">
                <div>
                  <strong>{funcionario.name}</strong>
                  <span>{funcionario.email}</span>
                </div>
                <span className="role-pill">FUNCIONARIO</span>
              </div>
              <div className="permission-controls">
                <label className="permission-toggle">
                  <input
                    checked={funcionario.permissoes.despesas}
                    disabled={savingId === funcionario.id}
                    onChange={(event) => changePermission(funcionario.id, 'despesas', event.target.checked)}
                    type="checkbox"
                  />
                  <span>Contas a pagar</span>
                </label>
                <label className="permission-toggle">
                  <input
                    checked={funcionario.permissoes.recebimentos}
                    disabled={savingId === funcionario.id}
                    onChange={(event) =>
                      changePermission(funcionario.id, 'recebimentos', event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Contas a receber</span>
                </label>
                <button
                  className="button button-primary permission-save"
                  disabled={savingId === funcionario.id}
                  onClick={() => void savePermissions(funcionario)}
                  type="button"
                >
                  {savingId === funcionario.id ? 'Salvando…' : 'Salvar permissões'}
                </button>
                {savedId === funcionario.id && (
                  <span className="permission-saved" role="status">
                    Permissões salvas.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ProtectedRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<HomePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <ProtectedRoutes />
}

function roleLabel(role: 'ADMIN' | 'FUNCIONARIO' | undefined): string {
  return role === 'ADMIN' ? 'Administrador' : role === 'FUNCIONARIO' ? 'Funcionário' : 'Usuário'
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('')
}
