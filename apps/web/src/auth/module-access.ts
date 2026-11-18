import type { EffectivePermissions } from '@sisgfpa/types'

export function canAccessPath(path: string, permissions: EffectivePermissions | null) {
  const module = path.split(/[?#]/)[0].split('/')[1]
  const key = module === 'admin' ? 'administracao' : module
  if (!['comercial', 'despesas', 'recebimentos', 'relatorios', 'caixa', 'administracao'].includes(key))
    return true
  return permissions?.[key as keyof EffectivePermissions] === true
}

export function notifyPermissionDenied(status: number) {
  if (status === 403 && typeof window !== 'undefined')
    window.dispatchEvent(new Event('sisgfpa:permissions-denied'))
}
