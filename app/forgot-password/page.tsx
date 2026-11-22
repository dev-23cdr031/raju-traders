'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { cleanSupabaseUrl } from '@/lib/supabase'
import '../recovery.css'

function createRecoveryRequestClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!cleanSupabaseUrl || !anonKey) throw new Error('Password recovery is not configured.')

  return createClient(cleanSupabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
      storageKey: 'ajr-recovery-request',
    },
  })
}

export default function ForgotPasswordPage() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setMessageType('error')
      setMessage(t('Enter a valid email address and try again.'))
      return
    }

    setLoading(true)
    try {
      const { error } = await createRecoveryRequestClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: window.location.origin + '/reset-password',
      })

      if (error) {
        console.error('Password recovery request failed.', {
          status: error.status ?? null,
          code: error.code ?? null,
        })
        setMessageType('error')
        setMessage(
          /rate limit|too many requests/i.test(error.message)
            ? t('Too many requests were made. Please wait a few minutes before trying again.')
            : t('We could not send a recovery email right now. Check your connection and try again later.')
        )
        return
      }

      setMessageType('success')
      setMessage(t('If an account is registered with this email, recovery instructions will arrive shortly. Check your inbox and spam folder.'))
    } catch (error) {
      console.error('Password recovery request failed unexpectedly.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      setMessageType('error')
      setMessage(t('We could not send a recovery email right now. Check your connection and try again later.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page recovery-page">
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
              <h1>{t('A fresh start, securely.')}</h1>
              <p>{t('We’ll help you get back to your account with a private recovery link sent to your inbox.')}</p>
            </div>
            <div className="auth-side-feature">
              <span className="auth-feature-icon" aria-hidden="true">✦</span>
              <span>{t('Private • Secure • Verified')}</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-topbar">
            <span className="auth-badge">{t('Account recovery')}</span>
            <LanguageSwitcher />
            <Link className="auth-return" href="/login">{t('Back to login')}</Link>
          </div>

          <div className="auth-heading">
            <span className="auth-kicker">{t('A little help getting back')}</span>
            <h2>{t('Forgot password?')}</h2>
            <p>{t('Enter the email address associated with your account and we’ll send recovery instructions.')}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field" htmlFor="recovery-email">
              <span>{t('Email address')}</span>
              <input
                id="recovery-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading}
              />
            </label>

            {message && (
              <div className={`auth-message ${messageType === 'error' ? 'recovery-error' : ''}`} role="status" aria-live="polite">
                {message}
              </div>
            )}

            <button className="button button-dark auth-submit" type="submit" disabled={loading}>
              {loading ? t('Sending recovery email...') : t('Send recovery email')}
            </button>
          </form>

          <div className="auth-switch">
            <span>{t('Remember your password?')}</span>
            <Link href="/login">{t('Log in')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
