'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Clock3,
  Eye,
  Monitor,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  Tablet,
  Users,
  X,
} from 'lucide-react'

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'
type AnalyticsEvent = {
  visitorId: string
  sessionId: string
  eventName: string
  page: string
  durationMs: number | null
  deviceType: string
  browser: string
  operatingSystem: string
  createdAt: string
}
type AnalyticsData = {
  metrics: {
    visitors: number
    pageViews: number
    newVisitors: number
    returningVisitors: number
    todayVisitors: number
    onlineNow: number
    weekVisitors: number
    monthVisitors: number
  }
  pages: { page: string; views: number; uniqueVisitors: number; averageDurationMs: number | null }[]
  products: { name: string; views: number; uniqueVisitors: number }[]
  devices: { device: string; browser: string; operatingSystem: string; sessions: number }[]
  activity: AnalyticsEvent[]
  visitors: (AnalyticsEvent & {
    events: number
    visitorType: 'New' | 'Returning'
    status: 'Online' | 'Offline'
  })[]
  updatedAt: string
}
type VisitorSort = 'visitTime' | 'visitor' | 'device' | 'page' | 'duration' | 'visitorType' | 'status'

const PAGE_LABELS: Record<string, string> = {
  home: 'Home',
  about: 'Our story',
  shop: 'Shop',
  contact: 'Contact',
  cart: 'Cart',
  wishlist: 'Wishlist',
  'product-detail': 'Product details',
  orders: 'My orders',
  login: 'Sign in',
  signup: 'Create account',
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(value: number | null | undefined) {
  if (!value) return '—'
  const seconds = Math.round(value / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function eventLabel(event: AnalyticsEvent) {
  if (event.eventName === 'page_view') return `Viewed ${PAGE_LABELS[event.page] || 'a page'}`
  if (event.eventName === 'page_duration') return `Spent ${formatDuration(event.durationMs)} on ${PAGE_LABELS[event.page] || 'a page'}`
  if (event.eventName === 'cart_add') return 'Added an item to cart'
  if (event.eventName === 'checkout_start') return 'Started checkout'
  if (event.eventName === 'purchase') return 'Completed a purchase'
  return 'Store activity'
}

function visitorActivityLabel(event: AnalyticsEvent) {
  if (event.eventName === 'page_view' || event.eventName === 'page_duration') return 'Viewed a page'
  return eventLabel(event)
}

function deviceIcon(value: string) {
  if (value === 'mobile') return <Smartphone size={16} aria-hidden="true" />
  if (value === 'tablet') return <Tablet size={16} aria-hidden="true" />
  return <Monitor size={16} aria-hidden="true" />
}

export default function VisitorAnalytics() {
  const [preset, setPreset] = useState<Preset>('7d')
  const [customStart, setCustomStart] = useState(() => localDateValue(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)))
  const [customEnd, setCustomEnd] = useState(() => localDateValue(new Date()))
  const [clock, setClock] = useState(() => Date.now())
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activityFilter, setActivityFilter] = useState<'all' | 'views' | 'commerce'>('all')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [visitorTypeFilter, setVisitorTypeFilter] = useState<'all' | 'New' | 'Returning'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'Online' | 'Offline'>('all')
  const [sortBy, setSortBy] = useState<VisitorSort>('visitTime')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedVisitor, setSelectedVisitor] = useState<string | null>(null)
  const [journey, setJourney] = useState<AnalyticsEvent[]>([])
  const [journeyLoading, setJourneyLoading] = useState(false)
  const [journeyError, setJourneyError] = useState('')

  const range = useMemo(() => {
    const now = new Date(clock)
    if (preset === 'today') {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { from: start.toISOString(), to: now.toISOString() }
    }
    if (preset === 'yesterday') {
      const end = new Date(now)
      end.setHours(0, 0, 0, 0)
      const start = new Date(end)
      start.setDate(start.getDate() - 1)
      return { from: start.toISOString(), to: end.toISOString() }
    }
    if (preset === 'custom') {
      const start = new Date(`${customStart}T00:00:00`)
      const end = new Date(`${customEnd}T00:00:00`)
      end.setDate(end.getDate() + 1)
      return { from: start.toISOString(), to: new Date(Math.min(end.getTime(), clock)).toISOString() }
    }
    const start = new Date(clock - (preset === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000)
    return { from: start.toISOString(), to: now.toISOString() }
  }, [clock, customEnd, customStart, preset])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = window.localStorage.getItem('ajr-access-token') || ''
      if (!token) throw new Error('Your administrator session has expired. Sign in again to view analytics.')
      const params = new URLSearchParams({ from: range.from, to: range.to })
      const response = await fetch(`/api/admin/visitor-analytics?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || 'Could not load visitor analytics.')
      setData(result)
    } catch (loadError: any) {
      setData(null)
      setError(loadError?.message || 'Could not load visitor analytics.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setClock(Date.now())
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const rows = useMemo(() => {
    return [...(data?.visitors || [])]
      .filter((row) => {
        const text = `${row.visitorId} ${PAGE_LABELS[row.page] || row.page} ${row.deviceType} ${row.operatingSystem} ${row.browser} ${row.visitorType} ${row.status} ${visitorActivityLabel(row)}`.toLowerCase()
        if (query && !text.includes(query.toLowerCase())) return false
        if (activityFilter === 'views' && row.eventName !== 'page_view' && row.eventName !== 'page_duration') return false
        if (activityFilter === 'commerce' && (row.eventName === 'page_view' || row.eventName === 'page_duration')) return false
        if (deviceFilter !== 'all' && row.deviceType !== deviceFilter) return false
        if (visitorTypeFilter !== 'all' && row.visitorType !== visitorTypeFilter) return false
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        return true
      })
      .sort((a, b) => {
        const result = sortBy === 'visitTime'
          ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
          : sortBy === 'visitor'
            ? a.visitorId.localeCompare(b.visitorId)
            : sortBy === 'device'
              ? a.deviceType.localeCompare(b.deviceType)
              : sortBy === 'page'
                ? (PAGE_LABELS[a.page] || a.page).localeCompare(PAGE_LABELS[b.page] || b.page)
                : sortBy === 'duration'
                  ? Number(a.durationMs || 0) - Number(b.durationMs || 0)
                  : sortBy === 'visitorType'
                    ? a.visitorType.localeCompare(b.visitorType)
                    : a.status.localeCompare(b.status)
        return sortDirection === 'asc' ? result : -result
      })
  }, [activityFilter, data?.visitors, deviceFilter, query, sortBy, sortDirection, statusFilter, visitorTypeFilter])

  const deviceTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of data?.devices || []) totals.set(entry.device, (totals.get(entry.device) || 0) + Number(entry.sessions || 0))
    const total = [...totals.values()].reduce((sum, value) => sum + value, 0)
    return ['desktop', 'mobile', 'tablet'].map((device) => ({
      device,
      sessions: totals.get(device) || 0,
      percent: total ? Math.round(((totals.get(device) || 0) / total) * 100) : 0,
    }))
  }, [data?.devices])

  const deviceTotal = deviceTotals.reduce((sum, device) => sum + device.sessions, 0)
  const maxPageViews = Math.max(1, ...(data?.pages || []).map((page) => page.views))
  const operatingSystems = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of data?.devices || []) totals.set(row.operatingSystem, (totals.get(row.operatingSystem) || 0) + row.sessions)
    return ['Android', 'iOS', 'Windows', 'macOS', 'Linux', 'Other']
      .map((name) => ({ name, sessions: totals.get(name) || 0 }))
  }, [data?.devices])
  const browsers = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of data?.devices || []) totals.set(row.browser, (totals.get(row.browser) || 0) + row.sessions)
    return [...totals.entries()]
      .map(([name, sessions]) => ({ name, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
      .slice(0, 5)
  }, [data?.devices])

  const openJourney = async (visitorId: string) => {
    setSelectedVisitor(visitorId)
    setJourney([])
    setJourneyError('')
    setJourneyLoading(true)
    try {
      const token = window.localStorage.getItem('ajr-access-token') || ''
      const params = new URLSearchParams({ visitorId })
      const response = await fetch(`/api/admin/visitor-analytics?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || 'Could not load this visitor journey.')
      setJourney(Array.isArray(result.journey) ? result.journey : [])
    } catch (journeyLoadError: any) {
      setJourneyError(journeyLoadError?.message || 'Could not load this visitor journey.')
    } finally {
      setJourneyLoading(false)
    }
  }

  const rangeLabel = preset === 'today'
    ? 'Today'
    : preset === 'yesterday'
      ? 'Yesterday'
      : preset === '7d'
        ? 'Last 7 days'
        : preset === '30d'
          ? 'Last 30 days'
          : `${customStart} — ${customEnd}`
  const analyticsAvailable = Boolean(data) && !error
  const analyticsStatus = error
    ? 'Disconnected'
    : loading
      ? data ? 'Refreshing' : 'Connecting'
      : data ? 'Live' : 'Unavailable'
  const initialLoading = loading && !data
  const unavailable = <span className="visitor-unavailable">Unavailable</span>
  const loadingValue = <span className="visitor-metric-loading">Loading…</span>
  const metricValue = (value: number | undefined) =>
    analyticsAvailable ? (value || 0).toLocaleString() : unavailable

  const products = data?.products ?? []

  return (
    <section className="visitor-analytics" aria-labelledby="visitor-analytics-title">
      <header className="visitor-heading">
        <div>
          <span className={`visitor-kicker visitor-status-${analyticsStatus.toLowerCase()}`}>
            {analyticsStatus === 'Live' && <span className="visitor-live-pulse" />}
            {analyticsStatus === 'Live' ? 'LIVE STORE SIGNAL' : analyticsStatus.toUpperCase()}
          </span>
          <h1 id="visitor-analytics-title">Visitor Analytics</h1>
          <p>Anonymous activity across your storefront. Refreshes every 30 seconds.</p>
        </div>
        <div className="visitor-heading-actions">
          <label className="visitor-date-range">
            <CalendarDays size={16} aria-hidden="true" />
            <span className="sr-only">Date range</span>
            <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <button className="button button-light visitor-refresh" type="button" onClick={() => setClock(Date.now())} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'visitor-refresh-spinning' : ''} /> Refresh
          </button>
        </div>
      </header>

      {preset === 'custom' && (
        <div className="visitor-custom-range">
          <label>From <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label>Through <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          <span>Ranges are limited to 90 days.</span>
        </div>
      )}

      {error && (
        <div className="visitor-error" role="alert">
          <AlertCircle size={17} /> <span>{error}</span>
          <button type="button" onClick={() => setClock(Date.now())}>Try again</button>
        </div>
      )}

      <div className="visitor-overview-note">
        <span><CalendarDays size={14} /> {rangeLabel}</span>
        <span>{analyticsAvailable ? `${data!.metrics.visitors.toLocaleString()} unique visitors in this range` : error ? 'Analytics data unavailable' : 'Checking analytics data'}</span>
        {analyticsAvailable && (
          <div className="visitor-signal-bars" aria-label={`${data!.metrics.onlineNow} visitors currently online`}>
            {Array.from({ length: 9 }, (_, index) => <span key={index} className={index < Math.min(9, data!.metrics.onlineNow) ? 'active' : ''} />)}
          </div>
        )}
        {data?.updatedAt && <span>Updated {formatTime(data.updatedAt)}</span>}
      </div>

      <section className="visitor-metrics" aria-label="Visitor metrics" aria-busy={loading}>
        <article className="visitor-metric visitor-metric-primary">
          <span>Visitors · selected period</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.visitors)}</strong>
          <small>{rangeLabel.toLowerCase()}</small>
          <Users size={19} aria-hidden="true" />
        </article>
        <article className="visitor-metric">
          <span>Currently online</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.onlineNow)}</strong>
          <small>Active in the last 5 minutes</small>
          {analyticsStatus === 'Live' && data!.metrics.onlineNow > 0 && <span className="visitor-online-mark" aria-hidden="true" />}
        </article>
        <article className="visitor-metric">
          <span>Today visitors</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.todayVisitors)}</strong>
          <small>Store time · Asia/Kolkata</small>
          <Users size={19} aria-hidden="true" />
        </article>
        <article className="visitor-metric">
          <span>Page views · selected period</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.pageViews)}</strong>
          <small>Across {rangeLabel.toLowerCase()}</small>
          <Eye size={19} aria-hidden="true" />
        </article>
        <article className="visitor-metric visitor-split-metric">
          <span>New &amp; returning</span>
          <strong>{initialLoading ? loadingValue : analyticsAvailable ? `${data!.metrics.newVisitors.toLocaleString()} / ${data!.metrics.returningVisitors.toLocaleString()}` : unavailable}</strong>
          <small><i className="visitor-dot new" /> First-time <i className="visitor-dot returning" /> Returning</small>
          <Activity size={19} aria-hidden="true" />
        </article>
        <article className="visitor-metric">
          <span>Last 7 days</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.weekVisitors)}</strong>
          <small>Unique visitors</small>
          <Users size={19} aria-hidden="true" />
        </article>
        <article className="visitor-metric">
          <span>Last 30 days</span>
          <strong>{initialLoading ? loadingValue : metricValue(data?.metrics.monthVisitors)}</strong>
          <small>Unique visitors</small>
          <CalendarDays size={19} aria-hidden="true" />
        </article>
      </section>

      <div className="visitor-primary-grid">
        <section className="visitor-panel visitor-activity-panel">
          <header className="visitor-panel-heading">
            <div><span className="panel-eyebrow">THE STORE, RIGHT NOW</span><h2>Recent activity</h2></div>
            <span className={`visitor-live-label visitor-live-label-${analyticsStatus.toLowerCase()}`}>
              {analyticsStatus === 'Live' && <span className="visitor-live-pulse" />}
              {analyticsStatus}
            </span>
          </header>
          {error ? (
            <div className="visitor-empty-state visitor-unavailable-state"><AlertCircle size={22} /><strong>Activity unavailable</strong><span>Store activity could not be loaded. Retry to reconnect analytics.</span></div>
          ) : data?.activity.length ? (
            <ol className="visitor-activity-stream">
              {data.activity.slice(0, 7).map((event, index) => (
                <li key={`${event.sessionId}-${event.createdAt}-${index}`}>
                  <span className={`visitor-activity-icon ${event.eventName === 'page_view' ? 'view' : 'commerce'}`}>
                    {event.eventName === 'page_view' || event.eventName === 'page_duration' ? <Eye size={15} /> : <ShoppingCart size={15} />}
                  </span>
                  <span className="visitor-activity-copy">
                    <strong>{eventLabel(event)}</strong>
                    <small>Visitor {event.visitorId.slice(0, 6).toUpperCase()} · {event.deviceType} · {PAGE_LABELS[event.page] || 'Store page'}</small>
                  </span>
                  <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                </li>
              ))}
            </ol>
          ) : loading ? (
            <div className="visitor-loading-state" aria-live="polite"><span className="visitor-loader" /> Loading visitor activity…</div>
          ) : (
            <div className="visitor-empty-state"><Activity size={22} /><strong>No activity in this range yet</strong><span>Once a visitor opts into anonymous analytics, their storefront activity will appear here.</span></div>
          )}
        </section>

        <section className="visitor-panel visitor-device-panel">
          <header className="visitor-panel-heading">
            <div><span className="panel-eyebrow">HOW THEY BROWSE</span><h2>Devices &amp; browsers</h2></div>
            <span className="visitor-total-tag">{initialLoading ? 'Loading…' : analyticsAvailable ? `${deviceTotal.toLocaleString()} sessions` : 'Unavailable'}</span>
          </header>
          {error ? (
            <div className="visitor-empty-state visitor-unavailable-state compact"><AlertCircle size={20} /><strong>Device data unavailable</strong><span>Reconnect analytics to view browser and device breakdowns.</span></div>
          ) : initialLoading ? (
            <div className="visitor-loading-state" aria-live="polite"><span className="visitor-loader" /> Loading device and browser data…</div>
          ) : <><div className="visitor-device-list">
            {deviceTotals.map((device) => (
              <div className="visitor-device-row" key={device.device}>
                <div className="visitor-device-label">{deviceIcon(device.device)}<span>{device.device[0].toUpperCase() + device.device.slice(1)}</span><strong>{device.percent}%</strong></div>
                <div className="visitor-device-track" role="progressbar" aria-label={`${device.device} share`} aria-valuenow={device.percent} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${device.percent}%` }} />
                </div>
                <small>{device.sessions.toLocaleString()} sessions</small>
              </div>
            ))}
          </div>
          <div className="visitor-breakdown">
            <span>Operating system</span>
            {operatingSystems.map((system) => (
              <div key={system.name}><span>{system.name}</span><strong>{system.sessions}</strong></div>
            ))}
            <span>Most-used browsers</span>
            {browsers.map((browser) => (
              <div key={browser.name}><span>{browser.name}</span><strong>{browser.sessions}</strong></div>
            ))}
            {analyticsAvailable && deviceTotal === 0 && <small>Device details appear with page views.</small>}
          </div></>}
        </section>
      </div>

      <div className="visitor-secondary-grid">
        <section className="visitor-panel visitor-table-panel">
          <header className="visitor-panel-heading visitor-table-heading">
            <div><span className="panel-eyebrow">ANONYMOUS VISITORS</span><h2>Activity by visitor</h2></div>
            <div className="visitor-tools">
              <label className="visitor-search"><Search size={15} /><span className="sr-only">Search visitors</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search visitor or page" /></label>
              <select aria-label="Filter activity type" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)}>
                <option value="all">All activity</option><option value="views">Page views</option><option value="commerce">Commerce</option>
              </select>
              <select aria-label="Filter by device" value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}>
                <option value="all">All devices</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option>
              </select>
              <select aria-label="Filter visitor type" value={visitorTypeFilter} onChange={(event) => setVisitorTypeFilter(event.target.value as typeof visitorTypeFilter)}>
                <option value="all">All visitors</option><option value="New">New</option><option value="Returning">Returning</option>
              </select>
              <select aria-label="Filter online status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">Any status</option><option value="Online">Online</option><option value="Offline">Offline</option>
              </select>
              <label className="visitor-sort">
                <span className="sr-only">Sort visitors by</span>
                <select aria-label="Sort visitors by" value={sortBy} onChange={(event) => setSortBy(event.target.value as VisitorSort)}>
                  <option value="visitTime">Visit time</option><option value="visitor">Visitor ID</option><option value="device">Device</option><option value="page">Page</option><option value="duration">Time spent</option><option value="visitorType">Visitor type</option><option value="status">Status</option>
                </select>
                <button type="button" aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`} onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? '↑' : '↓'}</button>
              </label>
            </div>
          </header>
          <div className="visitor-table-scroll" aria-busy={loading}>
            <table className="visitor-table">
              <thead><tr><th>Anonymous visitor ID</th><th>Visit time</th><th>Recent activity / page visited</th><th>Device</th><th>Operating system</th><th>Browser</th><th>Latest page time (session)</th><th>Visitor type</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.visitorId} onClick={() => void openJourney(row.visitorId)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openJourney(row.visitorId) } }}>
                    <td><code>{row.visitorId}</code><small>{row.events} events</small></td>
                    <td><time dateTime={row.createdAt}>{formatTime(row.createdAt)}</time></td>
                    <td><span className="visitor-activity-name">{visitorActivityLabel(row)}</span><small>{PAGE_LABELS[row.page] || 'Store page'}</small></td>
                    <td><span className="visitor-device-cell">{deviceIcon(row.deviceType)}{row.deviceType}</span></td>
                    <td>{row.operatingSystem}</td>
                    <td>{row.browser}</td>
                    <td>{row.durationMs ? `~${formatDuration(row.durationMs)}` : '—'}</td>
                    <td>{row.visitorType}</td>
                    <td><span className={`visitor-presence visitor-presence-${row.status.toLowerCase()}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {error ? (
              <div className="visitor-table-empty visitor-table-unavailable"><AlertCircle size={16} /> Visitor activity is unavailable.</div>
            ) : !rows.length && !loading && <div className="visitor-table-empty">No visitors match this filter.</div>}
            {loading && !data && <div className="visitor-table-empty" role="status"><span className="visitor-loader" /> Loading visitor activity…</div>}
          </div>
          <footer className="visitor-table-footer">
            {error
              ? 'Visitor activity unavailable'
              : initialLoading
                ? 'Loading visitor activity…'
                : `Latest ${rows.length} visitors (up to 200) · Select a visitor to view their journey`}
          </footer>
        </section>
      </div>

      <div className="visitor-tertiary-grid">
        <section className="visitor-panel visitor-pages-panel">
          <header className="visitor-panel-heading">
            <div><span className="panel-eyebrow">TOP PERFORMERS</span><h2>Most visited pages</h2></div>
            <span className="visitor-total-tag">{initialLoading ? 'Loading…' : analyticsAvailable ? `${data!.metrics.pageViews.toLocaleString()} views` : 'Unavailable'}</span>
          </header>
          {error ? (
            <div className="visitor-empty-state visitor-unavailable-state compact"><AlertCircle size={20} /><strong>Page views unavailable</strong><span>Reconnect analytics to view popular pages.</span></div>
          ) : initialLoading ? (
            <div className="visitor-loading-state" aria-live="polite"><span className="visitor-loader" /> Loading page views…</div>
          ) : data?.pages.length ? (
            <div className="visitor-pages-list">
              {data.pages.slice(0, 7).map((page) => (
                <div className="visitor-page-row" key={page.page}>
                  <div className="visitor-page-row-head"><span>{PAGE_LABELS[page.page] || 'Store page'}</span><strong>{page.views.toLocaleString()}</strong></div>
                  <div className="visitor-page-track"><span style={{ width: `${Math.max(3, (page.views / maxPageViews) * 100)}%` }} /></div>
                  <small><Eye size={12} /> {(page.uniqueVisitors || 0).toLocaleString()} unique · <Clock3 size={12} /> Avg. engagement {formatDuration(page.averageDurationMs)}</small>
                </div>
              ))}
            </div>
          ) : analyticsAvailable ? (
            <div className="visitor-empty-state compact"><Eye size={20} /><strong>No page views yet</strong><span>Page views will be charted once analytics consent is granted.</span></div>
          ) : (
            <div className="visitor-empty-state visitor-unavailable-state compact"><AlertCircle size={20} /><strong>Page views unavailable</strong><span>Connect to analytics to view popular pages.</span></div>
          )}
        </section>

        <section className="visitor-panel visitor-products-panel">
          <header className="visitor-panel-heading">
            <div><span className="panel-eyebrow">PRODUCT INTEREST</span><h2>Most viewed products</h2></div>
            <span className="visitor-total-tag">{initialLoading ? 'Loading…' : analyticsAvailable ? `${(data?.products || []).reduce((sum, product) => sum + product.views, 0).toLocaleString()} views` : 'Unavailable'}</span>
          </header>
          {error ? (
            <div className="visitor-empty-state visitor-unavailable-state compact"><AlertCircle size={20} /><strong>Product views unavailable</strong><span>Reconnect analytics to view product interest.</span></div>
          ) : initialLoading ? (
            <div className="visitor-loading-state" aria-live="polite"><span className="visitor-loader" /> Loading product views…</div>
          ) : products.length ? (
            <div className="visitor-products-list">
              {products.slice(0, 10).map((product, index) => (
                <div className="visitor-product-row" key={`${product.name}-${index}`}>
                  <span>{product.name}</span><strong>{product.views.toLocaleString()} views</strong><small>{product.uniqueVisitors.toLocaleString()} unique visitors</small>
                </div>
              ))}
            </div>
          ) : analyticsAvailable ? (
            <div className="visitor-empty-state compact"><Eye size={20} /><strong>No product views yet</strong><span>Product interest appears after an opted-in product-detail visit.</span></div>
          ) : (
            <div className="visitor-empty-state visitor-unavailable-state compact"><AlertCircle size={20} /><strong>Product views unavailable</strong><span>Connect to analytics to view product interest.</span></div>
          )}
        </section>
      </div>

      {selectedVisitor && (
        <div className="visitor-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVisitor(null) }}>
          <section className="visitor-drawer" role="dialog" aria-modal="true" aria-labelledby="visitor-journey-title" onKeyDown={(event) => { if (event.key === 'Escape') setSelectedVisitor(null) }}>
            <header>
              <div><span className="panel-eyebrow">ANONYMOUS JOURNEY</span><h2 id="visitor-journey-title">Visitor {selectedVisitor.slice(0, 6).toUpperCase()}</h2><p>No personal identifiers are collected.</p></div>
              <button type="button" className="visitor-drawer-close" onClick={() => setSelectedVisitor(null)} aria-label="Close visitor journey"><X size={18} /></button>
            </header>
            {journeyError && <p className="visitor-error" role="alert"><AlertCircle size={16} />{journeyError}</p>}
            {journeyLoading ? (
              <div className="visitor-loading-state"><span className="visitor-loader" /> Loading journey…</div>
            ) : journey.length ? (
              <ol className="visitor-journey-list">
                {journey.map((event, index) => (
                  <li key={`${event.createdAt}-${event.eventName}-${index}`}>
                    <span className="visitor-journey-node">{index === 0 ? <Eye size={14} /> : <Activity size={14} />}</span>
                    <div><strong>{eventLabel(event)}</strong><span>{PAGE_LABELS[event.page] || 'Store page'} · {event.deviceType} · {event.browser}</span><time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time></div>
                  </li>
                ))}
              </ol>
            ) : !journeyError ? (
              <div className="visitor-empty-state"><Activity size={22} /><strong>No journey events found</strong><span>The visitor may have opted out or their events may have expired.</span></div>
            ) : null}
            <footer>Journey history is limited to the latest 100 events.</footer>
          </section>
        </div>
      )}
    </section>
  )
}
