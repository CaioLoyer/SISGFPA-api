import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { getCurrentUser, signIn as apiSignIn, signOut as apiSignOut } from './auth-api'
import type { AuthenticatedUser } from './auth-api'
import type { SessionStatus } from './protected-route'

interface SessionContextValue {
  status: SessionStatus
  user: AuthenticatedUser | null
  refresh: () => Promise<AuthenticatedUser | null>
  updateCurrentUserName: (name: string) => void
  login: (email: string, password: string) => Promise<AuthenticatedUser>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [user, setUser] = useState<AuthenticatedUser | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setStatus(currentUser ? 'authenticated' : 'anonymous')
      return currentUser
    } catch (error) {
      setUser(null)
      setStatus('unavailable')
      throw error
    }
  }, [])

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
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const value = useMemo(
    () => ({ status, user, refresh, updateCurrentUserName, login, logout }),
    [status, user, refresh, updateCurrentUserName, login, logout]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession deve ser usado dentro de SessionProvider.')
  return value
}
