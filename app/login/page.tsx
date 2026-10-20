'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { isAdminEmail } from '@/lib/supabase'

export default function LoginPage() {
  const { t } = useLanguage()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      email: String(formData.get('email') || '').trim().toLowerCase(),
      password: String(formData.get('password') || ''),
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok) {
        const raw = String(result.message || 'Login failed.')
        if (/invalid login credentials/i.test(raw)) {
          setMessage(t('Login failed. Please check your email and password.'))
        } else if (/email not confirmed/i.test(raw) || /not confirmed/i.test(raw)) {
          setMessage(t('This email is not confirmed yet. Check your email for the confirmation link.'))
        } else {
          setMessage(t(raw))
        }
      } else {
        const email = String(result.user?.email || payload.email).trim().toLowerCase()
        try {
          if (result.session?.access_token) localStorage.setItem('ajr-access-token', result.session.access_token)
          localStorage.setItem('adminAccessEmail', email)
        } catch {}
        window.location.href = isAdminEmail(email) ? '/admin' : '/'
      }
    } catch {
      setMessage(t('Login failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-side">
          <div className="auth-side-content">
            <div className="auth-brand-wrap">
              <div className="brand auth-logo">
                <img src="/ajr-logo.png" alt="AJR — Always Just Royal" width={1254} height={1254} />
              </div>
            </div>
            <div className="auth-side-copy">
              <span className="auth-kicker">AJR Essence of Nature</span>
              <h1>{t('Welcome back')}</h1>
              <p>{t('Continue your healthy snacking journey with premium farm-picked dry fruits, wellness blends, and thoughtful gifting.')}</p>
            </div>
            <div className="auth-side-feature">
              <span className="auth-feature-icon">✦</span>
              <span>{t('Fresh sourcing • Small batch roasting')}</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-topbar">
            <span className="auth-badge">{t('Member Login')}</span>
            <LanguageSwitcher />
            <Link className="auth-return" href="/">{t('Return home')}</Link>
          </div>

          <div className="auth-heading">
            <span className="auth-kicker">{t('Account access')}</span>
            <h2>{t('Login')}</h2>
            <p>{t('Sign in to manage your orders and nutrition preferences.')}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>{t('Email address')}</span>
              <input type="email" name="email" placeholder="you@example.com" required suppressHydrationWarning />
            </label>

            <label className="auth-field">
              <span>{t('Password')}</span>
              <input type="password" name="password" placeholder="••••••••" required suppressHydrationWarning />
            </label>

            <div className="auth-form-row">
              <label className="remember-row">
                <input type="checkbox" name="remember" suppressHydrationWarning />
                <span>{t('Remember me')}</span>
              </label>
              <Link className="auth-link" href="/">{t('Forgot password?')}</Link>
            </div>

            {message && <div className="auth-message">{message}</div>}

            <button className="button button-dark auth-submit" type="submit" disabled={loading} suppressHydrationWarning>
              {loading ? t('Please wait...') : t('Login to my account')}
            </button>
          </form>

          <div className="auth-separator"><span>{t('or')}</span></div>

          <div className="auth-switch">
            <span>{t('New to AJR?')}</span>
            <Link href="/signup">{t('Create an account')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
