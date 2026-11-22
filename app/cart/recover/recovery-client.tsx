'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle, Leaf, ShieldCheck } from 'lucide-react'

export default function CartRecoveryClient({ token, action }: { token: string; action: string }) {
  const [state, setState] = useState<'loading' | 'needs-login' | 'ready-to-unsubscribe' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const started = useRef(false)
  const unsubscribe = action === 'unsubscribe'

  useEffect(() => {
    if (started.current) return
    started.current = true
    let active = true
    const recover = async () => {
      if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
        if (active) { setState('error'); setMessage('This recovery link is invalid or has expired.') }
        return
      }
      if (unsubscribe) {
        if (active) setState('ready-to-unsubscribe')
        return
      }
      const accessToken = localStorage.getItem('ajr-access-token') || ''
      if (!accessToken) {
        if (active) { setState('needs-login'); setMessage('Sign in to the AJR account that received this reminder, then open the link in your email again.') }
        return
      }
      try {
        const auth = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
        if (!auth.ok) {
          if (active) { setState('needs-login'); setMessage('Your AJR session has expired. Sign in, then open the link in your email again.') }
          return
        }
        const response = await fetch('/api/cart/recovery/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ token }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.message || 'This recovery link could not be redeemed.')
        if (active) {
          setState('done')
          setMessage('Your saved bag has been restored to your AJR account. Opening the store…')
          window.setTimeout(() => window.location.replace('/'), 1300)
        }
      } catch (error: any) {
        if (active) { setState('error'); setMessage(error?.message || 'This recovery link could not be redeemed.') }
      }
    }
    void recover()
    return () => { active = false }
  }, [token, unsubscribe])

  const revokeConsent = async () => {
    setState('loading')
    setMessage('')
    try {
      const response = await fetch('/api/cart/recovery/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Consent could not be updated.')
      setState('done')
      setMessage(data.message || 'Cart reminder consent has been withdrawn.')
    } catch (error: any) {
      setState('error')
      setMessage(error?.message || 'Consent could not be updated.')
    }
  }

  return (
    <main className="cart-recovery-page">
      <section className="cart-recovery-card" aria-live="polite">
        <Link href="/" className="cart-recovery-brand">AJR<span>ALWAYS JUST ROYAL</span></Link>
        <span className="cart-recovery-mark">{state === 'done' ? <CheckCircle size={23} /> : unsubscribe ? <ShieldCheck size={23} /> : <Leaf size={23} />}</span>
        <p className="cart-recovery-eyebrow">{unsubscribe ? 'Your preferences' : 'Your saved selection'}</p>
        <h1>{unsubscribe ? 'Cart reminders, on your terms.' : 'A considered return.'}</h1>
        <p className={`cart-recovery-message ${state === 'error' ? 'is-error' : ''}`}>{message || 'Securely checking your private recovery link…'}</p>
        {state === 'loading' && <span className="cart-recovery-loading" role="status">Please wait</span>}
        {state === 'needs-login' && <Link className="cart-recovery-action" href="/login">Sign in to AJR <ArrowRight size={16} /></Link>}
        {state === 'ready-to-unsubscribe' && <button className="cart-recovery-action" type="button" onClick={() => void revokeConsent()}>Turn off cart reminders <ArrowRight size={16} /></button>}
        {state === 'done' && !unsubscribe && <span className="cart-recovery-loading">Taking you to your bag…</span>}
        <Link href="/" className="cart-recovery-store-link">Return to the AJR store</Link>
        <small><ShieldCheck size={13} /> Recovery links are private, expire after 14 days, and work only for the AJR account that opted in.</small>
      </section>
    </main>
  )
}
