'use client'

import { useEffect, useState } from 'react'
import EmailAutomationStatus from './EmailAutomationStatus'

type Summary = {
  totalProductViews: number
  eligibleVisitors: number
  scheduled: number
  sent: number
  failures: number
  clicks: number
  purchases: number
  revenue: number
  history: {
    id: string; userId: string; email: string | null; productId: number; productName: string; productPrice: number; productImage: string; firstViewAt: string
    lastActivityAt: string; views: number; status: string; reason: string | null
    deliveryStatus: string | null; sentAt: string | null; clickedAt: string | null; error: string | null
  }[]
}

export default function ProductReminderAnalytics({ from, to }: { from: string; to: string }) {
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const token = window.localStorage.getItem('ajr-access-token') || ''
        const params = new URLSearchParams({ from, to, product, status })
        const response = await fetch(`/api/admin/product-reminders?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.message || 'Could not load product reminders.')
        setData(result)
      } catch (reason) {
        if (!controller.signal.aborted) {
          setData(null)
          setError(reason instanceof Error ? reason.message : 'Could not load product reminders.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [from, to, product, status])

  const metrics = data && [
    ['Product views (analytics consent)', data.totalProductViews],
    ['Opted-in visitors with pending reminders', data.eligibleVisitors],
    ['Scheduled', data.scheduled],
    ['Sent to provider', data.sent],
    ['Delivery failures / uncertain', data.failures],
    ['Reminders with link clicks', data.clicks],
    ['Attributed purchases', data.purchases],
    ['Attributed gross item value', `₹${Number(data.revenue).toLocaleString('en-IN')}`],
  ]

  return (
    <section className="visitor-panel" style={{ marginTop: 16 }} aria-labelledby="product-reminder-title">
      <EmailAutomationStatus />
      <header className="visitor-panel-heading">
        <div><span className="panel-eyebrow">MARKETING AUTOMATION</span><h2 id="product-reminder-title">Product reminder automation</h2></div>
        <div className="visitor-tools">
          <label>Product ID <input type="number" min="1" value={product} onChange={(event) => setProduct(event.target.value)} placeholder="All products" /></label>
          <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option><option value="pending">Pending</option><option value="sending">Sending</option>
            <option value="sent">Sent</option><option value="failed">Failed</option><option value="uncertain">Uncertain</option><option value="cancelled">Cancelled</option>
          </select></label>
        </div>
      </header>
      <p>Reminders require explicit product-marketing consent. Results use the selected date range for the original product visit; purchases count the same product within seven days after an email-link click. Automated link scanners may count as clicks. Gross item value is before discounts and uses recorded order prices, which may be customer-supplied.</p>
      {error && <p className="visitor-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading product reminders…</p>}
      {metrics && !error && <>
        <div className="visitor-metrics">
          {metrics.map(([label, value]) => <article className="visitor-metric" key={label}><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong></article>)}
        </div>
        <div className="visitor-table-scroll">
          <table className="visitor-table">
            <thead><tr><th>Customer</th><th>Product</th><th>First viewed</th><th>Last activity</th><th>Views</th><th>Status</th><th>Delivery</th><th>Sent</th></tr></thead>
            <tbody>{data!.history.map((entry) => <tr key={entry.id}>
              <td>{entry.email || 'Email unavailable'}<small><code>{entry.userId}</code></small></td>
              <td>{entry.productImage && <img src={entry.productImage} alt="" width={36} height={36} style={{ objectFit: 'cover', marginRight: 8 }} />}<a href={`/?product=${entry.productId}`} target="_blank" rel="noreferrer">{entry.productName}</a><small>#{entry.productId} · Base price ₹{Number(entry.productPrice).toLocaleString('en-IN')}</small></td>
              <td>{new Date(entry.firstViewAt).toLocaleString('en-IN')}</td><td>{new Date(entry.lastActivityAt).toLocaleString('en-IN')}</td><td>{entry.views}</td>
              <td>{entry.status}{entry.reason && <small>{entry.reason}</small>}{entry.error && <small>{entry.error}</small>}</td><td>{entry.deliveryStatus || '—'}</td>
              <td>{entry.sentAt ? new Date(entry.sentAt).toLocaleString('en-IN') : '—'}</td>
            </tr>)}</tbody>
          </table>
          {!data!.history.length && <div className="visitor-table-empty">No product reminders in this range.</div>}
        </div>
      </>}
    </section>
  )
}
