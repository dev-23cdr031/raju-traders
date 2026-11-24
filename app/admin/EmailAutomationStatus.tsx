'use client'

import { useCallback, useEffect, useState } from 'react'

type UsageWindow = { used: number; limit: number | null; resets_at: string }
type AutomationStatus = {
  settings: {
    cart_enabled: boolean; product_enabled: boolean; daily_limit: number; monthly_limit: number
    daily_transactional_reserve: number; monthly_transactional_reserve: number
    last_scheduler_at: string | null; last_scheduler_result: string | null
  }
  usage: { daily: UsageWindow; monthly: UsageWindow } | null
  usageError: string | null
  reservations: { daily: number; monthly: number }
}

export default function EmailAutomationStatus() {
  const [data, setData] = useState<AutomationStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch('/api/admin/email-automation', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not load automation.')
      setData(result)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load automation.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggle(campaign: 'cart' | 'product', enabled: boolean) {
    setBusy(true)
    setError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch('/api/admin/email-automation', {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign, enabled }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not update automation.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update automation.')
    } finally { setBusy(false) }
  }

  const settings = data?.settings
  const remaining = (window: UsageWindow, limit: number, reserve: number, outstanding: number) =>
    Math.max(0, Math.min(limit, window.limit ?? limit) - window.used - reserve - outstanding)
  const fresh = settings?.last_scheduler_at && Date.now() - Date.parse(settings.last_scheduler_at) < 15 * 60_000
  return <section className="visitor-panel" style={{ margin: '16px 0', padding: 18 }} aria-label="Email automation status">
    <h2>Shared email automation</h2>
    <p>Scheduler: {!settings?.last_scheduler_at ? 'No heartbeat recorded' : `${fresh ? 'Recent' : 'Stale'} (${settings.last_scheduler_result}) · ${new Date(settings.last_scheduler_at).toLocaleString('en-IN')}`}</p>
    {settings && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <label><input type="checkbox" checked={settings.cart_enabled} disabled={busy} onChange={(event) => void toggle('cart', event.target.checked)} /> Abandoned-cart emails enabled</label>
      <label><input type="checkbox" checked={settings.product_enabled} disabled={busy} onChange={(event) => void toggle('product', event.target.checked)} /> Product-visit emails enabled</label>
      <button type="button" disabled={busy} onClick={() => void load()}>Refresh usage</button>
    </div>}
    {data?.usage && settings && <p>
      Resend account usage (sent and received): last 24 hours {data.usage.daily.used} / {Math.min(settings.daily_limit, data.usage.daily.limit ?? settings.daily_limit)};
      {' '}calendar month {data.usage.monthly.used} / {Math.min(settings.monthly_limit, data.usage.monthly.limit ?? settings.monthly_limit)}.
      {' '}Conservative promotional capacity: {remaining(data.usage.daily, settings.daily_limit, settings.daily_transactional_reserve, data.reservations.daily)} daily,
      {' '}{remaining(data.usage.monthly, settings.monthly_limit, settings.monthly_transactional_reserve, data.reservations.monthly)} monthly.
      {' '}Reserved for transactional mail: {settings.daily_transactional_reserve} daily / {settings.monthly_transactional_reserve} monthly.
      {' '}Capacity includes pending, uncertain and recently sent reservations and may double-count recent sends.
    </p>}
    {data?.usageError && <p role="alert">{data.usageError}</p>}
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading automation status…</p>}
  </section>
}
