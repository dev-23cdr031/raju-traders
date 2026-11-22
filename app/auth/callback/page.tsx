'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isAdminEmail, supabase } from '@/lib/supabase'

let callbackRequest: Promise<string> | null = null

function finishGoogleSignIn(): Promise<string> {
  if (callbackRequest) return callbackRequest
  callbackRequest = (async () => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    if (url.searchParams.has('error') || !code) {
      window.history.replaceState(null, '', '/auth/callback')
      throw new Error('Google sign-in was cancelled or the link is invalid.')
    }

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.session || !data.user) {
        throw new Error('Google sign-in could not be completed. Please try again.')
      }
      window.localStorage.setItem('ajr-access-token', data.session.access_token)
      const email = String(data.user.email || '').trim().toLowerCase()
      window.localStorage.setItem('adminAccessEmail', email)
      return isAdminEmail(email) ? '/admin' : '/'
    } finally {
      window.history.replaceState(null, '', '/auth/callback')
    }
  })()
  return callbackRequest
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void finishGoogleSignIn().then((destination) => {
      if (active) window.location.replace(destination)
    }).catch((error: unknown) => {
      console.error('Google sign-in callback failed:', error instanceof Error ? error.message : 'Unknown error')
      if (active) setMessage(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.')
    })
    return () => { active = false }
  }, [])

  return (
    <main className="auth-page">
      <section className="auth-card" style={{ display: 'block', maxWidth: 560 }}>
        <div className="auth-form-panel">
          <div className="auth-heading">
            <h1>{message ? 'Unable to sign in' : 'Finishing sign-in'}</h1>
            <p role={message ? 'alert' : 'status'}>{message || 'Please wait while we securely sign you in.'}</p>
          </div>
          {message && <Link className="auth-link" href="/login">Back to login</Link>}
        </div>
      </section>
    </main>
  )
}
