'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { cleanSupabaseUrl } from '@/lib/supabase'
import '../recovery.css'

type RecoveryState = 'checking' | 'ready' | 'invalid' | 'success'

function getPasswordStrength(password: string) {
  if (!password) return ''
  if (password.length < 6) return 'Needs at least 6 characters'

  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
    .filter(Boolean).length
  if (password.length >= 12 && variety >= 3) return 'Strong'
  if (password.length >= 8 || variety >= 2) return 'Good'
  return 'Basic'
}

export default function ResetPasswordPage() {
  const { t } = useLanguage()
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [verificationMessage, setVerificationMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [updating, setUpdating] = useState(false)
  const verificationStarted = useRef(false)
  const recoveryClient = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    if (verificationStarted.current) return
    verificationStarted.current = true

    const fragment = window.location.hash
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment)
    let tokenHash = params.get('token_hash') || ''
    const recoveryType = params.get('type')

    if (recoveryType !== 'recovery' || !tokenHash) {
      tokenHash = ''
      setRecoveryState('invalid')
      setVerificationMessage(t('This password recovery link is invalid or has expired. Request a new link and try again.'))
      return
    }

    if (!cleanSupabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      tokenHash = ''
      setRecoveryState('invalid')
      setVerificationMessage(t('Password recovery is temporarily unavailable. Please try again later.'))
      return
    }

    const isolatedClient = createClient(cleanSupabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'ajr-recovery',
      },
    })
    recoveryClient.current = isolatedClient

    void (async () => {
      try {
        const { data, error } = await isolatedClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        tokenHash = ''
        if (error || !data.session) {
          if (error) {
            console.error('Password recovery verification failed.', {
              status: error.status ?? null,
              code: error.code ?? null,
            })
          } else {
            console.error('Password recovery verification returned no session.')
          }
          recoveryClient.current = null
          setRecoveryState('invalid')
          setVerificationMessage(t('This password recovery link is invalid, expired, or already used. Request a new link to continue.'))
          return
        }
        setRecoveryState('ready')
      } catch (error) {
        console.error('Password recovery verification failed unexpectedly.', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
        tokenHash = ''
        recoveryClient.current = null
        setRecoveryState('invalid')
        setVerificationMessage(t('We could not verify this recovery link. Check your connection or request a new link.'))
      }
    })()
  }, [t])

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const strength = getPasswordStrength(password)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password.length < 6) {
      setMessage(t('Your password must be at least 6 characters long.'))
      return
    }
    if (password !== confirmPassword) {
      setMessage(t('The passwords do not match. Check both fields and try again.'))
      return
    }
    if (!recoveryClient.current || recoveryState !== 'ready') {
      setMessage(t('This recovery session is no longer available. Request a new password recovery link.'))
      return
    }

    setUpdating(true)
    try {
      const { error } = await recoveryClient.current.auth.updateUser({ password })
      if (error) {
        console.error('Password recovery update failed.', {
          status: error.status ?? null,
          code: error.code ?? null,
        })
        setMessage(/password|character|length|weak|policy/i.test(error.message)
          ? t(error.message)
          : t('We could not update your password right now. Check your connection and try again.'))
        return
      }
      setPassword('')
      setConfirmPassword('')
      recoveryClient.current = null
      setRecoveryState('success')
      setMessage('')
    } catch (error) {
      console.error('Password recovery update failed unexpectedly.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      setMessage(t('We could not update your password right now. Check your connection and try again.'))
    } finally {
      setUpdating(false)
    }
  }

  const invalid = recoveryState === 'invalid'
  const complete = recoveryState === 'success'

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
              <h1>{t('A safer way back.')}</h1>
              <p>{t('Choose a new password to keep your account and orders protected.')}</p>
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
            <span className="auth-kicker">{t('Make it yours again')}</span>
            <h2>{complete ? t('All set') : t('Create New Password')}</h2>
            <p>
              {complete
                ? t('Your password has been updated. You can now sign in with your new password.')
                : invalid
                  ? t('We could not confirm this recovery link.')
                  : t('Create a new password for your account.')}
            </p>
          </div>

          {recoveryState === 'checking' && (
            <div className="auth-message" role="status" aria-live="polite">
              {t('Verifying your secure recovery link...')}
            </div>
          )}

          {invalid && (
            <>
              <div className="auth-message recovery-error" role="alert">{verificationMessage}</div>
              <Link className="button button-dark auth-submit recovery-action" href="/forgot-password">
                {t('Request a new recovery link')}
              </Link>
            </>
          )}

          {complete && (
            <>
              <div className="auth-message" role="status" aria-live="polite">
                {t('Your password is ready. Sign in to continue shopping.')}
              </div>
              <Link className="button button-dark auth-submit recovery-action" href="/login">{t('Go to login')}</Link>
            </>
          )}

          {recoveryState === 'ready' && (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field recovery-password-field" htmlFor="new-password">
                <span>{t('New password')}</span>
                <div className="recovery-password-control">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby="password-requirement password-strength"
                    required
                    minLength={6}
                    disabled={updating}
                  />
                  <button type="button" className="recovery-toggle" onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? t('Hide new password') : t('Show new password')}
                    aria-pressed={showPassword} disabled={updating}>
                    {showPassword ? t('Hide') : t('Show')}
                  </button>
                </div>
                <small id="password-requirement" className="recovery-hint">{t('Use at least 6 characters.')}</small>
                {password && <small id="password-strength" className="recovery-strength">{t('Password strength')}: {t(strength)}</small>}
              </label>

              <label className="auth-field recovery-password-field" htmlFor="confirm-password">
                <span>{t('Confirm new password')}</span>
                <div className="recovery-password-control">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    aria-invalid={passwordMismatch}
                    aria-describedby={passwordMismatch ? 'password-mismatch' : undefined}
                    required
                    minLength={6}
                    disabled={updating}
                  />
                  <button type="button" className="recovery-toggle" onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={showConfirmPassword ? t('Hide confirmation password') : t('Show confirmation password')}
                    aria-pressed={showConfirmPassword} disabled={updating}>
                    {showConfirmPassword ? t('Hide') : t('Show')}
                  </button>
                </div>
                {passwordMismatch && (
                  <small id="password-mismatch" className="recovery-field-error" role="status">
                    {t('The passwords do not match.')}
                  </small>
                )}
              </label>

              {message && <div className="auth-message recovery-error" role="alert" aria-live="polite">{message}</div>}

              <button className="button button-dark auth-submit" type="submit"
                aria-busy={updating}
                disabled={updating || password.length < 6 || password !== confirmPassword}>
                {updating && <span className="recovery-spinner" aria-hidden="true" />}
                {updating ? t('Updating password...') : t('Update Password')}
              </button>
            </form>
          )}

          <div className="auth-switch">
            <span>{t('Already have access?')}</span>
            <Link href="/login">{t('Log in')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
