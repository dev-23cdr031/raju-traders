'use client'

import { Check, X, ShieldCheck, Sparkles, Award } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

const COMPARISONS = [
  {
    feature: 'Cashew Quality',
    ajr: 'We focus on good-quality cashews with great taste.',
    market: 'Cashews that taste fresh and have a pleasant crunch.',
    ajrGood: true,
  },
  {
    feature: 'Almond Quality',
    ajr: 'We aim to offer tasty almonds for everyday snacking.',
    market: 'Almonds with a natural flavour and good texture.',
    ajrGood: true,
  },
  {
    feature: 'Freshness',
    ajr: 'We focus on delivering products in good condition.',
    market: 'Dry fruits that smell fresh and taste good.',
    ajrGood: true,
  },
  {
    feature: 'Taste & Crunch',
    ajr: 'We value natural flavour and satisfying crunch.',
    market: "Nuts that aren't stale or unpleasantly soft.",
    ajrGood: true,
  },
  {
    feature: 'Cleanliness',
    ajr: 'We aim to maintain cleanliness when handling our products.',
    market: 'Clean products without visible dirt or unwanted particles.',
    ajrGood: true,
  },
  {
    feature: 'Packaging',
    ajr: 'We focus on packaging that keeps products protected.',
    market: 'Properly sealed packs with clear product information.',
    ajrGood: true,
  },
  {
    feature: 'Customer Satisfaction',
    ajr: 'We value customer trust and feedback.',
    market: 'Clear communication and helpful customer service.',
    ajrGood: true,
  },
]

export default function QualityComparison() {
  const { t } = useLanguage()
  return (
    <div className="quality-comparison-section">
      <div className="section-head text-center">
        <div>
          <p className="eyebrow justify-center">
            <Award size={14} /> {t('The AJR Difference')}
          </p>
          <h2>
            {t('Why Pure Sourcing')} <em>{t('Matters')}</em>
          </h2>
        </div>
        <p className="section-intro text-center">
          Not all dry fruits are created equal. Compare how AJR Nature sets a new benchmark for cleanliness, flavor, and integrity.
        </p>
      </div>

      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th className="feature-col">{t('Quality Factors')}</th>
              <th className="ajr-col">
                <div className="col-header-badge">
                  <Sparkles size={14} /> {t('AJR Nature')}
                </div>
              </th>
              <th className="market-col">{t('What Customers Should Look For')}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISONS.map((c, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'even-row' : ''}>
                <td className="feature-cell">
                  <strong>{t(c.feature)}</strong>
                </td>
                <td className="ajr-cell">
                  <div className="cell-content">
                    <span className="icon-badge-good">
                      <Check size={14} />
                    </span>
                    <span>{t(c.ajr)}</span>
                  </div>
                </td>
                <td className="market-cell">
                  <div className="cell-content">
                    <span className="icon-badge-bad">
                      <X size={14} />
                    </span>
                    <span>{t(c.market)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guarantee-banner">
        <div className="guarantee-icon">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h4>{t('100% Taste & Freshness Money-Back Guarantee')}</h4>
          <p>
            If any pack of AJR dry fruits or nuts does not meet your expectations in size, crunch, or flavor, we will replace it or refund your order with zero questions asked.
          </p>
        </div>
      </div>
    </div>
  )
}
