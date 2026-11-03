import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import type { AuthenticatedUser } from '../auth/auth-api'
import { canAccessAdmin } from '../auth/protected-route'
import { Icon } from '../shared/Icon'
import type { IconName } from '../shared/Icon'
import './layout.css'

const compactQuery = '(max-width: 900px)'

function isFinancialRoute(pathname: string) {
  return ['/despesas', '/recebimentos', '/caixa'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('')
}

export function AppShell({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const location = useLocation()
  const navigate = useNavigate()
  const financialActive = isFinancialRoute(location.pathname)
  const admin = canAccessAdmin(user.role)
  const [financeExpanded, setFinanceExpanded] = useState(financialActive)
  const [compact, setCompact] = useState(() => window.matchMedia(compactQuery).matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const logoutInFlight = useRef(false)
  const sidebar = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLElement>(null)
  const drawerOpen = compact && mobileOpen

  useEffect(() => {
    const query = window.matchMedia(compactQuery)
    function updateLayout() {
      setCompact(query.matches)
      setMobileOpen(false)
    }
    query.addEventListener('change', updateLayout)
    return () => query.removeEventListener('change', updateLayout)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setFinanceExpanded(isFinancialRoute(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
      } else if (event.key === 'Tab') {
        const controls = Array.from(
          sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []
        ).filter((control) => control.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [drawerOpen])

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!compact || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
      return
    setMobileOpen(false)
    requestAnimationFrame(() => main.current?.focus())
  }

  async function handleLogout() {
    if (logoutInFlight.current) return
    logoutInFlight.current = true
    setLoggingOut(true)
    setLogoutError('')
    try {
      await onLogout()
      navigate('/login', { replace: true })
    } catch (caught) {
      setLogoutError(caught instanceof Error ? caught.message : 'Não foi possível encerrar a sessão.')
    } finally {
      logoutInFlight.current = false
      setLoggingOut(false)
    }
  }

  function navigationLink(to: string, icon: IconName, label: string, end = false) {
    return (
      <NavLink
        className={({ isActive }) => `workspace-nav-link${isActive ? ' workspace-nav-link-active' : ''}`}
        end={end}
        key={to}
        onClick={handleNavigation}
        to={to}
      >
        <Icon name={icon} />
        {label}
      </NavLink>
    )
  }

  return (
    <div className="workspace">
      <a className="workspace-skip" href="#workspace-content">
        Ir para o conteúdo
      </a>
      <div className="workspace-mobile-bar" inert={drawerOpen}>
        <Link className="workspace-mobile-brand" onClick={handleNavigation} to="/dashboard">
          <Icon name="user" />
          <span>Mil Folhas</span>
        </Link>
        <button
          aria-controls="workspace-navigation"
          aria-expanded={drawerOpen}
          aria-label="Abrir menu"
          className="workspace-menu-button"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <Icon name="menu" />
          Menu
        </button>
      </div>

      {drawerOpen && (
        <button
          aria-label="Fechar menu pelo fundo"
          className="workspace-backdrop"
          onClick={() => setMobileOpen(false)}
          tabIndex={-1}
          type="button"
        />
      )}

      <aside
        aria-label="Menu do sistema"
        aria-modal={drawerOpen || undefined}
        className={`workspace-sidebar${drawerOpen ? ' workspace-sidebar-open' : ''}`}
        id="workspace-navigation"
        ref={sidebar}
        role={drawerOpen ? 'dialog' : undefined}
      >
        <div className="workspace-sidebar-heading">
          <Link
            aria-label="Mil Folhas, início"
            className="workspace-brand"
            onClick={handleNavigation}
            to="/dashboard"
          >
            <span className="workspace-brand-mark">
              <Icon name="user" />
            </span>
            <span>
              <strong>Mil Folhas</strong>
              <small>Papelaria</small>
            </span>
          </Link>
          <button
            aria-label="Fechar menu"
            className="workspace-close-button"
            onClick={() => setMobileOpen(false)}
            ref={closeButton}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label="Navegação principal" className="workspace-nav">
          <p className="workspace-nav-caption">Menu</p>
          {navigationLink('/dashboard', 'home', 'Dashboard', true)}
          {navigationLink('/comercial', 'mail', 'Comercial')}
          <button
            aria-controls="workspace-finance"
            aria-expanded={financeExpanded}
            className={`workspace-nav-link workspace-finance-toggle${financialActive ? ' workspace-nav-link-active' : ''}`}
            onClick={() => setFinanceExpanded((expanded) => !expanded)}
            type="button"
          >
            <Icon name="book" />
            Financeiro
            <Icon
              className={`workspace-chevron${financeExpanded ? ' workspace-chevron-open' : ''}`}
              name="chevron"
            />
          </button>
          <div className="workspace-subnav" hidden={!financeExpanded} id="workspace-finance">
            {admin && (
              <NavLink onClick={handleNavigation} to="/caixa">
                Controle de Caixa
              </NavLink>
            )}
            <NavLink onClick={handleNavigation} to="/despesas">
              Contas a pagar
            </NavLink>
            <NavLink onClick={handleNavigation} to="/recebimentos">
              Contas a receber
            </NavLink>
          </div>
          {admin && navigationLink('/relatorios', 'paperclip', 'Relatórios')}
          {navigationLink('/chatbot', 'bot', 'Chatbot')}
          {navigationLink('/perfil', 'user', 'Perfil')}
          {admin && navigationLink('/admin', 'settings', 'Administração')}
        </nav>

        <div className="workspace-user">
          <span aria-hidden="true" className="workspace-avatar">
            {initials(user.name)}
          </span>
          <div className="workspace-user-copy">
            <strong title={user.name}>{user.name}</strong>
            <span>{admin ? 'Administrador' : 'Funcionário'}</span>
          </div>
          <button
            aria-busy={loggingOut}
            aria-label="Sair da conta"
            className="workspace-logout"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            title="Sair"
            type="button"
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <main className="workspace-main" id="workspace-content" inert={drawerOpen} ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      {logoutError && (
        <div className="workspace-logout-error" role="alert">
          {logoutError}
        </div>
      )}
    </div>
  )
}
