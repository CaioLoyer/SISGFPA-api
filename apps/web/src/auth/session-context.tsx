import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  AuthApiError,
  getCurrentPermissions,
  getCurrentUser,
  signIn as apiSignIn,
  signOut as apiSignOut,
} from './auth-api'
import type { EffectivePermissions } from '@sisgfpa/types'
import type { AuthenticatedUser } from './auth-api'
import type { SessionStatus } from './protected-route'

interface SessionContextValue {
  status: SessionStatus
  user: AuthenticatedUser | null
  permissions: EffectivePermissions | null
  refreshPermissions: () => Promise<void>
  refresh: () => Promise<AuthenticatedUser | null>
  updateCurrentUserName: (name: string) => void
  login: (email: string, password: string) => Promise<AuthenticatedUser>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [permissions, setPermissions] = useState<EffectivePermissions | null>(null)
  const generation = useRef(0)
  const permissionRequest = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++generation.current
    setStatus('loading')
    try {
      const currentUser = await getCurrentUser()
      const currentPermissions = currentUser ? await getCurrentPermissions() : null
      if (version !== generation.current) return null
      setUser(currentUser)
      setPermissions(currentPermissions)
      setStatus(currentUser ? 'authenticated' : 'anonymous')
      return currentUser
    } catch (error) {
      if (version !== generation.current) return null
      setUser(null)
      setPermissions(null)
      setStatus('unavailable')
      throw error
    }
  }, [])

  const refreshPermissions = useCallback(async () => {
    const version = generation.current
    const request = ++permissionRequest.current
    try {
      const currentUser = await getCurrentUser()
      if (version !== generation.current || request !== permissionRequest.current) return
      if (!currentUser) {
        setUser(null)
        setPermissions(null)
        setStatus('anonymous')
        return
      }
      const currentPermissions = await getCurrentPermissions()
      if (version === generation.current && request === permissionRequest.current) {
        setUser(currentUser)
        setPermissions(currentPermissions)
        setStatus('authenticated')
      }
    } catch (error) {
      if (version !== generation.current || request !== permissionRequest.current) return
      setPermissions(null)
      if (error instanceof AuthApiError && error.status === 401) setUser(null)
      setStatus(error instanceof AuthApiError && error.status === 401 ? 'anonymous' : 'unavailable')
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    const update = () => {
      if (document.visibilityState === 'visible') void refreshPermissions()
    }
    window.addEventListener('focus', update)
    window.addEventListener('sisgfpa:permissions-denied', update)
    const interval = window.setInterval(update, 30_000)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('sisgfpa:permissions-denied', update)
      window.clearInterval(interval)
    }
  }, [refreshPermissions, status])

  const updateCurrentUserName = useCallback((name: string) => {
    setUser((current) => (current ? { ...current, name } : current))
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      await apiSignIn(email, password)
      const currentUser = await refresh()
      if (!currentUser) throw new Error('A sessão não foi criada. Tente entrar novamente.')
      return currentUser
    },
    [refresh]
  )

  const logout = useCallback(async () => {
    await apiSignOut()
    generation.current++
    setUser(null)
    setPermissions(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const value = useMemo(
    () => ({ status, user, permissions, refreshPermissions, refresh, updateCurrentUserName, login, logout }),
    [status, user, permissions, refreshPermissions, refresh, updateCurrentUserName, login, logout]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession deve ser usado dentro de SessionProvider.')
  return value
}
