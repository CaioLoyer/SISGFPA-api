import type { Role } from './index.js'

export const MODULE_PERMISSION_KEYS = ['comercial', 'despesas', 'recebimentos', 'relatorios'] as const
export type ModulePermission = (typeof MODULE_PERMISSION_KEYS)[number]
export type ModulePermissions = Record<ModulePermission, boolean>
export interface EffectivePermissions extends ModulePermissions {
  caixa: boolean
  administracao: boolean
}

export const DEFAULT_EMPLOYEE_PERMISSIONS: Readonly<ModulePermissions> = {
  comercial: true,
  despesas: true,
  recebimentos: true,
  relatorios: false,
}

export function employeePermissions(configured?: Partial<ModulePermissions> | null): ModulePermissions {
  return {
    comercial: configured?.comercial ?? DEFAULT_EMPLOYEE_PERMISSIONS.comercial,
    despesas: configured?.despesas ?? DEFAULT_EMPLOYEE_PERMISSIONS.despesas,
    recebimentos: configured?.recebimentos ?? DEFAULT_EMPLOYEE_PERMISSIONS.recebimentos,
    relatorios: configured?.relatorios ?? DEFAULT_EMPLOYEE_PERMISSIONS.relatorios,
  }
}

export function effectivePermissions(
  role: Role,
  configured?: Partial<ModulePermissions> | null
): EffectivePermissions {
  if (role === 'ADMIN')
    return {
      comercial: true,
      despesas: true,
      recebimentos: true,
      relatorios: true,
      caixa: true,
      administracao: true,
    }
  const permissions = employeePermissions(configured)
  return {
    ...permissions,
    relatorios: permissions.relatorios && (permissions.despesas || permissions.recebimentos),
    caixa: false,
    administracao: false,
  }
}
