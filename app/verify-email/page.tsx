'use client'

import Link from 'next/link'
import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { persistAuthSession } from '@/lib/auth-session-client'

const OTP_LENGTH = 6

export default function VerifyEmailPage() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    const initialEmail = new URLSearchParams(window.location.search).get('email') || ''
    const normalizedEmail = initialEmail.trim().toLowerCase()
    setEmail(normalizedEmail)
    if (normalizedEmail) {
      const storedUntil = Number(sessionStorage.getItem(`otp-resend:${normalizedEmail}`) || 0)
      const remaining = Math.max(0, Math.ceil((storedUntil - Date.now()) / 1000))
      setCooldown(remaining || 60)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = code.padEnd(OTP_LENGTH, ' ').split('')
    next[index] = digit || ' '
    setCode(next.join('').trimEnd())
    if (digit && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!digits) return
    event.preventDefault()
    setCode(digits)
    inputs.current[Math.min(digits.length, OTP_LENGTH) - 1]?.focus()
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setMessageType('error')
      setMessage(t('Enter a valid email address to verify your account.'))
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setMessageType('error')
      setMessage(t('Enter the six-digit code from your email.'))
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.session) {
        setMessageType('error')
        setMessage(/expired|invalid|token/i.test(String(result.message || ''))
          ? t('That code is invalid or expired. Request a new code and try again.')
          : t('We could not verify that code. Please check it and try again.'))
        return
      }

      const sessionReady = await persistAuthSession(result.session)
      if (!sessionReady) {
        setMessageType('error')
        setMessage(t('Email verification succeeded, but we could not establish your session. Please log in.'))
        return
      }

      const verifiedEmail = String(result.user?.email || email).trim().toLowerCase()
      window.localStorage.setItem('adminAccessEmail', verifiedEmail)
      sessionStorage.removeItem(`otp-resend:${verifiedEmail}`)
      setMessageType('success')
      setMessage(t('Email Verified Successfully!'))
      window.setTimeout(() => { window.location.href = '/' }, 650)
    } catch {
      setMessageType('error')
      setMessage(t('We could not verify your email right now. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (loading || resending || cooldown > 0 || !/^\S+@\S+\.\S+$/.test(email)) return
    setResending(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessageType('error')
        setMessage(/rate limit|too many/i.test(String(result.message || ''))
          ? t('A code was requested recently. Please wait before trying again.')
          : t('We could not resend a code. If you already verified your email, log in instead.'))
        return
      }
      sessionStorage.setItem(`otp-resend:${email}`, String(Date.now() + 60_000))
      setCooldown(60)
      setMessageType('success')
      setMessage(t('If this email has an account awaiting verification, a new code has been sent.'))
    } catch {
      setMessageType('error')
      setMessage(t('We could not resend a code right now. Please try again later.'))
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card otp-card">
        <div className="auth-side">
          <div className="auth-side-content">
            <div className="auth-brand-wrap">
              <div className="brand auth-logo">
                <img src="/ajr-logo.png" alt="AJR — Always Just Royal" width={1254} height={1254} />
              </div>
            </div>
            <div className="auth-side-copy">
              <span className="auth-kicker">Raju Traders</span>
              <h1>{t('A safer way to shop.')}</h1>
              <p>{t('Verify your email to protect your account and keep your orders connected to you.')}</p>
            </div>
            <div className="auth-side-feature">
              <span className="auth-feature-icon">✦</span>
              <span>{t('Private • Secure • Verified')}</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel otp-form-panel">
          <div className="auth-topbar">
            <span className="auth-badge">{t('Email verification')}</span>
            <LanguageSwitcher />
            <Link className="auth-return" href="/signup">{t('Back')}</Link>
          </div>

          <div className="auth-heading otp-heading">
            <span className="auth-kicker">{t('One last step')}</span>
            <h2>{t('Verify Your Email')}</h2>
            <p>{t("We've sent a 6-digit verification code to your email.")}</p>
          </div>

          <form className="auth-form otp-form" onSubmit={handleVerify}>
            <label className="auth-field">
              <span>{t('Email address')}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.trim().toLowerCase())}
                placeholder="you@example.com"
                required
              />
            </label>

            <div className="otp-code-label">{t('Verification code')}</div>
            <div className="otp-code-inputs" role="group" aria-label={t('Six-digit verification code')}>
              {Array.from({ length: OTP_LENGTH }, (_, index) => (
                <input
                  key={index}
                  ref={(element) => { inputs.current[index] = element }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  aria-label={t(`Digit ${index + 1}`)}
                  maxLength={1}
                  value={code[index] || ''}
                  onChange={(event) => setDigit(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={handlePaste}
                  disabled={loading}
                />
              ))}
            </div>

            {message && <div className={`auth-message otp-message ${messageType}`} role="status">{message}</div>}

            <button className="button button-dark auth-submit" type="submit" disabled={loading}>
              {loading ? t('Verifying...') : t('Verify email')}
            </button>
          </form>

          <div className="otp-resend-row">
            <span>{t('Didn’t receive a code?')}</span>
            <button type="button" className="otp-resend" onClick={handleResend}
              disabled={resending || loading || cooldown > 0 || !/^\S+@\S+\.\S+$/.test(email)}>
              {resending ? t('Sending...') : cooldown > 0 ? t(`Resend in ${cooldown}s`) : t('Resend code')}
            </button>
          </div>

          <div className="auth-switch otp-login-link">
            <span>{t('Already verified?')}</span>
            <Link href="/login">{t('Log in')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
