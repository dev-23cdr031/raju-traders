'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Download, LoaderCircle, LogOut, Mail, Monitor, RefreshCw, Search, Shield,
  ShieldAlert, Smartphone, Tablet, Users, X,
} from 'lucide-react'
import './login-users.css'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  createdAt: string | null
  lastSignInAt: string | null
  confirmedAt: string | null
  status: 'Active' | 'Pending Verification' | 'Disabled'
  loginCount: number | null
  device: string | null
  deviceType: string | null
}

type DashboardData = {
  users: UserRow[]
  total: number
  page: number
  pageSize: number
  stats: {
    totalUsers: number
    signedInToday: number
    active30Days: number
    registeredToday: number
    registeredThisMonth: number
    successfulLogins: number | null
    failedLogins: number | null
  }
  recentActivity: Array<{
    id: string
    eventType: 'login_success' | 'login_failure' | 'logout'
    userId: string | null
    customerName: string
    device: string
    createdAt: string
  }>
  trackingEnabled: boolean
  firstRecordedAt: string | null
}

type CustomerDetail = {
  customer: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    createdAt: string | null
    lastSignInAt: string | null
    confirmedAt: string | null
    bannedUntil: string | null
    metadata: { firstName: string | null; lastName: string | null; phone: string | null }
  }
  events: Array<{ id: string; event_type: string; device: string | null; browser: string | null; os: string | null; login_method: string | null; created_at: string }>
  devices: string[]
  loginCount: number | null
  trackingEnabled: boolean
  loginHistoryLimited: boolean
  orders: Array<{ id: string; orderNumber: string; status: string; total: number; createdAt: string; itemCount: number }>
  orderCount: number
  completedSpend: number
}

type Filters = {
  q: string
  registeredFrom: string
  registeredTo: string
  lastLoginFrom: string
  lastLoginTo: string
  status: string
  device: string
  sort: 'asc' | 'desc'
}

const EMPTY_FILTERS: Filters = {
  q: '',
  registeredFrom: '',
  registeredTo: '',
  lastLoginFrom: '',
  lastLoginTo: '',
  status: '',
  device: '',
  sort: 'desc',
}

function authHeaders() {
  const token = window.localStorage.getItem('ajr-access-token') || ''
  return { Authorization: `Bearer ${token}` }
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function getLoadFailure(error: string) {
  const message = error || 'Unable to load customer accounts.'
  const normalized = message.toLowerCase()

  if (normalized.includes('admin access only')) {
    return {
      title: 'Administrator access required',
      message: 'Sign in with an administrator account, then retry.',
    }
  }

  if (normalized.includes('supabase server env vars missing')
    || normalized.includes('supabase_url')
    || normalized.includes('service_role_key')) {
    return {
      title: 'Supabase server setup required',
      message: 'Configure the Supabase server URL and service-role key, then retry.',
    }
  }

  if (normalized.includes('auth_login_events')
    && /(does not exist|schema cache|not found|missing)/.test(normalized)) {
    return {
      title: 'Login tracking migration required',
      message: 'Apply supabase/login-users-audit.sql in the Supabase SQL Editor, then retry.',
    }
  }

  return {
    title: 'Customer data unavailable',
    message: 'Check the admin API and Supabase connection, then retry.',
  }
}

function initials(name: string | null, email: string | null) {
  const value = name || email || '?'
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function StatCard({ label, value, note, icon: Icon, tone = '' }: {
  label: string
  value: string | number
  note: string
  icon: typeof Users
  tone?: string
}) {
  return (
    <article className={`login-stat ${tone}`}>
      <div className="login-stat-top"><span>{label}</span><span className="login-stat-icon"><Icon size={17} /></span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function StatusBadge({ status }: { status: UserRow['status'] }) {
  return <span className={`login-status status-${status.toLowerCase().replace(/\s+/g, '-')}`}>
    <i aria-hidden="true" />{status}
  </span>
}

function trapModalFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden') && element.offsetParent !== null)

  if (!focusable.length) {
    event.preventDefault()
    container.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function DeviceIcon({ device }: { device: string | null }) {
  const Icon = device === 'Mobile' ? Smartphone : device === 'Tablet' ? Tablet : Monitor
  return <Icon size={14} aria-hidden="true" />
}

export default function LoginUsers() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [mutationBusy, setMutationBusy] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const [exporting, setExporting] = useState(false)
  const drawerTriggerRef = useRef<HTMLElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLElement | null>(null)

  const filterKey = useMemo(() => JSON.stringify(filters), [filters])
  const query = useMemo(() => {
    const values = new URLSearchParams({ page: String(page) })
    Object.entries(filters).forEach(([key, value]) => { if (value) values.set(key, value) })
    return values.toString()
  }, [page, filterKey, filters])

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/login-users?${query}`, { headers: authHeaders(), cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'Unable to load customer accounts.')
      setData(body as DashboardData)
    } catch (reason: any) {
      setError(reason?.message || 'Unable to load customer accounts.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [query])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, filters.q ? 220 : 0)
    return () => window.clearTimeout(timer)
  }, [loadData, filters.q])

  useEffect(() => {
    const timer = window.setInterval(() => { void loadData(true) }, 45000)
    return () => window.clearInterval(timer)
  }, [loadData])

  useEffect(() => {
    if (!detailLoading && !detailError && !detail) return
    const frame = window.requestAnimationFrame(() => {
      const closeButton = drawerRef.current?.querySelector<HTMLElement>('.login-close-button')
      ;(closeButton || drawerRef.current)?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [detailLoading, detailError, detail])

  useEffect(() => {
    if (!confirming) return
    const frame = window.requestAnimationFrame(() => {
      confirmRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [confirming])

  const closeDrawer = useCallback(() => {
    setDetail(null)
    setDetailError('')
    setConfirming(false)
    window.requestAnimationFrame(() => drawerTriggerRef.current?.focus())
  }, [])

  const closeConfirmation = useCallback(() => {
    if (mutationBusy) return
    setConfirming(false)
    window.requestAnimationFrame(() => confirmTriggerRef.current?.focus())
  }, [mutationBusy])

  const openCustomer = async (id: string, trigger: HTMLElement) => {
    drawerTriggerRef.current = trigger
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    setMutationError('')
    try {
      const response = await fetch(`/api/admin/login-users/${encodeURIComponent(id)}`, { headers: authHeaders(), cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'Unable to load customer profile.')
      setDetail(body as CustomerDetail)
    } catch (reason: any) {
      setDetailError(reason?.message || 'Unable to load customer profile.')
    } finally {
      setDetailLoading(false)
    }
  }

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const values = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => { if (value) values.set(key, value) })
      values.set('export', 'csv')
      const response = await fetch(`/api/admin/login-users?${values}`, { headers: authHeaders(), cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.message || 'Export could not be prepared.')
      }
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = 'ajr-login-users.csv'
      anchor.click()
      URL.revokeObjectURL(href)
    } catch (reason: any) {
      setError(reason?.message || 'Export could not be prepared.')
    } finally {
      setExporting(false)
    }
  }

  const changeAccountStatus = async () => {
    if (!detail) return
    setMutationBusy(true)
    setMutationError('')
    try {
      const disabled = !detail.customer.bannedUntil || Date.parse(detail.customer.bannedUntil) <= Date.now()
      const response = await fetch(`/api/admin/login-users/${encodeURIComponent(detail.customer.id)}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'Account status could not be changed.')
      setDetail((current) => current ? {
        ...current,
        customer: { ...current.customer, bannedUntil: body.bannedUntil },
      } : current)
      setConfirming(false)
      window.requestAnimationFrame(() => confirmTriggerRef.current?.focus())
      await loadData(true)
    } catch (reason: any) {
      setMutationError(reason?.message || 'Account status could not be changed.')
      setConfirming(false)
      window.requestAnimationFrame(() => confirmTriggerRef.current?.focus())
    } finally {
      setMutationBusy(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const filterSummary = data
    ? data.total === 1 ? '1 customer' : `${data.total.toLocaleString()} customers`
    : loading || refreshing ? 'Loading customers'
      : error ? 'Customer data unavailable' : '—'
  const loadFailure = error ? getLoadFailure(error) : null
  const noDataCoverageNote = loading || refreshing ? 'Checking coverage' : error ? 'Request unavailable' : 'Coverage unavailable'
  const coverageState = data
    ? error ? 'stale' : data.trackingEnabled ? 'on' : 'off'
    : loading || refreshing ? 'loading'
      : error ? 'error' : 'unavailable'

  return (
    <div className="login-users-page">
      <section className="admin-topbar login-users-heading">
        <div>
          <span className="admin-kicker"><span className="admin-kicker-line" /> Customer stewardship</span>
          <h1>Login <em>Users</em></h1>
          <p className="admin-page-description">A clear view of customer accounts, sign-in activity and order history.</p>
        </div>
        <div className="login-users-actions">
          <button className="button button-light" onClick={() => void loadData(true)} disabled={refreshing || loading}>
            <RefreshCw size={15} className={refreshing ? 'login-spin' : ''} /> Refresh
          </button>
          <button className="button button-dark" onClick={() => void exportCsv()} disabled={exporting || loading}>
            {exporting ? <LoaderCircle size={15} className="login-spin" /> : <Download size={15} />} Export filtered CSV
          </button>
        </div>
      </section>

      <div className={`login-coverage coverage-${coverageState}`} role="status">
        <span className="coverage-mark"><Activity size={17} /></span>
        <div>
          <strong>{coverageState === 'loading'
            ? 'Connecting to login tracking coverage'
            : coverageState === 'error'
              ? loadFailure?.title
              : coverageState === 'stale'
                ? 'Showing the last successful snapshot'
              : coverageState === 'unavailable'
                ? 'Login data is unavailable'
                : data?.trackingEnabled
              ? 'Event tracking is available'
              : 'Login event history setup is incomplete'}</strong>
          <p>{coverageState === 'loading'
            ? 'Checking recorded-event coverage and account activity.'
            : coverageState === 'error'
              ? <>{error} {loadFailure?.message}</>
              : coverageState === 'stale'
                ? <>Refresh failed: {error} {loadFailure?.message} Previously loaded account and activity data remains visible until the connection recovers.</>
              : coverageState === 'unavailable'
                ? 'No request is in progress. Retry the dashboard request to check account and event coverage.'
                : data?.trackingEnabled
              ? data.firstRecordedAt
                ? `Events shown from ${formatDate(data.firstRecordedAt)}. Earlier logins and device history were not recorded.`
                : 'No events recorded yet. Coverage begins with the first event after tracking is enabled; no history is backfilled.'
              : 'Apply supabase/login-users-audit.sql in the Supabase SQL Editor. Until then, event counts and device history are not recorded.'}</p>
        </div>
        {coverageState === 'error' || coverageState === 'unavailable' || coverageState === 'stale'
          ? <button className="coverage-retry" type="button" onClick={() => void loadData()} disabled={loading || refreshing}>Retry connection</button>
          : <span className="coverage-refresh"><span /> {refreshing ? 'Refreshing' : 'Auto refresh · 45 sec'}</span>}
      </div>

      <section className="login-stats-grid" aria-label="Account overview">
        <StatCard label="Registered accounts" value={data?.stats.totalUsers.toLocaleString() ?? '—'} note={`${data?.stats.registeredToday.toLocaleString() ?? '—'} registered today · all auth users`} icon={Users} />
        <StatCard label="Signed in today" value={data?.stats.signedInToday.toLocaleString() ?? '—'} note="Unique accounts · UTC" icon={Clock3} />
        <StatCard label="Active · 30 days" value={data?.stats.active30Days.toLocaleString() ?? '—'} note="At least one actual auth sign-in" icon={Activity} />
        <StatCard label="New this month" value={data?.stats.registeredThisMonth.toLocaleString() ?? '—'} note={`${data?.stats.registeredToday.toLocaleString() ?? '—'} registered today · UTC`} icon={CalendarDays} />
        <StatCard label="Successful logins" value={data?.stats.successfulLogins?.toLocaleString() ?? 'Not recorded'} note={data === null ? noDataCoverageNote : data.trackingEnabled ? 'Recorded events only' : 'Audit SQL unavailable'} icon={CheckCircle2} tone="stat-green" />
        <StatCard label="Failed attempts" value={data?.stats.failedLogins?.toLocaleString() ?? 'Not recorded'} note={data === null ? noDataCoverageNote : data.trackingEnabled ? 'No emails or passwords stored' : 'Audit SQL unavailable'} icon={ShieldAlert} tone="stat-amber" />
      </section>

      <section className="login-directory-panel">
        <header className="login-section-head">
          <div>
            <span className="panel-eyebrow">ACCOUNT DIRECTORY</span>
            <h2>Customer accounts</h2>
            <p>{filterSummary} · login counts only include events recorded after tracking was introduced</p>
          </div>
          <span className="login-result-count">{data ? `${data.total.toLocaleString()} results` : loading || refreshing ? 'Loading results' : error ? 'Unavailable' : '—'}</span>
        </header>
        <div className="login-filter-grid">
          <label className="login-search-field">
            <span>Search customers</span>
            <span className="login-input-wrap"><Search size={16} /><input value={filters.q} maxLength={100} onChange={(event) => setFilter('q', event.target.value)} placeholder="Name, email or phone" /></span>
          </label>
          <label><span>Account status</span><select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">All statuses</option><option>Active</option><option>Pending Verification</option><option>Disabled</option></select></label>
          <label><span>Last recorded device</span><select value={filters.device} onChange={(event) => setFilter('device', event.target.value)}><option value="">All devices</option><option>Desktop</option><option>Mobile</option><option>Tablet</option><option>Other</option></select></label>
          <label><span>Registered from</span><input type="date" value={filters.registeredFrom} onChange={(event) => setFilter('registeredFrom', event.target.value)} /></label>
          <label><span>Registered to</span><input type="date" value={filters.registeredTo} onChange={(event) => setFilter('registeredTo', event.target.value)} /></label>
          <label><span>Last sign-in from</span><input type="date" value={filters.lastLoginFrom} onChange={(event) => setFilter('lastLoginFrom', event.target.value)} /></label>
          <label><span>Last sign-in to</span><input type="date" value={filters.lastLoginTo} onChange={(event) => setFilter('lastLoginTo', event.target.value)} /></label>
          <label><span>Registration order</span><button className="login-sort-button" onClick={() => setFilter('sort', filters.sort === 'desc' ? 'asc' : 'desc')} type="button">{filters.sort === 'desc' ? <ArrowDown size={15} /> : <ArrowUp size={15} />} {filters.sort === 'desc' ? 'Newest first' : 'Oldest first'}</button></label>
        </div>

        {error && <div className="login-inline-error" role="alert"><AlertTriangle size={17} />{error}<button onClick={() => void loadData()} type="button">Try again</button></div>}
        <div className="login-table-scroll">
          <table className="login-users-table">
            <thead><tr><th>Customer</th><th>Auth user ID</th><th>Phone</th><th>Registered</th><th>Last sign-in</th><th>Recorded device</th><th>Sign-ins</th><th>Status</th></tr></thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <button className="login-customer-link" onClick={(event) => void openCustomer(user.id, event.currentTarget)}>
                      <span className="login-avatar">{initials(user.name, user.email)}</span>
                      <span><strong>{user.name || 'Not Provided'}</strong><small>{user.email || 'Not Provided'}</small></span>
                    </button>
                  </td>
                  <td><span className="login-id-cell" title={user.id}>{user.id}</span></td>
                  <td>{user.phone || <span className="login-muted">Not Provided</span>}</td>
                  <td>{formatDate(user.createdAt) || <span className="login-muted">Not Provided</span>}</td>
                  <td>{formatDate(user.lastSignInAt) || <span className="login-muted">Not recorded</span>}</td>
                  <td>{user.device ? <span className="login-device-value"><DeviceIcon device={user.deviceType} />{user.device}</span> : <span className="login-muted">Not recorded</span>}</td>
                  <td>{user.loginCount === null ? <span className="login-muted">Not recorded</span> : user.loginCount.toLocaleString()}</td>
                  <td><StatusBadge status={user.status} /></td>
                </tr>
              ))}
              {(loading || refreshing) && !data && <tr><td colSpan={8}><div className="login-table-state"><LoaderCircle size={20} className="login-spin" /> Loading registered customers…</div></td></tr>}
              {!loading && !refreshing && !data && error && <tr><td colSpan={8}><div className="login-table-state" aria-live="polite"><AlertTriangle size={20} /><strong>Customer list unavailable</strong><span>{error}</span><button type="button" onClick={() => void loadData()}>Retry request</button></div></td></tr>}
              {!loading && data?.users.length === 0 && <tr><td colSpan={8}><div className="login-table-state"><CircleHelp size={22} /><strong>No matching accounts</strong><span>Try a different search or clear one of the filters.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="login-pagination">
          <span>Showing {data?.total ? ((page - 1) * (data?.pageSize || 25)) + 1 : 0}–{Math.min(page * (data?.pageSize || 25), data?.total || 0)} of {data?.total.toLocaleString() ?? '—'}</span>
          <div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /></button><span>Page {page} of {totalPages}</span><button aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div>
        </footer>
      </section>

      <section className="login-activity-panel">
        <header className="login-section-head">
          <div><span className="panel-eyebrow">RECORDED EVENTS</span><h2>Recent login activity</h2><p>Real events only · failures are intentionally not tied to an email address</p></div>
          <span className={`activity-live${error ? ' activity-stale' : ''}`}><i /> {data === null ? loading || refreshing ? 'Checking status' : 'Unavailable' : error ? 'Stale · refresh failed' : data.trackingEnabled ? 'Polling every 45 sec' : 'Setup required'}</span>
        </header>
        {data === null && (loading || refreshing) ? (
          <div className="login-activity-empty"><Activity size={20} /><span>Connecting to recorded login activity…</span></div>
        ) : data === null ? (
          <div className="login-activity-empty login-activity-unavailable" role={error ? 'alert' : 'status'}>
            <ShieldAlert size={20} />
            <span>{error ? `${loadFailure?.title}: ${error} ${loadFailure?.message}` : 'Activity is unavailable until the dashboard request succeeds.'}</span>
            <button type="button" onClick={() => void loadData()} disabled={loading || refreshing}>Retry</button>
          </div>
        ) : !data.trackingEnabled ? (
          <div className="login-activity-empty"><Shield size={20} /><span>Event records will appear here after audit storage is configured.</span></div>
        ) : !data.recentActivity.length ? (
          <div className="login-activity-empty"><Activity size={20} /><span>No sign-in or logout events have been recorded yet.</span></div>
        ) : (
          <ol className="login-activity-list">
            {data.recentActivity.map((event) => <li key={event.id}>
              <span className={`activity-event-icon event-${event.eventType.replace('_', '-')}`}>{event.eventType === 'login_failure' ? <ShieldAlert size={16} /> : event.eventType === 'logout' ? <LogOut size={16} /> : <CheckCircle2 size={16} />}</span>
              <span className="activity-event-copy"><strong>{event.eventType === 'login_success' ? 'Successful sign-in' : event.eventType === 'login_failure' ? 'Failed sign-in attempt' : 'Signed out'}</strong><small>{event.customerName}{event.eventType !== 'login_failure' ? ` · ${event.device}` : ' · Customer identity not recorded'}</small></span>
              <time>{formatDateTime(event.createdAt) || 'Unknown time'}</time>
            </li>)}
          </ol>
        )}
      </section>

      {(detailLoading || detailError || detail) && (
        <div
          className="login-drawer-scrim"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer() }}
          onKeyDown={(event) => {
            if (confirming) return
            if (event.key === 'Escape') {
              event.preventDefault()
              closeDrawer()
              return
            }
            trapModalFocus(event, drawerRef.current)
          }}
        >
          <aside ref={drawerRef} className="login-customer-drawer" role="dialog" aria-modal="true" aria-label="Customer details" tabIndex={-1}>
            <header className="login-drawer-header">
              <div><span className="panel-eyebrow">CUSTOMER PROFILE</span><h2>Account details</h2></div>
              <button className="login-close-button" aria-label="Close customer details" onClick={closeDrawer}><X size={19} /></button>
            </header>
            {detailLoading && <div className="login-drawer-state"><LoaderCircle size={22} className="login-spin" /> Loading secure customer record…</div>}
            {detailError && <div className="login-inline-error" role="alert"><AlertTriangle size={17} />{detailError}</div>}
            {detail && <div className="login-drawer-content">
              <section className="customer-profile-hero">
                <span className="login-avatar profile-avatar">{initials(detail.customer.name, detail.customer.email)}</span>
                <div><h3>{detail.customer.name || 'Not Provided'}</h3><span>{detail.customer.email || 'Not Provided'}</span></div>
                <StatusBadge status={detail.customer.bannedUntil && Date.parse(detail.customer.bannedUntil) > Date.now() ? 'Disabled' : detail.customer.confirmedAt ? 'Active' : 'Pending Verification'} />
              </section>
              <div className="profile-facts">
                <div><span><Mail size={14} /> Email verification</span><strong>{detail.customer.confirmedAt ? 'Verified' : 'Pending verification'}</strong></div>
                <div><span><Smartphone size={14} /> Phone</span><strong>{detail.customer.phone || 'Not Provided'}</strong></div>
                <div><span><CalendarDays size={14} /> Registered</span><strong>{formatDateTime(detail.customer.createdAt) || 'Not Provided'}</strong></div>
                <div><span><Clock3 size={14} /> Last auth sign-in</span><strong>{formatDateTime(detail.customer.lastSignInAt) || 'Not recorded'}</strong></div>
                <div className="profile-id-fact"><span><Shield size={14} /> Auth user ID</span><strong title={detail.customer.id}>{detail.customer.id}</strong></div>
              </div>
              <section className="profile-block">
                <header><div><span className="panel-eyebrow">INSTRUMENTATION ERA</span><h3>Sign-in history</h3></div><strong className="profile-count">{detail.trackingEnabled ? detail.loginCount === null ? 'Not recorded' : detail.loginCount.toLocaleString() : '—'}<small> recorded logins</small></strong></header>
                {!detail.trackingEnabled ? <p className="profile-not-recorded">Event storage is unavailable. Historical sign-in counts and devices are not recorded.</p>
                  : !detail.events.length ? <p className="profile-not-recorded">No events recorded yet. Supabase’s latest sign-in timestamp above is separate from event history.</p>
                    : <ol className="profile-event-list">{detail.events.slice(0, 8).map((event) => <li key={event.id}>
                      <span className={`activity-event-icon event-${event.event_type.replace('_', '-')}`}>{event.event_type === 'login_failure' ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</span>
                      <div><strong>{event.event_type === 'login_success' ? 'Successful sign-in' : event.event_type === 'logout' ? 'Signed out' : 'Failed attempt'}</strong><small>{[event.device, event.browser, event.os].filter(Boolean).join(' · ') || 'Not Provided'} · {event.login_method || 'Password'}</small></div>
                      <time>{formatDateTime(event.created_at) || '—'}</time>
                    </li>)}</ol>}
                {detail.loginHistoryLimited && <small className="profile-footnote">Showing the latest 200 recorded events.</small>}
                <div className="profile-device-list"><span>Distinct devices <small>(from recorded events)</small></span><p>{detail.trackingEnabled && detail.devices.length ? detail.devices.join(' · ') : 'Not recorded'}</p></div>
              </section>
              <section className="profile-block">
                <header><div><span className="panel-eyebrow">LINKED BY USER ID</span><h3>Orders &amp; spend</h3></div><span className="profile-count">{detail.orderCount.toLocaleString()}<small> orders</small></span></header>
                <div className="profile-spend"><span>Completed spend</span><strong>{formatMoney(detail.completedSpend)}</strong><small>Delivered or Paid orders only · guest orders are not linked</small></div>
                {detail.orders.length ? <ol className="profile-order-list">{detail.orders.map((order) => <li key={order.id}><div><strong>{order.orderNumber || 'Order'}</strong><small>{formatDate(order.createdAt) || 'Unknown date'} · {order.itemCount} items</small></div><div><strong>{formatMoney(order.total)}</strong><small>{order.status || 'Unknown status'}</small></div></li>)}</ol> : <p className="profile-not-recorded">No orders are associated with this account.</p>}
                {detail.orderCount > detail.orders.length && <small className="profile-footnote">Showing the latest {detail.orders.length} orders.</small>}
              </section>
              {mutationError && <div className="login-inline-error" role="alert"><AlertTriangle size={16} />{mutationError}</div>}
              <button
                ref={confirmTriggerRef}
                className={`account-control-button ${detail.customer.bannedUntil && Date.parse(detail.customer.bannedUntil) > Date.now() ? 'enable-account' : 'disable-account'}`}
                onClick={() => setConfirming(true)}
                disabled={mutationBusy}
              >
                {detail.customer.bannedUntil && Date.parse(detail.customer.bannedUntil) > Date.now() ? <><CheckCircle2 size={16} /> Enable account</> : <><ShieldAlert size={16} /> Disable account</>}
              </button>
              <p className="account-control-note">This updates Supabase Auth access. Customer records and orders are retained.</p>
            </div>}
          </aside>
        </div>
      )}

      {confirming && detail && <div
        className="login-confirm-scrim"
        onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation() }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeConfirmation()
            return
          }
          trapModalFocus(event, confirmRef.current)
        }}
      >
        <section ref={confirmRef} className="login-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="account-confirm-title" tabIndex={-1}>
          <span className="confirm-symbol"><ShieldAlert size={21} /></span>
          <h2 id="account-confirm-title">{detail.customer.bannedUntil && Date.parse(detail.customer.bannedUntil) > Date.now() ? 'Enable this account?' : 'Disable this account?'}</h2>
          <p>{detail.customer.bannedUntil && Date.parse(detail.customer.bannedUntil) > Date.now()
            ? 'The customer will be able to sign in again. Their profile and order history remain unchanged.'
            : 'The customer will no longer be able to sign in. Their profile and order history will not be deleted.'}</p>
          <div><button className="button button-light" onClick={closeConfirmation} disabled={mutationBusy}>Cancel</button><button className="button button-dark" onClick={() => void changeAccountStatus()} disabled={mutationBusy}>{mutationBusy ? 'Updating…' : 'Confirm change'}</button></div>
        </section>
      </div>}
    </div>
  )
}
