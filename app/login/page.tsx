'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { cleanSupabaseUrl, isAdminEmail, supabase } from '@/lib/supabase'
import { persistAuthSession } from '@/lib/auth-session-client'
import { clearPendingCartReminder, saveLoginCartReminderChoice, setPendingCartReminder } from '@/lib/cart-reminder-login'

export default function LoginPage() {
  const { t } = useLanguage()
  const [message, setMessage] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [cartReminderOptIn, setCartReminderOptIn] = useState(false)
  const [continueTo, setContinueTo] = useState('')

  useEffect(() => {
    try { clearPendingCartReminder() } catch { console.error('Could not clear the previous reminder choice.') }
  }, [])

  async function handleGoogleLogin() {
    setLoading(true)
    setMessage('')
    try {
      const settings = await fetch(`${cleanSupabaseUrl}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        cache: 'no-store',
      })
      if (!settings.ok) throw new Error('Supabase Auth settings could not be loaded.')
      const configuration = await settings.json()
      if (configuration.external?.google !== true) {
        throw new Error('Google provider is not enabled in Supabase Auth.')
      }
      if (cartReminderOptIn) {
        try {
          setPendingCartReminder('google')
        } catch {
          setMessage(t('Could not save your reminder choice. Please try again or leave the box unchecked.'))
          setLoading(false)
          return
        }
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        try { clearPendingCartReminder() } catch { console.error('Could not clear the reminder choice.') }
        console.error('Google sign-in could not be started:', error.message)
        setMessage(t('Google sign-in could not be started. Please try again or use your email and password.'))
        setLoading(false)
      }
    } catch (error) {
      try { clearPendingCartReminder() } catch { console.error('Could not clear the reminder choice.') }
      console.error('Google sign-in could not be started:', error)
      setMessage(t('Google sign-in could not be started. Please try again or use your email and password.'))
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setUnverifiedEmail('')
    setContinueTo('')

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
          setMessage(t('This email is not verified yet. Enter the code sent to your inbox to continue.'))
          setUnverifiedEmail(payload.email)
        } else {
          setMessage(t(raw))
        }
      } else {
        const email = String(result.user?.email || payload.email).trim().toLowerCase()
        const sessionReady = await persistAuthSession(result.session || {})
        if (!sessionReady) {
          setMessage(t('Sign-in succeeded, but session renewal could not be initialized. Please try signing in again.'))
          return
        }
        localStorage.setItem('adminAccessEmail', email)
        const destination = isAdminEmail(email) ? '/admin' : '/'
        try {
          await saveLoginCartReminderChoice(localStorage.getItem('ajr-access-token') || '', cartReminderOptIn)
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Please try again later.'
          setMessage(`${t('Sign-in succeeded, but your cart reminder preference could not be saved. You can continue without enabling reminders.')} ${t(reason)}`)
          console.error('Cart reminder preference could not be saved after sign-in:', error)
          setContinueTo(destination)
          return
        }
        window.location.href = destination
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
              <Link className="auth-link" href="/forgot-password">{t('Forgot password?')}</Link>
            </div>

            <div className="auth-form-row">
              <label className="remember-row">
                <input type="checkbox" checked={cartReminderOptIn} onChange={(event) => setCartReminderOptIn(event.target.checked)} />
                <span>{t('Email me reminders about items left in my cart. Optional; unsubscribe at any time.')}</span>
              </label>
            </div>

            {message && <div className="auth-message">{message}</div>}
            {continueTo && <Link className="auth-link" href={continueTo}>{t('Continue to your account')}</Link>}
            {unverifiedEmail && (
              <Link className="auth-link" href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                onClick={(event) => {
                  try {
                    if (cartReminderOptIn) setPendingCartReminder('otp', unverifiedEmail)
                  } catch {
                    event.preventDefault()
                    setMessage(t('Could not save your reminder choice for email verification. Please try again.'))
                  }
                }}>
                {t('Verify your email')}
              </Link>
            )}

            <button className="button button-dark auth-submit" type="submit" disabled={loading} suppressHydrationWarning>
              {loading ? t('Please wait...') : t('Login to my account')}
            </button>
          </form>

          <div className="auth-separator"><span>{t('or')}</span></div>

          <button className="auth-google" type="button" onClick={handleGoogleLogin} disabled={loading}>
            <span aria-hidden="true" className="auth-google-icon">G</span>
            {t('Continue with Google')}
          </button>

          <div className="auth-switch">
            <span>{t('New to AJR?')}</span>
            <Link href="/signup">{t('Create an account')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
