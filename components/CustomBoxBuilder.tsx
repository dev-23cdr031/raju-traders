'use client'

import { useState } from 'react'
import { Check, Plus, Trash2, ShoppingBag, Sparkles, Gift } from 'lucide-react'

type Product = { id: number; name: string; type: string; price: number; color: string; image: string; detail: string }

const BOX_OPTIONS: { name: string; type: string; price: number; image: string; tag: string }[] = [
  { name: 'Royal California Almonds', type: 'Almonds', price: 449, image: '/nut-selection.png', tag: 'High Protein' },
  { name: 'Jumbo Golden Cashews', type: 'Cashews', price: 549, image: '/pistachio-premium.png', tag: 'Creamy' },
  { name: 'Kashmiri Mammoth Walnuts', type: 'Walnuts', price: 599, image: '/dry-fruit-hero.png', tag: 'Omega-3 Rich' },
  { name: 'Medjool Date Reserve', type: 'Dates', price: 399, image: '/dates-apricots.png', tag: 'Natural Caramel' },
  { name: 'Iranian Pistachios', type: 'Pistachios', price: 649, image: '/pistachio-premium.png', tag: 'Lightly Salted' },
  { name: 'Sun-Dried Afghan Figs', type: 'Figs', price: 499, image: '/dates-apricots.png', tag: 'Fiber Packed' },
]

const WEIGHT_MULTIPLIERS = [
  { label: '250g Packets', factor: 1, discount: '' },
  { label: '500g Packs (Save 10%)', factor: 1.8, discount: '10% OFF' },
  { label: '1kg Royal Tins (Save 18%)', factor: 3.2, discount: '18% OFF' },
]

const BOX_STYLES = [
  { id: 'jute', label: 'Eco-Friendly Jute Bag', fee: 0, desc: 'Sustainable woven jute pouch with cotton ribbon tie.' },
  { id: 'wood', label: 'Royal Wooden Gift Box', fee: 249, desc: 'Laser-etched keepsake wooden box with velvet lining.' },
  { id: 'festive', label: 'Festive Gold Foil Hamper', fee: 149, desc: 'Embossed gold foil box with personalized gift card.' },
]

export default function CustomBoxBuilder({ addToCart }: { addToCart: (product: Product, qty?: number) => void }) {
  const [selectedItems, setSelectedItems] = useState<typeof BOX_OPTIONS>([
    BOX_OPTIONS[0],
    BOX_OPTIONS[1],
    BOX_OPTIONS[3],
  ])
  const [weightIdx, setWeightIdx] = useState(0)
  const [boxStyleIdx, setBoxStyleIdx] = useState(1)
  const [added, setAdded] = useState(false)

  const toggleItem = (item: typeof BOX_OPTIONS[0]) => {
    if (selectedItems.some((i) => i.name === item.name)) {
      if (selectedItems.length > 1) {
        setSelectedItems(selectedItems.filter((i) => i.name !== item.name))
      }
    } else {
      if (selectedItems.length < 4) {
        setSelectedItems([...selectedItems, item])
      }
    }
  }

  const itemsBaseSum = selectedItems.reduce((acc, item) => acc + item.price, 0)
  const weightFactor = WEIGHT_MULTIPLIERS[weightIdx].factor
  const packagingFee = BOX_STYLES[boxStyleIdx].fee
  const calculatedPrice = Math.round(itemsBaseSum * weightFactor + packagingFee)

  const handleAddToCart = () => {
    const customProduct: Product = {
      id: Date.now(),
      name: `Custom ${selectedItems.length}-Item Harvest Box (${WEIGHT_MULTIPLIERS[weightIdx].label.split(' ')[0]})`,
      type: 'Custom Box',
      price: calculatedPrice,
      color: 'forest',
      image: selectedItems[0]?.image || '/dry-fruit-hero.png',
      detail: `Custom hamper containing: ${selectedItems.map((i) => i.name).join(', ')}. Packed in ${BOX_STYLES[boxStyleIdx].label}.`,
    }
    addToCart(customProduct, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 2500)
  }

  return (
    <div className="custom-box-builder">
      <div className="builder-header">
        <div className="builder-badge">
          <Sparkles size={15} /> <span>Interactive Hamper Studio</span>
        </div>
        <h2>Build Your Custom <em>Harvest Box</em></h2>
        <p>Pick up to 4 premium dry fruits, choose your pack size, and select signature packaging.</p>
      </div>

      <div className="builder-grid">
        {/* Left Side: Selectors */}
        <div className="builder-controls">
          <div className="control-step">
            <div className="step-num">Step 1</div>
            <h3>Select 2 to 4 Dry Fruits & Nuts</h3>
            <span className="step-hint">{selectedItems.length}/4 selected</span>
            <div className="items-selector-grid">
              {BOX_OPTIONS.map((item) => {
                const isSelected = selectedItems.some((i) => i.name === item.name)
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`item-select-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleItem(item)}
                  >
                    <div className="item-img-wrapper">
                      <img src={item.image} alt={item.name} />
                      {isSelected && (
                        <span className="check-badge">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div className="item-text">
                      <span className="item-tag">{item.tag}</span>
                      <strong className="item-title">{item.name}</strong>
                      <span className="item-price">₹{item.price} / 250g</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="control-step">
            <div className="step-num">Step 2</div>
            <h3>Choose Pack Quantity</h3>
            <div className="weight-options">
              {WEIGHT_MULTIPLIERS.map((w, idx) => (
                <button
                  key={w.label}
                  type="button"
                  className={`weight-btn ${weightIdx === idx ? 'active' : ''}`}
                  onClick={() => setWeightIdx(idx)}
                >
                  <span>{w.label}</span>
                  {w.discount && <b className="discount-tag">{w.discount}</b>}
                </button>
              ))}
            </div>
          </div>

          <div className="control-step">
            <div className="step-num">Step 3</div>
            <h3>Select Packaging Finish</h3>
            <div className="style-options">
              {BOX_STYLES.map((style, idx) => (
                <button
                  key={style.id}
                  type="button"
                  className={`style-card ${boxStyleIdx === idx ? 'active' : ''}`}
                  onClick={() => setBoxStyleIdx(idx)}
                >
                  <div className="style-info">
                    <strong>{style.label}</strong>
                    <p>{style.desc}</p>
                  </div>
                  <span className="style-fee">{style.fee === 0 ? 'FREE' : `+₹${style.fee}`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Live Box Preview Card */}
        <div className="builder-preview-sticky">
          <div className="preview-card">
            <div className="preview-badge">
              <Gift size={16} /> <span>Your Signature Creation</span>
            </div>
            
            <div className="preview-visual">
              <div className="preview-box-mock">
                {selectedItems.map((item, idx) => (
                  <div key={item.name} className={`preview-item-slot slot-${idx}`}>
                    <img src={item.image} alt={item.name} />
                    <span>{item.type}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="preview-details">
              <h4>Custom Harvest Hamper</h4>
              <p className="packaging-label">
                Packed in: <strong>{BOX_STYLES[boxStyleIdx].label}</strong>
              </p>
              
              <ul className="selected-summary-list">
                {selectedItems.map((item) => (
                  <li key={item.name}>
                    <Check size={14} className="icon-check" />
                    <span>{item.name}</span>
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => toggleItem(item)}
                      className="remove-item-btn"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="price-breakdown">
                <div className="price-row">
                  <span>Custom Box Subtotal</span>
                  <strong>₹{calculatedPrice}</strong>
                </div>
                <div className="free-ship-note">
                  <Check size={13} /> Free Insured Express Shipping Included
                </div>
              </div>

              <button
                type="button"
                className={`button button-dark full add-box-btn ${added ? 'added-success' : ''}`}
                onClick={handleAddToCart}
              >
                {added ? (
                  <>
                    <Check size={18} /> Custom Box Added!
                  </>
                ) : (
                  <>
                    <ShoppingBag size={18} /> Add Custom Box to Cart — ₹{calculatedPrice}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
