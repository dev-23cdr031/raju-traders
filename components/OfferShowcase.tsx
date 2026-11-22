'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, Copy, Gift, Sparkles } from 'lucide-react'

type Offer = {
  id: string
  code: string
  name: string
  description: string
  discount_type: string
  discount_value: number
  max_discount_amount: number | null
  minimum_purchase: number
  expires_at: string
  promote: boolean
  banner_title: string
  banner_copy: string
  banner_cta: string
}

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const discountLabel = (offer: Offer) => offer.discount_type === 'percentage'
  ? `${offer.discount_value}% off`
  : offer.discount_type === 'fixed' ? `${money(offer.discount_value)} off` : 'Free shipping'

export default function OfferShowcase({
  onApply,
  compact = false,
}: {
  onApply?: (code: string) => void
  compact?: boolean
}) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadOffers = async () => {
      try {
        const response = await fetch('/api/coupons', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.message || 'Offers could not be loaded.')
        if (active) {
          setOffers(Array.isArray(data.offers) ? data.offers : [])
          setError('')
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || 'Offers could not be loaded.')
      }
    }
    void loadOffers()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOffers()
    }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const copyCode = async (offer: Offer) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(offer.code)
      } else {
        const input = document.createElement('textarea')
        input.value = offer.code
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copiedSuccessfully = document.execCommand('copy')
        input.remove()
        if (!copiedSuccessfully) throw new Error('Clipboard access is unavailable.')
      }
      setCopied(offer.id)
      setError('')
      window.setTimeout(() => setCopied(''), 1800)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Coupon code could not be copied.')
    }
  }

  if (!offers.length && !error) return null
  const visibleOffers = compact ? offers.slice(0, 3) : offers
  const promoted = visibleOffers.find((offer) => offer.promote)

  return (
    <section className={`offer-showcase ${compact ? 'offer-showcase-compact' : ''}`} aria-labelledby={compact ? 'home-offers-title' : 'cart-offers-title'}>
      {promoted && <div className="offer-promo-banner">
        <Sparkles size={18} aria-hidden="true" />
        <div><strong>{promoted.banner_title || `${discountLabel(promoted)} with ${promoted.code}`}</strong><span>{promoted.banner_copy || promoted.description || `Use code ${promoted.code} on eligible orders.`}</span></div>
        {onApply && <button type="button" onClick={() => onApply(promoted.code)}>{promoted.banner_cta || 'Shop now'} <ArrowRight size={15} /></button>}
      </div>}
      <header className="offer-showcase-heading">
        <div><span className="offer-eyebrow"><Gift size={14} /> AJR rewards</span><h2 id={compact ? 'home-offers-title' : 'cart-offers-title'}>{compact ? 'Exclusive Offers for You!' : 'Available Coupons'}</h2>
          {!compact && <p>Enjoy more savings on your favourite dry fruits with special offers from AJR Nature.</p>}
        </div>
      </header>
      {error && <p className="offer-load-error" role="status">{error}</p>}
      <div className="offer-card-grid">
        {visibleOffers.map((offer) => (
          <article className="offer-card" key={offer.id}>
            <div className="offer-card-top"><span className="offer-discount">{discountLabel(offer)}</span><span className="offer-expiry">Until {new Date(offer.expires_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}</span></div>
            <h3>{offer.name}</h3>
            <p>{offer.description || `Use ${offer.code} to save on your AJR order.`}</p>
            <div className="offer-conditions">
              {Number(offer.minimum_purchase) > 0 && <span>Minimum order {money(Number(offer.minimum_purchase))}</span>}
              {offer.max_discount_amount != null && offer.discount_type === 'percentage' && <span>Up to {money(Number(offer.max_discount_amount))} off</span>}
              {offer.discount_type === 'free_shipping' && <span>Shipping charges waived</span>}
            </div>
            <div className="offer-card-actions"><button type="button" className="offer-copy-code" onClick={() => void copyCode(offer)} aria-label={`Copy coupon ${offer.code}`}>
              <span>{offer.code}</span>{copied === offer.id ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy code</>}
            </button>{onApply && <button type="button" className="offer-apply-button" onClick={() => onApply(offer.code)}>Apply <ArrowRight size={14} /></button>}</div>
          </article>
        ))}
      </div>
      {!visibleOffers.length && error && <p className="offer-empty">Offers are temporarily unavailable.</p>}
    </section>
  )
}
