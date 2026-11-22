'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck, ShoppingBag } from 'lucide-react'

type EventRow = { id: string; event_type: string; channel: string; recipient: string; status: string; error?: string; retry_count: number; created_at: string }
type Data = { events: EventRow[]; metrics: any; settings: any }

const state = (on: boolean) => <span className={'notification-state ' + (on ? 'on' : 'off')}><i />{on ? 'Active' : 'Needs setup'}</span>
const when = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export default function NotificationAutomation() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [channel, setChannel] = useState('all')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch('/api/admin/notification-automation', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      const next = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(next.message || 'Could not load notification activity.')
      setData(next)
    } catch (reason: any) { setError(reason?.message || 'Could not load notification activity.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const rows = useMemo(() => (data?.events || []).filter((row) => channel === 'all' || row.channel === channel), [data, channel])
  const metrics = data?.metrics
  return <section className="notification-automation" aria-labelledby="notification-title">
    <header className="admin-topbar notification-topbar">
      <div><span className="admin-kicker"><span className="admin-kicker-line" /> Delivery control room</span><h1 id="notification-title">Notification <em>Automation</em></h1><p className="admin-page-description">A single, consent-led ledger for order confirmations and saved-bag recovery.</p></div>
      <button className="button button-light" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </header>
    <div className="notification-health" role="status"><span><Clock3 size={15} /> {data?.settings?.cartMinutes ?? '—'} min cart window</span><span>{state(Boolean(data?.settings?.email))} Email</span><span>{state(Boolean(data?.settings?.whatsapp))} WhatsApp</span><span>Scheduler key: {data?.settings?.scheduler ? 'Configured' : 'Needs setup'} (job status not checked)</span></div>
    {error && <div className="notification-error" role="alert"><AlertCircle size={17} />{error}</div>}
    <section className="notification-metrics" aria-busy={loading}>
      <article><Mail size={18} /><span>Email sent</span><strong>{metrics?.email?.sent ?? '—'}</strong><small>{metrics?.email?.delivered ?? 0} delivered · {metrics?.email?.failed ?? 0} failed</small></article>
      <article><MessageCircle size={18} /><span>WhatsApp sent</span><strong>{metrics?.whatsapp?.sent ?? '—'}</strong><small>{metrics?.whatsapp?.delivered ?? 0} delivered · {metrics?.whatsapp?.failed ?? 0} failed</small></article>
      <article><ShoppingBag size={18} /><span>Eligible saved bags</span><strong>{metrics?.abandonedCarts ?? '—'}</strong><small>Inactive for the configured window</small></article>
      <article><CheckCircle2 size={18} /><span>Recovered carts</span><strong>{metrics?.recoveredCarts ?? '—'}</strong><small>{metrics?.recovery?.sent ?? '—'} reminders sent · {metrics?.recovery?.conversionRate == null ? 'conversion unknown' : metrics.recovery.conversionRate + '% converted'}</small></article>
    </section>
    <section className="notification-grid">
      <section className="admin-panel notification-log"><header><div><span className="panel-eyebrow">Delivery ledger</span><h2>Recent events</h2></div><label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Customer email</option><option value="admin_email">Admin email</option><option value="whatsapp">WhatsApp</option></select></label></header>
        {!loading && !rows.length ? <div className="notification-empty"><Mail size={24} /><h3>No delivery events yet</h3><p>Events appear after the migration is applied and a confirmed order or eligible cart is processed.</p></div> :
        <div className="notification-table-wrap"><table><thead><tr><th>Event</th><th>Channel</th><th>Recipient</th><th>Status</th><th>When</th><th>Notes</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.event_type.replace(/_/g, ' ')}</td><td>{row.channel.replace('_', ' ')}</td><td>{row.recipient}</td><td><span className={'notification-status ' + row.status}>{row.status}</span></td><td>{when(row.created_at)}</td><td>{row.error || (row.retry_count ? 'Retry ' + row.retry_count : '—')}</td></tr>)}</tbody></table></div>}
      </section>
      <aside className="notification-guardrails"><span className="panel-eyebrow">Guardrails</span><h2>Built to be deliberate.</h2><ul><li><ShieldCheck size={15} /><span>One event ID per channel prevents duplicate sends.</span></li><li><ShieldCheck size={15} /><span>Checkout remains successful when a provider fails.</span></li><li><ShieldCheck size={15} /><span>WhatsApp recovery needs separate marketing consent.</span></li><li><ShieldCheck size={15} /><span>Signed provider webhooks update delivery only.</span></li></ul><div className="notification-config"><strong>Webhook readiness</strong><span>Meta {state(Boolean(data?.settings?.metaWebhook))}</span><span>Resend {state(Boolean(data?.settings?.resendWebhook))}</span></div><a className="button button-light" href="/admin/abandoned-carts">Open cart recovery →</a></aside>
    </section>
  </section>
}
