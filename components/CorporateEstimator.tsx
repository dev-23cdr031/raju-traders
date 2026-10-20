'use client'

import { useState } from 'react'
import { Gift, Sparkles, Check, ArrowRight, ShieldCheck, Calculator } from 'lucide-react'

const HAMPER_TIERS = [
  { id: 'jute', name: 'Classic Eco Jute Bag', unitPrice: 599, image: '/dry-fruit-hero.png', desc: 'Sustainable woven jute bag with 3 glass jars of almonds, cashews & dates.' },
  { id: 'gold', name: 'Festive Gold Foil Box', unitPrice: 999, image: '/pistachio-premium.png', desc: 'Embossed gold foil box with 4 premium dry fruit jars & customized message card.' },
  { id: 'wood', name: 'Royal Keepsake Wooden Chest', unitPrice: 1699, image: '/nut-selection.png', desc: 'Laser-etched teakwood chest with 4 luxury jars including Kashmiri Walnuts & Pistachios.' },
]

const ADDONS = [
  { id: 'logo', label: 'Custom Corporate Logo Engraving', pricePerUnit: 49 },
  { id: 'ribbon', label: 'Custom Brand Ribbon & Card', pricePerUnit: 29 },
  { id: 'saffron', label: 'Add 1g Kashmiri Saffron Jar', pricePerUnit: 299 },
]

export default function CorporateEstimator({
  onFillForm,
}: {
  onFillForm: (data: { tier: string; qty: number; total: number }) => void
}) {
  const [tierIdx, setTierIdx] = useState(1)
  const [quantity, setQuantity] = useState(50)
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['logo', 'ribbon'])

  const activeTier = HAMPER_TIERS[tierIdx]

  const toggleAddon = (id: string) => {
    if (selectedAddons.includes(id)) {
      setSelectedAddons(selectedAddons.filter((a) => a !== id))
    } else {
      setSelectedAddons([...selectedAddons, id])
    }
  }

  const addonsPerUnit = selectedAddons.reduce((sum, aId) => {
    const addon = ADDONS.find((a) => a.id === aId)
    return sum + (addon ? addon.pricePerUnit : 0)
  }, 0)

  // Bulk quantity discount rates
  let discountRate = 0
  if (quantity >= 250) discountRate = 0.20
  else if (quantity >= 100) discountRate = 0.15
  else if (quantity >= 50) discountRate = 0.10

  const baseTotalPerUnit = activeTier.unitPrice + addonsPerUnit
  const discountedPerUnit = Math.round(baseTotalPerUnit * (1 - discountRate))
  const grandTotal = discountedPerUnit * quantity

  return (
    <div className="corporate-estimator-container">
      <div className="section-head text-center">
        <div>
          <p className="eyebrow justify-center">
            <Calculator size={14} /> Corporate &amp; Wedding Bulk Pricing
          </p>
          <h2>
            Interactive Hamper <em>Cost Estimator</em>
          </h2>
        </div>
        <p className="section-intro text-center">
          Calculate instant estimated costs for corporate hampers, festival gifts, and wedding favors with volume discounts.
        </p>
      </div>

      <div className="estimator-grid">
        {/* Left Side: Controls */}
        <div className="estimator-controls">
          <div className="control-block">
            <label className="block-label">1. Choose Gift Box Style</label>
            <div className="tier-selector-grid">
              {HAMPER_TIERS.map((tier, idx) => (
                <button
                  key={tier.id}
                  type="button"
                  className={`tier-btn ${tierIdx === idx ? 'active' : ''}`}
                  onClick={() => setTierIdx(idx)}
                >
                  <strong className="block text-sm">{tier.name}</strong>
                  <span className="text-xs text-muted-foreground">₹{tier.unitPrice} / unit</span>
                </button>
              ))}
            </div>
          </div>

          <div className="control-block">
            <div className="flex justify-between items-center mb-2">
              <label className="block-label">2. Select Order Quantity: <strong>{quantity} Units</strong></label>
              {discountRate > 0 && (
                <span className="discount-pill">
                  ⚡ {Math.round(discountRate * 100)}% Volume Discount Applied
                </span>
              )}
            </div>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="quantity-slider"
            />
            <div className="slider-ticks">
              <span>10 units</span>
              <span>50 units (10% OFF)</span>
              <span>100 units (15% OFF)</span>
              <span>250+ units (20% OFF)</span>
            </div>
          </div>

          <div className="control-block">
            <label className="block-label">3. Select Custom Branding Add-ons</label>
            <div className="addons-grid">
              {ADDONS.map((addon) => {
                const isSelected = selectedAddons.includes(addon.id)
                return (
                  <button
                    key={addon.id}
                    type="button"
                    className={`addon-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleAddon(addon.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`addon-check ${isSelected ? 'active' : ''}`}>
                        {isSelected && <Check size={12} />}
                      </div>
                      <span className="text-xs font-semibold">{addon.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">+₹{addon.pricePerUnit}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Total Summary Card */}
        <div className="estimator-summary-card">
          <div className="summary-badge">
            <Gift size={16} /> <span>Instant Quote Estimate</span>
          </div>

          <h3>{activeTier.name}</h3>
          <p className="tier-desc">{activeTier.desc}</p>

          <div className="calculation-breakdown">
            <div className="calc-row">
              <span>Base Tier Price</span>
              <span>₹{activeTier.unitPrice} / unit</span>
            </div>
            <div className="calc-row">
              <span>Selected Add-ons</span>
              <span>+₹{addonsPerUnit} / unit</span>
            </div>
            {discountRate > 0 && (
              <div className="calc-row discount">
                <span>Volume Discount</span>
                <span>-{Math.round(discountRate * 100)}%</span>
              </div>
            )}
            <div className="calc-row final-unit">
              <span>Effective Cost per Unit</span>
              <strong>₹{discountedPerUnit}</strong>
            </div>
          </div>

          <div className="total-cost-box">
            <span>Estimated Grand Total ({quantity} units)</span>
            <h2>₹{grandTotal.toLocaleString()}</h2>
            <p className="shipping-tag">
              <ShieldCheck size={13} /> Includes GST Invoice &amp; Doorstep Delivery Across India
            </p>
          </div>

          <button
            type="button"
            className="button button-light full text-center font-bold"
            onClick={() =>
              onFillForm({
                tier: activeTier.name,
                qty: quantity,
                total: grandTotal,
              })
            }
          >
            Request Official Corporate Deck &amp; Sample Box <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
