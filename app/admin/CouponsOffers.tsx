'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Archive,
  CalendarDays,
  Check,
  CheckCircle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Gift,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react'

type Coupon = Record<string, any> & {
  id: string
  code: string
  name: string
  status: string
  redemption_count: number
}
type Redemption = Record<string, any> & {
  id: string
  coupon_code: string
  order_id: string
  customer_name: string
}
type Metrics = {
  total: number
  active: number
  inactive: number
  scheduled: number
  expired: number
  successfulRedemptions: number
  discountTotal: number
  couponOrderValue: number
  averageOrderValue: number
  conversionRate: number | null
  mostPopularCoupon: string | null
  leastPopularCoupon: string | null
  truncated: boolean
}

const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const csvCell = (value: unknown) => {
  const raw = String(value ?? '')
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
  : 'Not recorded'
const localInputTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
const freshForm = () => ({
  code: '',
  name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '10',
  max_discount_amount: '',
  minimum_purchase: '0',
  maximum_order_amount: '',
  starts_at: localInputTime(new Date(Date.now() - 60_000).toISOString()),
  expires_at: localInputTime(new Date(Date.now() + 30 * 86400_000).toISOString()),
  active: true,
  is_public: true,
  show_to_customers: true,
  usage_limit: '',
  per_customer_limit: '',
  first_order_only: false,
  new_customers_only: false,
  existing_customers_only: false,
  eligible_product_ids: [] as number[],
  excluded_product_ids: [] as number[],
  eligible_categories: [] as string[],
  excluded_categories: [] as string[],
  eligible_customer_ids_text: '',
  promote: false,
  banner_title: '',
  banner_copy: '',
  banner_cta: 'Shop now',
  restore_usage_on_cancel: false,
})

const formFromCoupon = (coupon: Coupon) => ({
  ...freshForm(),
  code: coupon.code || '',
  name: coupon.name || '',
  description: coupon.description || '',
  discount_type: coupon.discount_type || 'percentage',
  discount_value: String(coupon.discount_value ?? 0),
  max_discount_amount: coupon.max_discount_amount == null ? '' : String(coupon.max_discount_amount),
  minimum_purchase: String(coupon.minimum_purchase ?? 0),
  maximum_order_amount: coupon.maximum_order_amount == null ? '' : String(coupon.maximum_order_amount),
  starts_at: localInputTime(coupon.starts_at),
  expires_at: localInputTime(coupon.expires_at),
  active: coupon.active !== false,
  is_public: coupon.is_public === true,
  show_to_customers: coupon.show_to_customers === true,
  usage_limit: coupon.usage_limit == null ? '' : String(coupon.usage_limit),
  per_customer_limit: coupon.per_customer_limit == null ? '' : String(coupon.per_customer_limit),
  first_order_only: coupon.first_order_only === true,
  new_customers_only: coupon.new_customers_only === true,
  existing_customers_only: coupon.existing_customers_only === true,
  eligible_product_ids: Array.isArray(coupon.eligible_product_ids) ? coupon.eligible_product_ids.map(Number) : [],
  excluded_product_ids: Array.isArray(coupon.excluded_product_ids) ? coupon.excluded_product_ids.map(Number) : [],
  eligible_categories: Array.isArray(coupon.eligible_categories) ? coupon.eligible_categories : [],
  excluded_categories: Array.isArray(coupon.excluded_categories) ? coupon.excluded_categories : [],
  eligible_customer_ids_text: Array.isArray(coupon.eligible_customer_ids) ? coupon.eligible_customer_ids.join('\n') : '',
  promote: coupon.promote === true,
  banner_title: coupon.banner_title || '',
  banner_copy: coupon.banner_copy || '',
  banner_cta: coupon.banner_cta || 'Shop now',
  restore_usage_on_cancel: coupon.restore_usage_on_cancel === true,
})

export default function CouponsOffers() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [usageByDate, setUsageByDate] = useState<{ date: string; redemptions: number; discount: number; orderValue: number }[]>([])
  const [productPerformance, setProductPerformance] = useState<{ name: string; quantity: number; orderValue: number }[]>([])
  const [products, setProducts] = useState<{ id: number; name: string; category: string }[]>([])
  const [attributionNote, setAttributionNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most' | 'least'>('newest')
  const [page, setPage] = useState(0)
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(freshForm)
  const [redemptionQuery, setRedemptionQuery] = useState('')
  const [redemptionFrom, setRedemptionFrom] = useState('')
  const [redemptionTo, setRedemptionTo] = useState('')
  const [redemptionFilter, setRedemptionFilter] = useState('All')
  const [redemptionLoading, setRedemptionLoading] = useState(false)
  const [redemptionError, setRedemptionError] = useState('')
  const [redemptionTruncated, setRedemptionTruncated] = useState(false)
  const [showRedemptions, setShowRedemptions] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState<Coupon | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      const [couponResponse, productsResponse] = await Promise.all([
        fetch('/api/admin/coupons', { headers, cache: 'no-store' }),
        fetch('/api/products?includeInactive=true', { headers, cache: 'no-store' }),
      ])
      const couponData = await couponResponse.json().catch(() => ({}))
      const productData = await productsResponse.json().catch(() => ({}))
      if (!couponResponse.ok) throw new Error(couponData?.message || 'Could not load coupon records.')
      if (!productsResponse.ok) throw new Error(productData?.message || 'Could not load product eligibility options.')
      setCoupons(Array.isArray(couponData.coupons) ? couponData.coupons : [])
      if (!showRedemptions) setRedemptions(Array.isArray(couponData.redemptions) ? couponData.redemptions : [])
      setMetrics(couponData.metrics || null)
      setUsageByDate(Array.isArray(couponData.usageByDate) ? couponData.usageByDate : [])
      setProductPerformance(Array.isArray(couponData.productPerformance) ? couponData.productPerformance : [])
      setAttributionNote(String(couponData.attributionNote || ''))
      setProducts((Array.isArray(productData.products) ? productData.products : []).map((product: any) => ({
        id: Number(product.id), name: String(product.name || ''), category: String(product.category || product.type || ''),
      })))
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load coupon records.')
    } finally {
      setLoading(false)
    }
  }, [showRedemptions])

  const loadRedemptions = useCallback(async () => {
    setRedemptionLoading(true)
    setRedemptionError('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const params = new URLSearchParams()
      if (redemptionFrom) params.set('from', redemptionFrom)
      if (redemptionTo) params.set('to', redemptionTo)
      if (redemptionFilter !== 'All') params.set('couponId', redemptionFilter)
      const response = await fetch(`/api/admin/coupons/redemptions?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Could not load redemption history.')
      setRedemptions(Array.isArray(data.redemptions) ? data.redemptions : [])
      setRedemptionTruncated(data.truncated === true)
    } catch (loadError: any) {
      setRedemptionError(loadError?.message || 'Could not load redemption history.')
    } finally {
      setRedemptionLoading(false)
    }
  }, [redemptionFrom, redemptionTo, redemptionFilter])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(0) }, [query, statusFilter, sortBy])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    if (showRedemptions) void loadRedemptions()
  }, [showRedemptions, loadRedemptions])

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(), [products])
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return coupons.filter((coupon) =>
      (!term || [coupon.code, coupon.name, coupon.description].some((value) => String(value || '').toLowerCase().includes(term)))
      && (statusFilter === 'All' || coupon.status === statusFilter))
      .sort((a, b) => sortBy === 'most'
        ? b.redemption_count - a.redemption_count
        : sortBy === 'least'
          ? a.redemption_count - b.redemption_count
          : sortBy === 'oldest'
            ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [coupons, query, sortBy, statusFilter])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)
  useEffect(() => { setPage((current) => Math.min(current, pageCount - 1)) }, [pageCount])
  const filteredRedemptions = useMemo(() => {
    const term = redemptionQuery.trim().toLowerCase()
    return redemptions.filter((row) =>
      !term || [row.coupon_code, row.customer_name, row.customer_email, row.order_id]
        .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [redemptions, redemptionQuery])

  const openNew = () => {
    setSelectedCoupon(null)
    setForm(freshForm())
    setEditorOpen(true)
    setNotice('')
    setError('')
  }
  const openEdit = (coupon: Coupon) => {
    setSelectedCoupon(coupon)
    setForm(formFromCoupon(coupon))
    setEditorOpen(true)
    setNotice('')
    setError('')
  }
  const updateForm = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }))
  const selection = (event: ChangeEvent<HTMLSelectElement>) =>
    Array.from(event.target.selectedOptions).map((option) => option.value)

  const formPayload = (values: ReturnType<typeof freshForm>) => ({
    ...values,
    discount_value: Number(values.discount_value),
    max_discount_amount: values.max_discount_amount.trim() === '' ? null : Number(values.max_discount_amount),
    minimum_purchase: Number(values.minimum_purchase),
    maximum_order_amount: values.maximum_order_amount.trim() === '' || Number(values.maximum_order_amount) === 0
      ? null
      : Number(values.maximum_order_amount),
    usage_limit: values.usage_limit.trim() === '' ? null : Number(values.usage_limit),
    per_customer_limit: values.per_customer_limit.trim() === '' ? null : Number(values.per_customer_limit),
    eligible_customer_ids: values.eligible_customer_ids_text.split(/[\s,;]+/).filter(Boolean),
  })

  const saveCoupon = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const body = formPayload(form)
      const response = await fetch(selectedCoupon ? `/api/admin/coupons/${selectedCoupon.id}` : '/api/admin/coupons', {
        method: selectedCoupon ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Could not save coupon.')
      setNotice(data.warning || 'Coupon saved.')
      setSelectedCoupon(data.coupon)
      setForm(formFromCoupon({ ...data.coupon, status: 'Active', redemption_count: 0 }))
      await load()
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save coupon.')
    } finally {
      setSaving(false)
    }
  }

  const quickUpdate = async (coupon: Coupon, changes: Record<string, unknown>, action: string) => {
    setError('')
    setNotice('')
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formPayload(formFromCoupon(coupon)), ...changes }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || `Could not ${action} coupon.`)
      setNotice(data.warning || `Coupon ${action}.`)
      await load()
    } catch (actionError: any) {
      setError(actionError?.message || `Could not ${action} coupon.`)
    }
  }

  const archiveCoupon = async () => {
    if (!confirmArchive) return
    setSaving(true)
    try {
      const token = localStorage.getItem('ajr-access-token') || ''
      const response = await fetch(`/api/admin/coupons/${confirmArchive.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ archived: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Could not archive coupon.')
      setConfirmArchive(null)
      setNotice('Coupon archived. Its redemption history is preserved.')
      await load()
    } catch (archiveError: any) {
      setError(archiveError?.message || 'Could not archive coupon.')
    } finally {
      setSaving(false)
    }
  }

  const duplicateCoupon = (coupon: Coupon) => {
    const duplicate = formFromCoupon(coupon)
    duplicate.code = `${coupon.code}-COPY`.slice(0, 40)
    duplicate.name = `${coupon.name} copy`.slice(0, 120)
    duplicate.active = false
    duplicate.promote = false
    setSelectedCoupon(null)
    setForm(duplicate)
    setEditorOpen(true)
    setNotice('Review the copied settings and choose a new code before saving.')
  }

  const exportCsv = () => {
    const columns = ['coupon_code', 'coupon_name', 'user_id', 'customer_name', 'customer_email', 'order_id', 'order_subtotal', 'discount_amount', 'shipping_discount_amount', 'final_total', 'redeemed_at', 'order_status', 'payment_status']
    const csv = [
      columns.join(','),
      ...filteredRedemptions.map((row) => columns.map((key) => csvCell(row[key])).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'ajr-coupon-redemptions.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const chartMax = Math.max(1, ...usageByDate.map((row) => row.redemptions))
  const discountChartMax = Math.max(1, ...usageByDate.map((row) => row.discount))
  const orderValueChartMax = Math.max(1, ...usageByDate.map((row) => row.orderValue))

  return (
    <section className="coupon-admin-page" aria-labelledby="coupons-title">
      <header className="admin-topbar coupon-admin-heading">
        <div>
          <span className="admin-kicker"><span className="admin-kicker-line" /> Offers with clear terms</span>
          <h1 id="coupons-title">Coupons <em>&amp; Offers</em></h1>
          <p className="admin-page-description">Create timed savings, control eligibility, and review actual order redemptions.</p>
        </div>
        <div className="coupon-heading-actions">
          <button className="button button-light" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
          <button className="button button-dark" type="button" onClick={openNew}><Plus size={16} /> Create coupon</button>
        </div>
      </header>

      {error && <div className="coupon-notice error" role="alert">{error}</div>}
      {notice && <div className="coupon-notice success" role="status"><CheckCircle size={16} /> {notice}</div>}
      {metrics?.truncated && <p className="coupon-truncated">Analytics are based on the latest 5,000 redemption records and 1,000 coupons.</p>}

      <div className="coupon-metrics" aria-label="Coupon statistics" aria-busy={loading}>
        <article className="coupon-stat"><span>Total coupons</span><strong>{metrics?.total.toLocaleString('en-IN') ?? '—'}</strong><small>Created in the coupon ledger</small></article>
        <article className="coupon-stat"><span>Active</span><strong>{metrics?.active.toLocaleString('en-IN') ?? '—'}</strong><small>Currently valid and enabled</small></article>
        <article className="coupon-stat"><span>Inactive</span><strong>{metrics?.inactive.toLocaleString('en-IN') ?? '—'}</strong><small>Disabled by an administrator</small></article>
        <article className="coupon-stat"><span>Scheduled</span><strong>{metrics?.scheduled.toLocaleString('en-IN') ?? '—'}</strong><small>Starts in the future</small></article>
        <article className="coupon-stat"><span>Expired</span><strong>{metrics?.expired.toLocaleString('en-IN') ?? '—'}</strong><small>Past their end time</small></article>
        <article className="coupon-stat"><span>Successful redemptions</span><strong>{metrics?.successfulRedemptions.toLocaleString('en-IN') ?? '—'}</strong><small>Non-cancelled, non-refunded orders</small></article>
        <article className="coupon-stat"><span>Discounts given</span><strong>{metrics ? money(metrics.discountTotal) : '—'}</strong><small>From recorded redemptions</small></article>
        <article className="coupon-stat"><span>Coupon order value</span><strong>{metrics ? money(metrics.couponOrderValue) : '—'}</strong><small>Not incremental revenue</small></article>
        <article className="coupon-stat"><span>Average order value</span><strong>{metrics ? money(metrics.averageOrderValue) : '—'}</strong><small>Orders with a successful coupon</small></article>
        <article className="coupon-stat coupon-stat-featured"><span>Most popular coupon</span><strong>{metrics?.mostPopularCoupon || 'Not recorded'}</strong><small>By successful redemptions</small></article>
        <article className="coupon-stat"><span>Least used active coupon</span><strong>{metrics?.leastPopularCoupon || 'Not recorded'}</strong><small>By successful redemptions</small></article>
        <article className="coupon-stat"><span>Coupon conversion</span><strong>{metrics?.conversionRate == null ? 'Not measurable' : `${metrics.conversionRate}%`}</strong><small>No coupon-view attribution is recorded</small></article>
      </div>

      <div className="coupon-analytics-grid">
        <section className="admin-panel coupon-chart-panel">
          <header><span className="panel-eyebrow">Daily activity · 14 days</span><h2>Successful coupon usage</h2></header>
          <div className="coupon-chart" role="img" aria-label="Coupon redemptions by day">
            {usageByDate.map((row) => (
              <div className="coupon-chart-column" key={row.date} title={`${row.date}: ${row.redemptions} redemptions`}>
                <span style={{ display: row.redemptions ? 'block' : 'none', height: `${Math.max(3, row.redemptions / chartMax * 100)}%` }} />
                <small>{row.date.slice(8)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel coupon-chart-panel">
          <header><span className="panel-eyebrow">Recorded coupon orders · 14 days</span><h2>Discounts &amp; attributed order value</h2></header>
          <div className="coupon-chart coupon-finance-chart" role="img" aria-label="Daily discount amount and coupon order value">
            {usageByDate.map((row) => (
              <div className="coupon-chart-column" key={row.date} title={`${row.date}: discounts ${money(row.discount)}, coupon order value ${money(row.orderValue)}`}>
                <div className="coupon-chart-pair">
                  <span className="coupon-bar-discount" style={{ display: row.discount ? 'block' : 'none', height: `${Math.max(3, row.discount / discountChartMax * 100)}%` }} />
                  <span className="coupon-bar-sales" style={{ display: row.orderValue ? 'block' : 'none', height: `${Math.max(3, row.orderValue / orderValueChartMax * 100)}%` }} />
                </div>
                <small>{row.date.slice(8)}</small>
              </div>
            ))}
          </div>
          <div className="coupon-chart-legend"><span><i className="legend-discount" /> Discounts</span><span><i className="legend-sales" /> Coupon order value</span></div>
          <small className="coupon-chart-footnote">Attributed order totals are not incremental revenue.</small>
        </section>
      </div>
      <section className="admin-panel coupon-chart-panel coupon-product-panel">
        <header><span className="panel-eyebrow">Recorded coupon orders</span><h2>Product performance</h2></header>
        {productPerformance.length ? productPerformance.map((item) => (
            <div className="coupon-product-performance" key={item.name}>
              <span>{item.name}<small>{item.quantity} items in coupon orders</small></span><strong>{money(item.orderValue)}</strong>
            </div>
        )) : <p className="coupon-muted">No successful coupon order items recorded yet.</p>}
        <small className="coupon-chart-footnote">Product order value is attributed to orders using a coupon; it does not prove incremental sales.</small>
      </section>
      <p className="coupon-attribution-note"><ShieldCheck size={14} /> {attributionNote || 'Coupon order totals are not estimates of incremental revenue.'}</p>

      <section className="admin-panel coupon-table-panel">
        <header className="coupon-section-heading">
          <div><span className="panel-eyebrow">Campaign ledger</span><h2>Coupon management</h2><p>Validity uses Asia/Kolkata time. Public listing excludes private, inactive, hidden, and expired codes.</p></div>
          <span className="coupon-count">{filtered.length} coupons</span>
        </header>
        <div className="coupon-filters">
          <label className="coupon-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or name" aria-label="Search coupons" /></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Active</option><option>Inactive</option><option>Scheduled</option><option>Expired</option><option>Archived</option></select></label>
          <label><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="most">Most used</option><option value="least">Least used</option></select></label>
        </div>
        {loading && !coupons.length ? <div className="coupon-empty"><RefreshCw size={18} /> Loading saved coupons…</div>
          : error && !coupons.length ? <div className="coupon-empty">Coupon records could not be loaded.</div>
            : filtered.length ? <div className="coupon-table-scroll" role="region" aria-label="Coupon records" tabIndex={0}>
              <table className="coupon-table">
                <thead><tr><th>Code / name</th><th>Discount</th><th>Minimum</th><th>Starts · expires (IST)</th><th>Usage</th><th>Visibility</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{pageRows.map((coupon) => (
                  <tr key={coupon.id}>
                    <td><strong className="coupon-code-cell">{coupon.code}</strong><span>{coupon.name}</span></td>
                    <td>{coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : coupon.discount_type === 'fixed' ? money(coupon.discount_value) : 'Free shipping'}</td>
                    <td>{money(coupon.minimum_purchase)}</td>
                    <td><span>{dateTime(coupon.starts_at)}</span><span>{dateTime(coupon.expires_at)}</span></td>
                    <td>{coupon.redemption_count}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' / ∞'}</td>
                    <td><span className={`coupon-visibility ${coupon.is_public && coupon.show_to_customers ? 'is-public' : 'is-private'}`}>{coupon.is_public && coupon.show_to_customers ? <><Eye size={13} /> Public</> : <><EyeOff size={13} /> Private</>}</span></td>
                    <td><span className={`coupon-status status-${String(coupon.status).toLowerCase()}`}>{coupon.status}</span></td>
                    <td><div className="coupon-row-actions">
                      <button type="button" className="coupon-icon-button" aria-label={`Edit ${coupon.code}`} onClick={() => openEdit(coupon)}><Tag size={15} /></button>
                      <button type="button" className="coupon-icon-button" aria-label={`Duplicate ${coupon.code}`} onClick={() => duplicateCoupon(coupon)}><Copy size={15} /></button>
                      <button type="button" className="coupon-icon-button" aria-label={`${coupon.is_public && coupon.show_to_customers ? 'Make private' : 'Make public'} ${coupon.code}`} onClick={() => void quickUpdate(coupon, { is_public: !(coupon.is_public && coupon.show_to_customers), show_to_customers: true }, 'visibility changed')}>{coupon.is_public && coupon.show_to_customers ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                      {coupon.status === 'Active'
                        ? <button type="button" className="coupon-icon-button" aria-label={`Deactivate ${coupon.code}`} onClick={() => void quickUpdate(coupon, { active: false }, 'deactivated')}><EyeOff size={15} /></button>
                        : coupon.status !== 'Archived' && <button type="button" className="coupon-icon-button" aria-label={`Activate ${coupon.code}`} onClick={() => void quickUpdate(coupon, { active: true }, 'activated')}><Check size={15} /></button>}
                      {coupon.status !== 'Archived' && <button type="button" className="coupon-icon-button is-danger" aria-label={`Archive ${coupon.code}`} onClick={() => setConfirmArchive(coupon)}><Archive size={15} /></button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div> : <div className="coupon-empty"><Gift size={20} /> No coupons match these filters.</div>}
        {filtered.length > 0 && <div className="coupon-pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span><div><button type="button" className="button button-light" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {pageCount}</span><button type="button" className="button button-light" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div></div>}
      </section>

      <section className="admin-panel coupon-redemption-panel">
        <header className="coupon-section-heading">
          <div><span className="panel-eyebrow">Customer &amp; order records</span><h2>Redemption history</h2><p>Private customer details are visible only in this admin-only view.</p></div>
          <div className="coupon-heading-actions">
            <button type="button" className="button button-light" onClick={() => setShowRedemptions((value) => !value)}><CalendarDays size={15} /> {showRedemptions ? 'Hide history' : 'Date filters'}</button>
            <button type="button" className="button button-light" onClick={exportCsv} disabled={!filteredRedemptions.length}><Download size={15} /> Export CSV</button>
          </div>
        </header>
        {showRedemptions && <div className="coupon-redemption-filters">
          <label><span>From</span><input type="date" value={redemptionFrom} onChange={(event) => setRedemptionFrom(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={redemptionTo} onChange={(event) => setRedemptionTo(event.target.value)} /></label>
          <label><span>Coupon</span><select value={redemptionFilter} onChange={(event) => setRedemptionFilter(event.target.value)}><option>All</option>{coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.code}</option>)}</select></label>
          <button type="button" className="button button-light" onClick={() => void loadRedemptions()} disabled={redemptionLoading}><RefreshCw size={14} /> Apply filters</button>
          <label className="coupon-search"><Search size={15} /><input value={redemptionQuery} onChange={(event) => setRedemptionQuery(event.target.value)} placeholder="Customer, order or code" aria-label="Search redemption history" /></label>
        </div>}
        {redemptionTruncated && <p className="coupon-truncated">Showing the latest 5,000 redemption records.</p>}
        {redemptionError && <p className="coupon-notice error" role="alert">{redemptionError}</p>}
        {redemptionLoading ? <div className="coupon-empty">Loading redemption history…</div>
          : !filteredRedemptions.length ? <div className="coupon-empty">No coupon redemptions have been recorded.</div>
            : <div className="coupon-table-scroll" role="region" aria-label="Coupon redemption history" tabIndex={0}>
              <table className="coupon-table coupon-redemptions-table">
                <thead><tr><th>Coupon</th><th>Customer</th><th>Order</th><th>Original amount</th><th>Discount</th><th>Final order amount</th><th>Redeemed</th><th>Order / payment</th></tr></thead>
                <tbody>{filteredRedemptions.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.coupon_code}</strong><span>{row.coupon_name}</span></td>
                    <td><strong>{row.customer_name || 'Not provided'}</strong><span>{row.customer_email || 'Not provided'}</span></td>
                    <td><span>{row.order_id}</span></td>
                    <td>{money(row.order_subtotal)}</td>
                    <td>−{money(row.discount_amount)}{Number(row.shipping_discount_amount) > 0 && <span>Shipping −{money(row.shipping_discount_amount)}</span>}</td>
                    <td>{money(row.final_total)}</td>
                    <td>{dateTime(row.redeemed_at)}</td>
                    <td><span>{row.order_status}</span><span>{row.payment_status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
      </section>

      {confirmArchive && <div className="coupon-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmArchive(null) }}>
        <section className="coupon-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="coupon-archive-title">
          <button type="button" className="coupon-modal-close" onClick={() => setConfirmArchive(null)} aria-label="Close"><X size={18} /></button>
          <Archive size={22} />
          <h2 id="coupon-archive-title">Archive {confirmArchive.code}?</h2>
          <p>Customers will no longer be able to use or discover this coupon. Existing redemption history will remain intact.</p>
          <div><button type="button" className="button button-light" onClick={() => setConfirmArchive(null)}>Keep coupon</button><button type="button" className="button button-dark" onClick={() => void archiveCoupon()} disabled={saving}>{saving ? 'Archiving…' : 'Archive coupon'}</button></div>
        </section>
      </div>}

      {editorOpen && <div className="coupon-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false) }}>
        <form className="coupon-editor-modal" onSubmit={saveCoupon} aria-labelledby="coupon-editor-title">
          <header><div><span className="panel-eyebrow">{selectedCoupon ? 'Edit campaign' : 'New campaign'}</span><h2 id="coupon-editor-title">{selectedCoupon ? `Edit ${selectedCoupon.code}` : 'Create coupon'}</h2></div><button type="button" className="coupon-modal-close" onClick={() => { setEditorOpen(false); setSelectedCoupon(null); setForm(freshForm()); setNotice('') }} aria-label="Close"><X size={18} /></button></header>
          <div className="coupon-editor-scroll">
            <div className="coupon-form-grid">
              <label><span>Coupon code</span><input required maxLength={40} value={form.code} onChange={(event) => updateForm('code', event.target.value.toUpperCase())} placeholder="AJR10" /></label>
              <label><span>Coupon name</span><input required maxLength={120} value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Welcome savings" /></label>
              <label className="coupon-form-wide"><span>Description / terms</span><textarea rows={2} maxLength={1000} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Terms customers should know" /></label>
              <label><span>Discount type</span><select value={form.discount_type} onChange={(event) => updateForm('discount_type', event.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option><option value="free_shipping">Free shipping</option></select></label>
              <label><span>Discount value {form.discount_type === 'percentage' ? '(%)' : '(₹)'}</span><input type="number" min="0" max={form.discount_type === 'percentage' ? '100' : undefined} step="0.01" value={form.discount_value} disabled={form.discount_type === 'free_shipping'} onChange={(event) => updateForm('discount_value', event.target.value)} /></label>
              <label><span>Maximum discount (₹)</span><input type="number" min="0" step="0.01" value={form.max_discount_amount} onChange={(event) => updateForm('max_discount_amount', event.target.value)} placeholder="No cap" /></label>
              <label><span>Minimum purchase (₹)</span><input required type="number" min="0" step="0.01" value={form.minimum_purchase} onChange={(event) => updateForm('minimum_purchase', event.target.value)} /></label>
              <label><span>Maximum eligible order (₹)</span><input type="number" min="0" step="0.01" value={form.maximum_order_amount} onChange={(event) => updateForm('maximum_order_amount', event.target.value)} placeholder="No maximum" /><small>Leave blank or enter 0 for no maximum. A positive value must be at least the minimum purchase.</small></label>
              <label><span>Starts (Asia/Kolkata)</span><input required type="datetime-local" value={form.starts_at} onChange={(event) => updateForm('starts_at', event.target.value)} /></label>
              <label><span>Expires (Asia/Kolkata)</span><input required type="datetime-local" value={form.expires_at} onChange={(event) => updateForm('expires_at', event.target.value)} /></label>
              <label><span>Total usage limit</span><input type="number" min="1" step="1" value={form.usage_limit} onChange={(event) => updateForm('usage_limit', event.target.value)} placeholder="Unlimited" /></label>
              <label><span>Usage limit per customer</span><input type="number" min="1" step="1" value={form.per_customer_limit} onChange={(event) => updateForm('per_customer_limit', event.target.value)} placeholder="Unlimited" /></label>
              <label><span>Eligible products</span><select multiple value={form.eligible_product_ids.map(String)} onChange={(event) => updateForm('eligible_product_ids', selection(event).map(Number))}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><small>Leave blank to include all products.</small></label>
              <label><span>Excluded products</span><select multiple value={form.excluded_product_ids.map(String)} onChange={(event) => updateForm('excluded_product_ids', selection(event).map(Number))}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <label><span>Eligible categories</span><select multiple value={form.eligible_categories} onChange={(event) => updateForm('eligible_categories', selection(event))}>{categories.map((category) => <option key={category}>{category}</option>)}</select><small>Product and category restrictions combine.</small></label>
              <label><span>Excluded categories</span><select multiple value={form.excluded_categories} onChange={(event) => updateForm('excluded_categories', selection(event))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="coupon-form-wide"><span>Eligible customer IDs (optional, one per line)</span><textarea rows={2} autoComplete="off" spellCheck={false} value={form.eligible_customer_ids_text} onChange={(event) => updateForm('eligible_customer_ids_text', event.target.value)} placeholder="Supabase user UUIDs" /><small>Use the customer's Supabase Auth UUID, not their email. Leave blank to allow all customers.</small></label>
            </div>
            <div className="coupon-toggle-grid">
              <label><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span>Active</span></label>
              <label><input type="checkbox" checked={form.is_public} onChange={(event) => updateForm('is_public', event.target.checked)} /><span>Public coupon (code may be listed)</span></label>
              <label><input type="checkbox" checked={form.show_to_customers} onChange={(event) => updateForm('show_to_customers', event.target.checked)} /><span>Show to customers</span></label>
              <label><input type="checkbox" checked={form.first_order_only} onChange={(event) => updateForm('first_order_only', event.target.checked)} /><span>First order only</span></label>
              <label><input type="checkbox" checked={form.new_customers_only} onChange={(event) => updateForm('new_customers_only', event.target.checked)} /><span>New customers only</span></label>
              <label><input type="checkbox" checked={form.existing_customers_only} onChange={(event) => updateForm('existing_customers_only', event.target.checked)} /><span>Existing customers only</span></label>
              <label><input type="checkbox" checked={form.restore_usage_on_cancel} onChange={(event) => updateForm('restore_usage_on_cancel', event.target.checked)} /><span>Restore usage on cancellation</span></label>
              <label><input type="checkbox" checked={form.promote} disabled={!form.is_public || !form.show_to_customers} onChange={(event) => updateForm('promote', event.target.checked)} /><span>Feature as homepage banner</span></label>
            </div>
            {form.promote && <div className="coupon-form-grid coupon-banner-fields">
              <label><span>Banner title</span><input maxLength={100} value={form.banner_title} onChange={(event) => updateForm('banner_title', event.target.value)} placeholder="Special offer" /></label>
              <label><span>Banner button</span><input maxLength={40} value={form.banner_cta} onChange={(event) => updateForm('banner_cta', event.target.value)} /></label>
              <label className="coupon-form-wide"><span>Banner copy</span><textarea rows={2} maxLength={300} value={form.banner_copy} onChange={(event) => updateForm('banner_copy', event.target.value)} /></label>
            </div>}
            <p className="coupon-form-hint"><ShieldCheck size={15} /> One coupon per order is supported. Buy-X-get-Y and coupon stacking are not enabled. Cancellation restores usage only when the coupon setting above is enabled. Refunded orders are excluded from sales metrics, but refunds do not automatically restore usage.</p>
            {error && <p className="coupon-notice error" role="alert">{error}</p>}
            {notice && <p className="coupon-notice success" role="status">{notice}</p>}
          </div>
          <footer><button type="button" className="button button-light" onClick={() => { setEditorOpen(false); setSelectedCoupon(null); setForm(freshForm()); setNotice('') }}>Close</button><button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Saving…' : selectedCoupon ? 'Save changes' : 'Create coupon'}</button></footer>
        </form>
      </div>}
    </section>
  )
}
