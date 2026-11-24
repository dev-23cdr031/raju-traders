'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmailAutomationStatus from './EmailAutomationStatus'
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle,
  Clock3,
  Leaf,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
} from 'lucide-react'

type CartStatus = 'Active' | 'Abandoned' | 'Recovered' | 'Closed'
type CartRow = {
  id: string
  userId: string | null
  items: { product: { id: string | number; name: string; type?: string; image?: string; price: number; selectedWeight?: string; selectedVariety?: string }; quantity: number }[]
  itemCount: number
  total: number
  customerName: string
  customerEmail: string
  customerPhone: string
  guest: boolean
  device: string | null
  consent: boolean
  consentAt: string | null
  startedAt: string
  lastActivityAt: string
  closedAt: string | null
  orderId: string | null
  status: CartStatus
  reminderAttemptAt: string | null
  reminderSentAt: string | null
  reminderResult: string | null
  reminderError: string | null
  deliveryStatus: string | null
  scheduledAt: string
  order: null | { id: string; number: string; status: string; total: number; createdAt: string; matchedItems: boolean }
}
type Metrics = {
  abandonedCount: number
  abandonedToday: number
  abandonedValue: number
  abandonmentRate: number
  recoveredCount: number
  recoveredRevenue: number
  periodCartCount: number
  periodAbandonedCount: number
  periodRecoveredCount: number
  recoveryConversionRate: number
  thresholdMinutes: number
  trackedRecords: number
  truncated: boolean
  emailConfigured: boolean
}

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not recorded'
const dayStamp = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export default function AbandonedCarts({ showAutomation = true }: { showAutomation?: boolean }) {
  const [rows, setRows] = useState<CartRow[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [deviceFilter, setDeviceFilter] = useState('All')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'value' | 'oldest'>('recent')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<CartRow | null>(null)
  const [sendingId, setSendingId] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshState, setRefreshState] = useState<'idle' | 'updating' | 'healthy' | 'failure'>('idle')
  const drawerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const today = new Date()
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 29)
  const [from, setFrom] = useState(dayStamp(monthAgo))
  const [to, setTo] = useState(dayStamp(today))

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    if (quiet) setRefreshState('updating')
    setError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const params = new URLSearchParams({ from, to })
      const response = await fetch(`/api/admin/abandoned-carts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Could not load cart activity.')
      const currentCarts = Array.isArray(data.carts) ? data.carts : []
      setRows(currentCarts)
      setSelected((current) => current
        ? currentCarts.find((cart: CartRow) => cart.id === current.id) || current
        : current)
      setMetrics(data.metrics || null)
      setRefreshState('healthy')
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load abandoned carts.')
      setRefreshState('failure')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const closeDrawer = useCallback(() => {
    setSelected(null)
    window.requestAnimationFrame(() => returnFocusRef.current?.focus())
  }, [])

  const openDrawer = useCallback((row: CartRow) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelected(row)
    setActionMessage('')
    setActionError('')
  }, [])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute('hidden'))
      if (!focusable.length) {
        event.preventDefault()
        drawer.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [selected, closeDrawer])

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    const min = minValue === '' ? -Infinity : Number(minValue)
    const max = maxValue === '' ? Infinity : Number(maxValue)
    const startDate = new Date(`${from}T00:00:00`).getTime()
    const endDate = new Date(`${to}T23:59:59.999`).getTime()
    return rows.filter((row) => {
      const activity = new Date(row.lastActivityAt).getTime()
      const matchesQuery = !search || [row.customerName, row.customerEmail, row.customerPhone,
        ...(row.items || []).map((line) => line.product?.name)]
        .some((value) => String(value || '').toLowerCase().includes(search))
      return matchesQuery
        && activity >= startDate && activity <= endDate
        && (statusFilter === 'All' || row.status === statusFilter)
        && (deviceFilter === 'All' || (row.device || 'Not recorded') === deviceFilter)
        && row.total >= min && row.total <= max
    }).sort((a, b) => sortBy === 'value'
      ? b.total - a.total
      : sortBy === 'oldest'
        ? new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
        : new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
  }, [rows, query, statusFilter, deviceFilter, minValue, maxValue, sortBy, from, to])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)

  useEffect(() => { setPage(0) }, [query, statusFilter, deviceFilter, minValue, maxValue, sortBy])

  const sendReminder = async (row: CartRow) => {
    setSendingId(row.id)
    setActionMessage('')
    setActionError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch(`/api/admin/abandoned-carts/${row.id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Reminder was not sent.')
      setActionMessage(data.message || 'Reminder sent.')
      await load(true)
    } catch (sendError: any) {
      setActionError(sendError?.message || 'Reminder was not sent.')
      await load(true)
    } finally {
      setSendingId('')
    }
  }

  const revokeConsent = async (row: CartRow) => {
    setSendingId(row.id)
    setActionMessage('')
    setActionError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch(`/api/admin/abandoned-carts/${row.id}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ consent: false }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Consent could not be revoked.')
      setSelected((current) => current ? {
        ...current,
        consent: false,
        consentAt: null,
      } : current)
      setActionMessage(data.message || 'Cart reminder consent has been revoked.')
      await load(true)
    } catch (revokeError: any) {
      setActionError(revokeError?.message || 'Consent could not be revoked.')
    } finally {
      setSendingId('')
    }
  }

  const reminderReason = (row: CartRow) => {
    if (row.guest) return 'Anonymous guest carts have no verified contact address.'
    if (!row.consent) return 'No purpose-specific cart-reminder consent was recorded.'
    if (!row.customerEmail) return 'The account email was not verified when this cart was saved.'
    if (!metrics?.emailConfigured) return 'Resend is not configured or notifications are disabled.'
    if (row.closedAt || row.orderId) return 'This cart is closed or associated with an order.'
    if (row.status !== 'Abandoned') return 'This cart has not passed the abandonment threshold.'
    if (row.reminderSentAt) return `Reminder sent ${dateTime(row.reminderSentAt)}.`
    if (row.reminderResult === 'sending') return 'Delivery status is uncertain; another attempt is blocked to prevent a duplicate email.'
    if (row.reminderAttemptAt && Date.now() - new Date(row.reminderAttemptAt).getTime() < 15 * 60_000) {
      return 'A reminder attempt was made recently; wait for the 15-minute safety interval.'
    }
    return ''
  }

  const renderStatus = (status: CartStatus) => (
    <span className={`abandoned-status status-${status.toLowerCase()}`}><i />{status}</span>
  )

  return (
    <section className="abandoned-carts-page" aria-labelledby="abandoned-title">
      {showAutomation && <EmailAutomationStatus />}
      <header className="admin-topbar abandoned-topbar">
        <div>
          <span className="admin-kicker"><span className="admin-kicker-line" /> A quieter kind of follow-through</span>
          <h1 id="abandoned-title">Abandoned <em>Carts</em></h1>
          <p className="admin-page-description">Monitor automatic reminders for eligible saved bags.</p>
        </div>
        <button className="button button-light" onClick={() => void load()} disabled={loading} type="button">
          <RefreshCw size={15} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className={`abandoned-refresh-status status-${refreshState}`} role="status" aria-live="polite">
        {refreshState === 'updating' && <><RefreshCw size={14} /><span>Quiet refresh in progress…</span></>}
        {refreshState === 'failure' && <><AlertCircle size={14} /><span>Refresh failed · showing the last loaded snapshot</span></>}
        {refreshState === 'healthy' && <><CheckCircle size={14} /><span>Cart activity is up to date</span></>}
      </div>

      <div className="abandoned-threshold-note">
        <span><Clock3 size={15} /> Active until {metrics?.thresholdMinutes ?? 30} minutes of inactivity</span>
        <span><ShieldCheck size={15} /> Only persisted carts · guest carts require opt-in</span>
        {metrics?.truncated && <strong>Showing the latest 5,000 records</strong>}
      </div>

      <section className="abandoned-metrics" aria-label="Abandoned cart metrics" aria-busy={loading}>
        <article className="abandoned-metric metric-primary"><span>Total abandoned carts</span><strong>{metrics ? metrics.abandonedCount.toLocaleString('en-IN') : '—'}</strong><small>Currently beyond threshold · non-empty</small></article>
        <article className="abandoned-metric"><span>Abandoned today</span><strong>{metrics ? metrics.abandonedToday.toLocaleString('en-IN') : '—'}</strong><small>Based on activity + threshold</small></article>
        <article className="abandoned-metric"><span>Abandoned value</span><strong>{metrics ? money(metrics.abandonedValue) : '—'}</strong><small>Current abandoned snapshots</small></article>
        <article className="abandoned-metric"><span>Abandonment rate</span><strong>{metrics ? `${metrics.abandonmentRate}%` : '—'}</strong><small>{metrics ? `${metrics.periodAbandonedCount} abandoned / ${metrics.periodCartCount} carts in period` : 'Selected activity period'}</small></article>
        <article className="abandoned-metric"><span>Recovered carts</span><strong>{metrics ? metrics.recoveredCount.toLocaleString('en-IN') : '—'}</strong><small>Persisted, matched non-cancelled orders</small></article>
        <article className="abandoned-metric metric-recovered"><span>Recovered revenue</span><strong>{metrics ? money(metrics.recoveredRevenue) : '—'}</strong><small>Matched cart items only · excludes shipping</small></article>
        <article className="abandoned-metric"><span>Recovery conversion</span><strong>{metrics ? `${metrics.recoveryConversionRate}%` : '—'}</strong><small>Recovered ÷ recovered and abandoned in selected period</small></article>
      </section>

      <section className="admin-panel abandoned-panel">
        <div className="abandoned-panel-heading">
          <div><span className="panel-eyebrow">Cart ledger</span><h2>Recent customer activity</h2><p>Coverage begins when tracking was enabled; existing carts are not backfilled. No seeded or estimated cart events.</p></div>
          <span className="abandoned-record-count">{filtered.length} {filtered.length === 1 ? 'cart' : 'carts'}</span>
        </div>
        <div className="abandoned-filters">
          <label className="abandoned-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or product" aria-label="Search customer or product" /></label>
          <label><span>From</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Active</option><option>Abandoned</option><option>Recovered</option><option>Closed</option></select></label>
          <label><span>Device</span><select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}><option>All</option><option>Mobile</option><option>Tablet</option><option>Desktop</option><option>Not recorded</option></select></label>
          <label><span>Min ₹</span><input type="number" min="0" value={minValue} onChange={(event) => setMinValue(event.target.value)} placeholder="—" /></label>
          <label><span>Max ₹</span><input type="number" min="0" value={maxValue} onChange={(event) => setMaxValue(event.target.value)} placeholder="—" /></label>
          <label className="abandoned-sort"><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="recent">Recent activity</option><option value="oldest">Oldest activity</option><option value="value">Cart value</option></select><ArrowUpDown size={14} /></label>
        </div>

        {error && <div className="abandoned-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button className="button button-light small-button" type="button" onClick={() => void load()}>Try again</button></div>}
        {!error && loading && rows.length === 0 && <div className="abandoned-empty" role="status"><RefreshCw size={21} /><h3>Loading saved cart activity</h3><p>Reading current snapshots from the store database.</p></div>}
        {!error && !loading && rows.length === 0 && <div className="abandoned-empty"><ShoppingBag size={26} /><h3>No saved cart snapshots yet</h3><p>Consented guest tracking and signed-in carts will appear here after the database migration is applied. Existing carts have not been fabricated or backfilled.</p></div>}
        {!error && !loading && rows.length > 0 && filtered.length === 0 && <div className="abandoned-empty"><Search size={24} /><h3>No carts match these filters</h3><p>Try adjusting the date range, search, or filters.</p></div>}

        {filtered.length > 0 && <div className="abandoned-table-scroll" role="region" aria-label="Abandoned cart results" tabIndex={0}>
          <table className="abandoned-table">
            <thead><tr><th>Customer</th><th>Products</th><th>Items</th><th>Cart value</th><th>Last activity</th><th>Scheduled</th><th>Email / delivery</th><th>Device</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>{pageRows.map((row) => (
              <tr key={row.id} onClick={() => openDrawer(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDrawer(row) } }}>
                <td><strong className="abandoned-customer">{row.guest ? 'Anonymous guest' : row.customerName || 'AJR customer'}</strong><span className="abandoned-customer-contact">{row.guest ? 'No profile recorded' : row.customerEmail || 'Email not available'}</span></td>
                <td><div className="abandoned-product-summary">{(row.items || []).slice(0, 2).map((line, index) => <span key={`${line.product.id}-${index}`}>{line.product.name} × {line.quantity}</span>)}{row.items.length > 2 && <small>+{row.items.length - 2} more</small>}</div></td>
                <td>{row.itemCount}</td>
                <td><strong>{money(row.total)}</strong></td>
                <td><time dateTime={row.lastActivityAt}>{dateTime(row.lastActivityAt)}</time></td>
                <td>{row.consent && !row.closedAt && !row.orderId && !row.reminderSentAt ? dateTime(row.scheduledAt) : '—'}</td>
                <td>{row.reminderResult || 'Not sent'}{row.deliveryStatus && <small>{row.deliveryStatus}</small>}{row.reminderError && <small>{row.reminderError}</small>}</td>
                <td><span className="abandoned-device">{row.device || 'Not recorded'}</span></td>
                <td>{renderStatus(row.status)}</td>
                <td><button className="abandoned-open-button" type="button" onClick={(event) => { event.stopPropagation(); openDrawer(row) }}>Details / email <span aria-hidden="true">→</span></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
        {filtered.length > 0 && <div className="abandoned-pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span><div><button className="button button-light small-button" type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {pageCount}</span><button className="button button-light small-button" type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div></div>}
        <p className="abandoned-rate-definition"><Leaf size={14} /> Recovery is based on overlapping confirmed orders, not necessarily email attribution. Revenue uses recorded item prices before discounts; values may be customer-supplied.</p>
        {!metrics?.emailConfigured && <p className="abandoned-email-note"><Mail size={14} /> Recovery email is unavailable until Resend is configured and notifications are enabled.</p>}
      </section>

      {selected && <div className="abandoned-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer() }}>
        <aside ref={drawerRef} className="abandoned-drawer" role="dialog" aria-modal="true" aria-labelledby="abandoned-detail-title" tabIndex={-1}>
          <header><div><span className="panel-eyebrow">Saved cart detail</span><h2 id="abandoned-detail-title">{selected.guest ? 'Anonymous guest' : selected.customerName || 'AJR customer'}</h2></div><button ref={closeButtonRef} className="icon-button" type="button" aria-label="Close cart detail" onClick={closeDrawer}><X size={18} /></button></header>
          <div className="abandoned-drawer-scroll">
            <div className="abandoned-detail-status">{renderStatus(selected.status)}<span>{selected.device || 'Device not recorded'}</span></div>
            <section className="abandoned-detail-section"><h3>Customer contact</h3>
              {selected.guest ? <p>Anonymous guest · no profile or contact saved.</p> : <><p>{selected.customerName || 'Name not recorded'}</p><p>{selected.customerEmail || 'Verified email not available'}</p>{selected.customerPhone && <p>{selected.customerPhone}</p>}</>}
            </section>
            <section className="abandoned-detail-section"><h3>Items in this snapshot</h3>
              {selected.items.map((line, index) => <article className="abandoned-detail-item" key={`${line.product.id}-${line.product.selectedWeight}-${index}`}>
                {line.product.image ? <img src={line.product.image} alt="" /> : <span className="abandoned-image-fallback"><ShoppingBag size={18} /></span>}
                <div><strong>{line.product.name}</strong><small>{[line.product.selectedVariety, line.product.selectedWeight, line.product.type].filter(Boolean).join(' · ') || 'Standard selection'} · Qty {line.quantity}</small></div>
                <b>{money(line.product.price * line.quantity)}</b>
              </article>)}
              <div className="abandoned-detail-total"><span>{selected.itemCount} items · cart value</span><strong>{money(selected.total)}</strong></div>
            </section>
            <section className="abandoned-detail-section"><h3>Activity timeline</h3><p><span>Cart first saved</span><time>{dateTime(selected.startedAt)}</time></p><p><span>Last activity</span><time>{dateTime(selected.lastActivityAt)}</time></p><p><span>Eligible after</span><time>{dateTime(selected.scheduledAt)}</time></p><p><span>Delivery</span><time>{selected.deliveryStatus || 'Not confirmed'}</time></p><p><span>Recovery consent</span><time>{selected.consent ? `Opted in · ${dateTime(selected.consentAt)}` : 'Not given'}</time></p></section>
            <section className="abandoned-detail-section"><h3>Send a recovery email</h3>
              {selected.reminderSentAt ? <p className="abandoned-success"><CheckCircle size={15} /> Sent {dateTime(selected.reminderSentAt)}{selected.reminderResult ? ` · ${selected.reminderResult}` : ''}</p>
                : reminderReason(selected) ? <p className="abandoned-eligibility"><ShieldCheck size={15} /> {reminderReason(selected)}</p>
                  : <p className="abandoned-success"><ShieldCheck size={15} /> Eligible for one recovery-only email. Sending does not mark the cart recovered.</p>}
              {selected.reminderResult === 'failed' && selected.reminderError && <p className="abandoned-error-inline">Last attempt: {selected.reminderError}</p>}
              {actionError && <p className="abandoned-error-inline" role="alert">{actionError}</p>}
              {actionMessage && <p className="abandoned-success" role="status"><CheckCircle size={15} /> {actionMessage}</p>}
              {selected.consent && <button className="button button-light abandoned-revoke-button" type="button" onClick={() => void revokeConsent(selected)} disabled={sendingId === selected.id}>
                <ShieldCheck size={15} /> Revoke reminder consent
              </button>}
              <button className="button button-dark abandoned-send-button" type="button" onClick={() => void sendReminder(selected)} disabled={Boolean(reminderReason(selected)) || sendingId === selected.id || Boolean(selected.reminderSentAt)}>
                <Mail size={15} /> {sendingId === selected.id ? 'Sending email…' : 'Send recovery email'}
              </button>
              <small>Sent through Resend to the verified account email only. Recovery links expire after 14 days and require that customer to sign in.</small>
            </section>
            {selected.order && selected.order.matchedItems && <section className="abandoned-detail-section abandoned-order-detail"><h3>Associated order</h3><p><span>{selected.order.number}</span><strong>{selected.order.status}</strong></p><p><span>Persisted {dateTime(selected.order.createdAt)}</span><strong>{money(selected.order.total)}</strong></p><small>Linked after order persistence because its items overlap this saved cart.</small></section>}
          </div>
        </aside>
      </div>}
    </section>
  )
}
