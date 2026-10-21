import { createHmac } from 'node:crypto'

import { admin } from 'better-auth/plugins'
import { emailOTP } from 'better-auth/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'

import { sendPasswordRecoveryCode } from './email-delivery.js'

/** Política compartilhada pela instância Better Auth e pelos testes do fluxo de contas. */
export const emailAndPasswordOptions = {
  enabled: true,
  disableSignUp: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  revokeSessionsOnPasswordReset: true,
} as const

export function createSisgfpaAdminPlugin() {
  return admin({
    defaultRole: 'FUNCIONARIO',
    adminRoles: ['ADMIN'],
    roles: { ADMIN: adminAc, FUNCIONARIO: userAc },
  })
}

/** Configuração única do OTP de recuperação, também reutilizada nos testes de rota. */
export function createSisgfpaEmailOTPPlugin(
  sendCode: typeof sendPasswordRecoveryCode = sendPasswordRecoveryCode
) {
  return emailOTP({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 3,
    storeOTP: {
      hash: async (otp) => {
        const secret = process.env.BETTER_AUTH_SECRET
        if (!secret) throw new Error('BETTER_AUTH_SECRET não definida para proteger o código de recuperação.')
        return createHmac('sha256', secret).update(otp).digest('hex')
      },
    },
    disableSignUp: true,
    rateLimit: { window: 60, max: 3 },
    async sendVerificationOTP({ email, otp, type }) {
      if (type === 'forget-password') await sendCode({ email, otp })
    },
  })
}
