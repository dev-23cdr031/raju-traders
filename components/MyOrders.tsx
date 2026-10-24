'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Package, User } from 'lucide-react'
import { useLanguage, type Language } from '@/components/LanguageProvider'

export type MyOrderRow = {
  id: string
  order_number: string
  created_at: string
  items: any[]
  subtotal: number
  shipping: number
  total: number
  status: string
  payment_status: string
  payment_method: string
  customer_name: string
  email: string
  phone: string
  address: string
}

export const statusSlug = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const formatOrderDate = (value: string, language: Language) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  const locale = { en: 'en-IN', ta: 'ta-IN', ml: 'ml-IN', te: 'te-IN', hi: 'hi-IN' }[language]
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

// Customer-facing order history. /api/my/orders is scoped to the user id in the
// access token, so this can only ever show the signed-in customer's own orders.
export default function MyOrders({
  session,
  sessionLoaded,
  go,
}: {
  session: { id: string; email: string; name: string; phone: string; token: string } | null
  sessionLoaded: boolean
  go: (view: any) => void
}) {
  const { t, language } = useLanguage()
  const [orders, setOrders] = useState<MyOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/my/orders', {
        headers: { Authorization: `Bearer ${session!.token}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not load your orders.')
      setOrders(Array.isArray(data.orders) ? data.orders : [])
    } catch (e: any) {
      setOrders([])
      setError(e?.message || 'Could not load your orders.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setOrders([])
      setError('')
      setLoading(false)
      return
    }
    setOpenId(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session ? session.id : ''])

  if (!session && !sessionLoaded) {
    return (
      <main className="cart-page section">
        <p className="orders-note">{t('Checking your session…')}</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="cart-page section">
        <div className="cart-heading">
          <div>
            <p className="eyebrow">{t('Your Account')}</p>
            <h1>
              {t('My')} <em>{t('My orders.')}</em>
            </h1>
          </div>
          <span>{t('Not signed in')}</span>
        </div>
        <div className="empty">
          <User size={34} />
          <h2>{t('Please sign in.')}</h2>
          <p>{t('Your orders are stored with your account. Sign in to see them.')}</p>
          <button
            className="button button-dark"
            onClick={() => {
              window.location.href = '/login'
            }}
          >
            {t('Login')} <ArrowRight size={17} />
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="cart-page section">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">{t('Your Account')}</p>
          <h1>
            {t('My')} <em>{t('My orders.')}</em>
          </h1>
        </div>
        <span>
          {orders.length} {t(orders.length === 1 ? 'order' : 'orders')}
        </span>
      </div>

      {loading ? (
        <p className="orders-note">{t('Loading your orders…')}</p>
      ) : error ? (
        <div className="empty">
          <Package size={34} />
          <h2>{t('Could not load your orders.')}</h2>
          <p>{error}</p>
          <button className="button button-light" onClick={load}>
            {t('Try again')}
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="empty">
          <Package size={34} />
          <h2>{t('No orders yet.')}</h2>
          <p>{t('Place your first order and it will show up here with live status updates.')}</p>
          <button className="button button-dark" onClick={() => go('product')}>
            {t('Start shopping')} <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              open={openId === order.id}
              onToggle={() => setOpenId(openId === order.id ? null : order.id)}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function OrderCard({ order, open, onToggle }: { order: MyOrderRow; open: boolean; onToggle: () => void }) {
  const { t, language } = useLanguage()
  const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  return (
    <article className="order-card">
      <div className="order-card-head">
        <div>
          <strong className="order-number">{order.order_number}</strong>
          <span className="order-when">{formatOrderDate(order.created_at, language)}</span>
        </div>
        <div className="order-pills">
          <span className={`order-pill status-${statusSlug(order.status)}`}>{t(order.status)}</span>
          <span className={`order-pill pay-${statusSlug(order.payment_status)}`}>
            {t('Payment')} · {t(order.payment_status)}
          </span>
        </div>
      </div>

      <div className="order-lines">
        {(order.items || []).map((item, index) => (
          <div className="order-line" key={`${String(item.id)}-${index}`}>
            {item.image ? (
              <img src={item.image} alt={t(item.name)} />
            ) : (
              <span className="order-line-thumb" aria-hidden="true" />
            )}
            <div className="order-line-copy">
              <strong>{t(item.name)}</strong>
              <span>{[item.variety ? t(item.variety) : '', item.selectedWeight].filter(Boolean).join(' · ') || t(item.type || '')}</span>
            </div>
            <span className="order-line-qty">×{item.quantity}</span>
            <span className="order-line-price">₹{Number(item.price) * Number(item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="order-card-foot">
        <span>
          <strong>{itemCount}</strong> {t(itemCount === 1 ? 'item' : 'items')} · <strong>₹{order.total}</strong> {t('total')}
        </span>
        <button className="button button-light" onClick={onToggle}>
          {open ? t('Hide details') : t('View Order Details')}
        </button>
      </div>

      {open && (
        <div className="order-detail">
          <div>
            <span className="order-detail-label">{t('Deliver to')}</span>
            <p>
              <strong>{order.customer_name}</strong>
              <br />
              {order.address}
            </p>
          </div>
          <div>
            <span className="order-detail-label">{t('Contact')}</span>
            <p>
              {order.email}
              {order.phone ? (
                <>
                  <br />
                  {order.phone}
                </>
              ) : null}
            </p>
          </div>
          <div>
            <span className="order-detail-label">Payment</span>
            <p>
              {order.payment_method || 'COD'} · {order.payment_status}
            </p>
          </div>
          <div>
            <span className="order-detail-label">Summary</span>
            <p>
              Subtotal ₹{Number(order.subtotal ?? 0)}
              <br />
              Shipping {Number(order.shipping ?? 0) === 0 ? 'FREE' : `₹${order.shipping}`}
              <br />
              <strong>Total ₹{order.total}</strong>
            </p>
          </div>
        </div>
      )}
    </article>
  )
}
