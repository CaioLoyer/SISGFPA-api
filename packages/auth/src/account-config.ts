import { admin } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'

/** Política compartilhada pela instância Better Auth e pelos testes do fluxo de contas. */
export const emailAndPasswordOptions = {
  enabled: true,
  disableSignUp: true,
} as const

export function createSisgfpaAdminPlugin() {
  return admin({
    defaultRole: 'FUNCIONARIO',
    adminRoles: ['ADMIN'],
    roles: { ADMIN: adminAc, FUNCIONARIO: userAc },
  })
}
