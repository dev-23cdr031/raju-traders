'use client'

import { Check, X, ShieldCheck, Sparkles, Award } from 'lucide-react'

const COMPARISONS = [
  {
    feature: 'Kernel Grade & Sizing',
    ajr: 'Hand-sorted Jumbo W240 Cashews & Mammoth Kashmiri Walnuts',
    market: 'Mixed size fragments, split kernels, & Grade-B defect pieces',
    ajrGood: true,
  },
  {
    feature: 'Chemical Bleaching & Treatment',
    ajr: '100% Unbleached & Chemical-Free natural shade',
    market: 'Chlorine bleached or sulfur dioxide treated for artificial shine',
    ajrGood: true,
  },
  {
    feature: 'Moisture Control & Crispness',
    ajr: 'Nitrogen-flushed small batches within 24h of roasting',
    market: 'Stored in open burlap sacks in warehouses for 6–12 months',
    ajrGood: true,
  },
  {
    feature: 'Additives & Preservatives',
    ajr: 'Zero mineral oil, no added sugar, zero synthetic glazes',
    market: 'Coated in cheap vegetable oil or glucose syrup to add weight',
    ajrGood: true,
  },
  {
    feature: 'Packaging & Shelf Preservation',
    ajr: 'Eco Jute Pouches, Reusable Glass Jars & Laser Wood Hampers',
    market: 'Thin single-use plastic bags susceptible to oxidation',
    ajrGood: true,
  },
  {
    feature: 'Farmer Pay & Traceability',
    ajr: 'Direct Fair-Trade contracts guaranteeing 25% above market rate',
    market: 'Complex middleman supply chains exploiting small growers',
    ajrGood: true,
  },
]

export default function QualityComparison() {
  return (
    <div className="quality-comparison-section">
      <div className="section-head text-center">
        <div>
          <p className="eyebrow justify-center">
            <Award size={14} /> The AJR Difference
          </p>
          <h2>
            Why Pure Sourcing <em>Matters</em>
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
              <th className="feature-col">Quality Benchmark</th>
              <th className="ajr-col">
                <div className="col-header-badge">
                  <Sparkles size={14} /> AJR Pure Sourcing
                </div>
              </th>
              <th className="market-col">Generic Market Brands</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISONS.map((c, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'even-row' : ''}>
                <td className="feature-cell">
                  <strong>{c.feature}</strong>
                </td>
                <td className="ajr-cell">
                  <div className="cell-content">
                    <span className="icon-badge-good">
                      <Check size={14} />
                    </span>
                    <span>{c.ajr}</span>
                  </div>
                </td>
                <td className="market-cell">
                  <div className="cell-content">
                    <span className="icon-badge-bad">
                      <X size={14} />
                    </span>
                    <span>{c.market}</span>
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
          <h4>100% Taste &amp; Freshness Money-Back Guarantee</h4>
          <p>
            If any pack of AJR dry fruits or nuts does not meet your expectations in size, crunch, or flavor, we will replace it or refund your order with zero questions asked.
          </p>
        </div>
      </div>
    </div>
  )
}
