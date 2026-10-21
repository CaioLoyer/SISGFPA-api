import { createTransport } from 'nodemailer'

interface SmtpConfiguration {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
  from: string
}

interface RecoveryEmail {
  email: string
  otp: string
}

interface RecoveryEmailMessage {
  from: string
  to: string
  subject: string
  text: string
}

type RecoveryEmailDelivery = (smtp: SmtpConfiguration, message: RecoveryEmailMessage) => Promise<unknown>

function readSmtpConfiguration(): SmtpConfiguration | null {
  const host = process.env.SMTP_HOST?.trim()
  const portValue = process.env.SMTP_PORT?.trim()
  const from = process.env.SMTP_FROM?.trim()
  const user = process.env.SMTP_USER?.trim()
  const password = process.env.SMTP_PASSWORD
  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase()
  const port = Number(portValue)

  if (
    !host ||
    !from ||
    !portValue ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (secureValue && secureValue !== 'true' && secureValue !== 'false') ||
    Boolean(user) !== Boolean(password)
  ) {
    return null
  }

  return {
    host,
    port,
    secure: secureValue === 'true',
    ...(user && password ? { user, password } : {}),
    from,
  }
}

/** Retorna false sem interromper a inicialização da API quando SMTP não está configurado. */
export function isEmailRecoveryConfigured(): boolean {
  return readSmtpConfiguration() !== null
}

const deliverWithNodemailer: RecoveryEmailDelivery = async (smtp, message) => {
  const transporter = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user && smtp.password ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
  })

  try {
    return await transporter.sendMail(message)
  } finally {
    transporter.close()
  }
}

/** Cria o sender com transporte injetável para cobrir a configuração sem e-mail real nos testes. */
export function createPasswordRecoveryCodeSender(deliver: RecoveryEmailDelivery = deliverWithNodemailer) {
  return async function sendPasswordRecoveryCode({ email, otp }: RecoveryEmail): Promise<void> {
    const smtp = readSmtpConfiguration()
    if (!smtp) {
      // A rota de solicitação bloqueia este caso com a mesma resposta para qualquer e-mail.
      return
    }

    const message: RecoveryEmailMessage = {
      from: smtp.from,
      to: email,
      subject: 'Código para redefinir sua senha - SISGFPA',
      text: `Seu código para redefinir a senha é ${otp}. Ele expira em 5 minutos. Se você não solicitou esta redefinição, ignore este e-mail.`,
    }

    try {
      // Não aguardar o provedor evita distinguir contas pela duração da resposta HTTP.
      void deliver(smtp, message).catch(() => {
        console.error('Não foi possível enviar o e-mail de recuperação de senha.')
      })
    } catch {
      // Falhas do provedor não devem permitir descobrir se a conta existe.
      console.error('Não foi possível enviar o e-mail de recuperação de senha.')
    }
  }
}

export const sendPasswordRecoveryCode = createPasswordRecoveryCodeSender()
