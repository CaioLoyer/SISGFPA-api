export type SessionStatus = 'loading' | 'unavailable' | 'anonymous' | 'authenticated'

export type ProtectedRouteDecision =
  { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'allow' } | { kind: 'redirect'; to: string }

export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return '/'
  }
  return value
}

export function decideProtectedRoute(status: SessionStatus, currentPath: string): ProtectedRouteDecision {
  if (status === 'loading') return { kind: 'loading' }
  if (status === 'unavailable') return { kind: 'unavailable' }
  if (status === 'authenticated') return { kind: 'allow' }

  return { kind: 'redirect', to: `/login?returnTo=${encodeURIComponent(currentPath)}` }
}
