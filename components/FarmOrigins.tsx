'use client'

import { useState } from 'react'
import { MapPin, Sun, Calendar, Mountain, ArrowRight, ShieldCheck, Award } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

const ORIGINS = [
  {
    id: 'kashmir',
    region: 'Kashmir Valley, India',
    crop: 'Mammoth Snow Walnuts',
    elevation: '1,850m Altitude',
    climate: 'Glacial Mineral Soil & Crisp Alpine Air',
    harvestTime: 'September – October',
    image: '/dry-fruit-hero.png',
    quote: 'The snow-melt streams of Shopian give these walnuts their creamy texture and zero bitter aftertaste.',
    highlights: ['Hand-Cracked Halves', 'Rich in Omega-3 ALA', '100% Unbleached'],
  },
  {
    id: 'california',
    region: 'Central Valley, California',
    crop: 'Royal Independence Almonds',
    elevation: '300m Sunshine Valleys',
    climate: 'Mediterranean Warm Days & Cool Breezes',
    harvestTime: 'August – September',
    image: '/nut-selection.png',
    quote: 'Sun-ripened until the husks naturally split open, giving every almond a sweet, golden crunch.',
    highlights: ['Non-Pareil Supreme Grade', 'High Vitamin E', 'Lightly Steam Pasteurized'],
  },
  {
    id: 'mangalore',
    region: 'Coastal Mangalore, India',
    crop: 'Jumbo W240 Golden Cashews',
    elevation: 'Coastal Red Clay Orchards',
    climate: 'Tropical Monsoons & Humid Sea Breeze',
    harvestTime: 'February – May',
    image: '/pistachio-premium.png',
    quote: 'Hand-peeled by master artisans to preserve the delicate whole kernel and natural buttery sweetness.',
    highlights: ['Jumbo Size (W240 Grade)', 'Rich in Zinc & Magnesium', 'Zero Oil Roasting'],
  },
  {
    id: 'jordan',
    region: 'Jordan Rift Valley',
    crop: 'Medjool Date Reserve',
    elevation: '-300m Below Sea Level',
    climate: 'Desert Sun & Mineral Oasis Spring Water',
    harvestTime: 'August – October',
    image: '/dates-apricots.png',
    quote: 'Known as the King of Dates — soft, plump, and rich with natural caramel notes.',
    highlights: ['Super Jumbo Harvest', 'High Potassium & Fiber', 'Zero Added Sugar'],
  },
  {
    id: 'iran',
    region: 'Kerman Orchards, Iran',
    crop: 'Akbari Long Pistachios',
    elevation: '1,600m High Plateau',
    climate: 'Arid Desert Sunshine & Cool Mountain Nights',
    harvestTime: 'Late September',
    image: '/pistachio-premium.png',
    quote: 'Naturally open-shelled on the branch with a vibrant green kernel bursting with lutein.',
    highlights: ['Natural Tree-Split', 'Lightly Himalayan Salted', 'Rich Antioxidants'],
  },
]

export default function FarmOrigins({ go }: { go: (view: any) => void }) {
  const { t } = useLanguage()
  const [activeId, setActiveId] = useState('kashmir')
  const activeOrigin = ORIGINS.find((o) => o.id === activeId) || ORIGINS[0]

  return (
    <div className="farm-origins-section">
      <div className="section-head text-center">
        <div>
          <p className="eyebrow justify-center">
            <MapPin size={14} /> {t('Global Sourcing Transparency')}
          </p>
          <h2>
            {t('Where Every')} <em>{t('Handful Begins')}</em>
          </h2>
        </div>
        <p className="section-intro text-center">
          {t('We bypass commodity traders to partner directly with single-origin family orchards across the world’s finest growing micro-climates.')}
        </p>
      </div>

      {/* Origin Selector Pills */}
      <div className="origin-tabs">
        {ORIGINS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`origin-tab-btn ${activeId === o.id ? 'active' : ''}`}
            onClick={() => setActiveId(o.id)}
          >
            <MapPin size={14} />
            <span>{t(o.region.split(',')[0])}</span>
          </button>
        ))}
      </div>

      {/* Origin Display Card */}
      <div className="origin-card-display">
        <div className="origin-visual">
          <img src={activeOrigin.image} alt={t(activeOrigin.crop)} />
          <span className="crop-tag">
            <Award size={13} /> {t(activeOrigin.crop)}
          </span>
        </div>

        <div className="origin-details">
          <div className="region-badge">
            <MapPin size={14} /> <span>{t(activeOrigin.region)}</span>
          </div>
          <h3>{t(activeOrigin.crop)}</h3>
          
          <blockquote className="origin-quote">
            “{t(activeOrigin.quote)}”
          </blockquote>

          <div className="climate-grid">
            <div className="climate-item">
              <Mountain size={16} />
              <div>
                <strong>{t('Elevation')}</strong>
                <span>{t(activeOrigin.elevation)}</span>
              </div>
            </div>
            <div className="climate-item">
              <Sun size={16} />
              <div>
                <strong>{t('Growing Climate')}</strong>
                <span>{t(activeOrigin.climate)}</span>
              </div>
            </div>
            <div className="climate-item">
              <Calendar size={16} />
              <div>
                <strong>{t('Peak Harvest')}</strong>
                <span>{t(activeOrigin.harvestTime)}</span>
              </div>
            </div>
          </div>

          <div className="highlights-list">
            {activeOrigin.highlights.map((h) => (
              <span key={h} className="highlight-chip">
                <ShieldCheck size={13} /> {t(h)}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="button button-dark mt-4"
            onClick={() => go('product')}
          >
            {t('Taste Harvest')} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
