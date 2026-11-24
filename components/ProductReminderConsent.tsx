'use client'

import { useEffect, useState } from 'react'

export default function ProductReminderConsent({ token, onChange }: { token: string; onChange?: (optedIn: boolean) => void }) {
  const [optedIn, setOptedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/product-reminders/consent', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.message || 'Could not load your email preference.')
        if (active) {
          setOptedIn(result.optedIn === true)
          onChange?.(result.optedIn === true)
        }
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your email preference.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, onChange])

  const update = async (value: boolean) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/product-reminders/consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optedIn: value }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not save your email preference.')
      setOptedIn(result.optedIn === true)
      onChange?.(result.optedIn === true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your email preference.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cart-consent-box">
      <label>
        <input type="checkbox" checked={optedIn} disabled={loading} onChange={(event) => void update(event.target.checked)} />
        Email me reminders about products I view. Optional; unsubscribe at any time.
      </label>
      {error && <small className="cart-consent-feedback error" role="alert">{error}</small>}
    </div>
  )
}
