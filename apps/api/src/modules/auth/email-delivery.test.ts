import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPasswordRecoveryCodeSender,
  isEmailRecoveryConfigured,
} from '../../../../../packages/auth/src/email-delivery.js'

const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'] as const
const originalEnvironment = new Map<string, string | undefined>()

describe('entrega de códigos de recuperação por SMTP', () => {
  beforeEach(() => {
    originalEnvironment.clear()
    for (const key of smtpKeys) {
      originalEnvironment.set(key, process.env[key])
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of smtpKeys) {
      const value = originalEnvironment.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('considera indisponível uma configuração SMTP ausente ou incompleta', () => {
    expect(isEmailRecoveryConfigured()).toBe(false)
    process.env.SMTP_HOST = 'smtp.example.test'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_FROM = 'SISGFPA <no-reply@example.test>'
    process.env.SMTP_USER = 'user'

    expect(isEmailRecoveryConfigured()).toBe(false)
  })

  it('monta a mensagem com o código e usa a configuração SMTP sem enviar e-mail real', async () => {
    process.env.SMTP_HOST = 'smtp.example.test'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'true'
    process.env.SMTP_USER = 'mailer'
    process.env.SMTP_PASSWORD = 'smtp-secret'
    process.env.SMTP_FROM = 'SISGFPA <no-reply@example.test>'
    const deliver = vi.fn().mockResolvedValue({ messageId: 'message-1' })
    const sendCode = createPasswordRecoveryCodeSender(deliver)

    expect(isEmailRecoveryConfigured()).toBe(true)
    await sendCode({ email: 'user@example.test', otp: '123456' })

    expect(deliver).toHaveBeenCalledWith(
      {
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        user: 'mailer',
        password: 'smtp-secret',
        from: 'SISGFPA <no-reply@example.test>',
      },
      {
        from: 'SISGFPA <no-reply@example.test>',
        to: 'user@example.test',
        subject: 'Código para redefinir sua senha - SISGFPA',
        text: expect.stringContaining('123456'),
      }
    )
  })
})
