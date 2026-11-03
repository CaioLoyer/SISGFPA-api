import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { decideProtectedRoute, safeReturnPath } from './auth/protected-route'
import { useSession } from './auth/session-context'
import { PasswordRecoveryPage } from './auth/PasswordRecoveryPage'
import { CaixaPage } from './caixa/CaixaPage'
import { ChatbotPage } from './chatbot/ChatbotPage'
import { AdminPage } from './admin/AdminPage'
import { ComercialPage } from './contatos/ComercialPage'
import { DashboardPage } from './dashboard/DashboardPage'
import { AppShell } from './layout/AppShell'
import { ProfilePage } from './perfil/ProfilePage'
import { RelatoriosPage } from './relatorios/RelatoriosPage'
import { TitulosPage } from './titulos/TitulosPage'
import './auth/login.css'

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
    if (submitting) return
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
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-accent" aria-hidden="true" />
        <div className="login-content">
          <div className="login-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="11" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 id="login-title">Mil Folhas</h1>

          <div className="login-fields">
            <form onSubmit={handleSubmit}>
              <label className="login-field" htmlFor="email">
                E-mail
                <input
                  autoComplete="username"
                  autoFocus
                  disabled={submitting}
                  id="email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com.br"
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="login-field" htmlFor="password">
                Senha
                <input
                  autoComplete="current-password"
                  disabled={submitting}
                  id="password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  required
                  type="password"
                  value={password}
                />
              </label>

              <div className="login-links">
                <Link to="/recuperar-senha">Esqueceu a senha?</Link>
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <button className="login-button" disabled={submitting} type="submit">
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
        <footer className="login-footer">© {new Date().getFullYear()} Mil Folhas Papelaria</footer>
      </section>
    </main>
  )
}

function ProtectedLayout() {
  const { status, user, refresh, logout } = useSession()
  const location = useLocation()
  const decision = decideProtectedRoute(status, `${location.pathname}${location.search}${location.hash}`)

  if (decision.kind === 'loading') return <LoadingScreen />
  if (decision.kind === 'unavailable')
    return <ApiUnavailable onRetry={() => void refresh().catch(() => undefined)} />
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />
  if (!user) return <LoadingScreen label="Carregando sua conta…" />

  return <AppShell user={user} onLogout={logout} />
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

function ProtectedRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="comercial" element={<ComercialPage />} />
        <Route path="despesas" element={<TitulosPage tipo="DESPESA" />} />
        <Route path="recebimentos" element={<TitulosPage tipo="RECEBIMENTO" />} />
        <Route path="caixa" element={<CaixaPage />} />
        <Route path="relatorios" element={<RelatoriosPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="chatbot" element={<ChatbotPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <ProtectedRoutes />
}
