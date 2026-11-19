import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { requestPasswordRecoveryCode, resetPasswordWithCode } from './auth-api'
import { BrandLogo } from '../shared/BrandLogo'
import './recovery.css'

type RecoveryStep = 'email' | 'code' | 'password' | 'success'

const headings: Record<RecoveryStep, { title: string; description: string }> = {
  email: {
    title: 'Recuperar acesso',
    description: 'Informe o e-mail cadastrado para receber um código de recuperação.',
  },
  code: {
    title: 'Código de recuperação',
    description: 'Se o e-mail estiver cadastrado, enviaremos um código válido por cinco minutos.',
  },
  password: {
    title: 'Criar nova senha',
    description: 'Defina uma nova senha para acessar sua conta.',
  },
  success: {
    title: 'Senha alterada',
    description: 'Sua senha foi alterada com sucesso. Entre com a nova senha.',
  },
}

const codeErrors = new Map([
  ['Invalid OTP', 'Código inválido ou expirado. Confira o código ou solicite outro.'],
  ['OTP expired', 'O código expirou. Solicite um novo código para continuar.'],
  ['Too many attempts', 'Limite de tentativas atingido. Solicite um novo código.'],
])

export function PasswordRecoveryPage() {
  const [step, setStep] = useState<RecoveryStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const requestInFlight = useRef(false)
  const firstInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (submitting) return
    if (step === 'success') heading.current?.focus()
    else firstInput.current?.focus()
  }, [step, submitting])

  function clearPasswords() {
    setPassword('')
    setPasswordConfirmation('')
  }

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (requestInFlight.current) return
    requestInFlight.current = true
    setSubmitting(true)
    setError('')
    setNotice('')

    try {
      await requestPasswordRecoveryCode(email.trim())
      setNotice(step === 'email' ? '' : 'Se o e-mail estiver cadastrado, enviaremos um novo código.')
      setOtp('')
      clearPasswords()
      setStep('code')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível solicitar o código.')
    } finally {
      requestInFlight.current = false
      setSubmitting(false)
    }
  }

  function continueToPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestInFlight.current) return
    if (!/^\d{6}$/.test(otp)) {
      setError('Informe os seis dígitos do código.')
      return
    }
    setError('')
    setNotice('')
    clearPasswords()
    setStep('password')
  }

  function changeStep(nextStep: 'email' | 'code') {
    if (requestInFlight.current) return
    setError('')
    setNotice('')
    clearPasswords()
    if (nextStep === 'email') setOtp('')
    setStep(nextStep)
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestInFlight.current) return
    setError('')
    setNotice('')
    if (password !== passwordConfirmation) {
      setError('As senhas não coincidem.')
      return
    }

    requestInFlight.current = true
    setSubmitting(true)
    try {
      await resetPasswordWithCode({ email: email.trim(), otp, password })
      clearPasswords()
      setOtp('')
      setStep('success')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível redefinir a senha.'
      const codeError = codeErrors.get(message)
      setError(codeError || message)
      if (codeError) {
        clearPasswords()
        setOtp('')
        setStep('code')
      }
    } finally {
      requestInFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page recovery-page">
      <section className="login-card" aria-labelledby="recovery-title">
        <div className="login-accent" aria-hidden="true" />
        <div className="login-content">
          <BrandLogo alt="Logo da Papelaria Mil Folhas" className="brand-logo-auth" />
          <h1 id="recovery-title" ref={heading} tabIndex={-1}>
            {headings[step].title}
          </h1>
          <p className="recovery-intro">{headings[step].description}</p>

          <div className="login-fields">
            {step !== 'success' && step !== 'email' && (
              <div className="recovery-destination">
                <span>{email.trim()}</span>
                <button disabled={submitting} onClick={() => changeStep('email')} type="button">
                  Alterar e-mail
                </button>
              </div>
            )}

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="recovery-notice" role="status">
                {notice}
              </p>
            )}

            {step === 'email' && (
              <form aria-busy={submitting} onSubmit={(event) => void sendCode(event)}>
                <label className="login-field" htmlFor="recovery-email">
                  E-mail
                  <input
                    autoComplete="email"
                    disabled={submitting}
                    id="recovery-email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com.br"
                    ref={firstInput}
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <button className="login-button" disabled={submitting} type="submit">
                  {submitting ? 'Enviando…' : 'Enviar código'}
                </button>
              </form>
            )}

            {step === 'code' && (
              <form aria-busy={submitting} onSubmit={continueToPassword}>
                <label className="login-field" htmlFor="recovery-code">
                  Código de seis dígitos
                  <input
                    autoComplete="one-time-code"
                    className="recovery-code"
                    disabled={submitting}
                    id="recovery-code"
                    inputMode="numeric"
                    maxLength={6}
                    name="otp"
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    ref={firstInput}
                    required
                    type="text"
                    value={otp}
                  />
                </label>
                <button className="login-button" disabled={submitting} type="submit">
                  {submitting ? 'Enviando…' : 'Continuar'}
                </button>
              </form>
            )}

            {step === 'password' && (
              <form aria-busy={submitting} onSubmit={(event) => void handleReset(event)}>
                <label className="login-field" htmlFor="recovery-password">
                  Nova senha
                  <input
                    aria-describedby="recovery-password-hint"
                    autoComplete="new-password"
                    disabled={submitting}
                    id="recovery-password"
                    maxLength={128}
                    minLength={8}
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nova senha"
                    ref={firstInput}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                <label className="login-field" htmlFor="recovery-password-confirmation">
                  Confirmar senha
                  <input
                    autoComplete="new-password"
                    disabled={submitting}
                    id="recovery-password-confirmation"
                    maxLength={128}
                    minLength={8}
                    name="passwordConfirmation"
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    placeholder="Digite novamente sua senha"
                    required
                    type="password"
                    value={passwordConfirmation}
                  />
                </label>
                <p className="recovery-hint" id="recovery-password-hint">
                  Use de 8 a 128 caracteres.
                </p>
                <button className="login-button" disabled={submitting} type="submit">
                  {submitting ? 'Alterando…' : 'Alterar senha'}
                </button>
                <div className="recovery-secondary-action">
                  <button disabled={submitting} onClick={() => changeStep('code')} type="button">
                    Alterar código
                  </button>
                </div>
              </form>
            )}

            {step === 'success' ? (
              <Link className="login-button recovery-login-link" to="/login">
                Voltar para o login
              </Link>
            ) : (
              <div
                className={`login-links recovery-links${step === 'email' ? ' recovery-links-single' : ''}`}
              >
                <Link to="/login">← Voltar para login</Link>
                {step !== 'email' && (
                  <button disabled={submitting} onClick={() => void sendCode()} type="button">
                    Reenviar código
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="login-footer">© {new Date().getFullYear()} Mil Folhas Papelaria</footer>
      </section>
    </main>
  )
}
