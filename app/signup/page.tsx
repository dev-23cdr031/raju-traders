'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'

export default function SignupPage() {
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
      firstName: String(formData.get('firstName') || '').trim(),
      lastName: String(formData.get('lastName') || '').trim(),
      email: String(formData.get('email') || '').trim().toLowerCase(),
      password: String(formData.get('password') || ''),
      phone: String(formData.get('phone') || '').trim(),
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || 'Unable to create account.')

      const token = result.session?.access_token
      if (!token) {
        setMessage(t(result.needsConfirmation
          ? 'Account created. Confirm your email using the link we sent, then log in.'
          : 'Account created, but sign-in is not available yet. Please log in.'))
        return
      }

      localStorage.setItem('ajr-access-token', token)
      localStorage.setItem('adminAccessEmail', String(result.user?.email || payload.email).toLowerCase())
      window.location.href = '/'
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : 'Signup failed. Please try again.'))
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
              <h1>{t('Create your account')}</h1>
              <p>
                {t('Join our community for better nutrition, curated product selections, pantry planning, and beautiful seasonal harvest gifts.')}
              </p>
            </div>
            <div className="auth-side-feature">
              <span className="auth-feature-icon">✦</span>
              <span>{t('Member savings • Gift collections')}</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-topbar">
            <span className="auth-badge">{t('Create account')}</span>
            <LanguageSwitcher />
            <Link className="auth-return" href="/">
              {t('Return home')}
            </Link>
          </div>

          <div className="auth-heading">
            <span className="auth-kicker">{t('Healthy habits start here')}</span>
            <h2>{t('Sign up')}</h2>
            <p>{t('Build your wellness pantry and save your favorites.')}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-name-grid">
              <label className="auth-field">
                <span>{t('First name')}</span>
                <input type="text" name="firstName" placeholder="First name" required suppressHydrationWarning />
              </label>

              <label className="auth-field">
                <span>{t('Last name')}</span>
                <input type="text" name="lastName" placeholder="Last name" required suppressHydrationWarning />
              </label>
            </div>

            <label className="auth-field">
                <span>{t('Email address')}</span>
              <input type="email" name="email" placeholder="you@example.com" required suppressHydrationWarning />
            </label>

            <label className="auth-field">
                <span>{t('Password')}</span>
              <input type="password" name="password" placeholder="Create password" required suppressHydrationWarning />
            </label>

            <label className="auth-field">
                <span>{t('Phone number')}</span>
              <input type="tel" name="phone" placeholder="+91 98765 43210" required suppressHydrationWarning />
            </label>

            <div className="auth-form-row">
              <label className="remember-row">
                <input type="checkbox" name="terms" required suppressHydrationWarning />
                <span>{t('I agree to the terms')}</span>
              </label>
            </div>

            {message && <div className="auth-message">{message}</div>}

            <button className="button button-dark auth-submit" type="submit" disabled={loading} suppressHydrationWarning>
              {loading ? t('Creating account...') : t('Create free account')}
            </button>
          </form>

          <div className="auth-separator">
            <span>or</span>
          </div>

          <div className="auth-switch">
            <span>{t('Already have an account?')}</span>
            <Link href="/login">{t('Login here')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
