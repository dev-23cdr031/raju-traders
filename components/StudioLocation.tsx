'use client'

import { MapPin, Navigation, Check } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

export default function StudioLocation() {
  const { t } = useLanguage()

  const capabilities = [
    ['🥜', 'Taste & Discover', 'Experience selected AJR nuts, dry fruits and speciality products.'],
    ['🎁', 'Create Your Own Gift Box', 'Choose your favourites and build a personalised AJR gift box.'],
    ['🍯', 'Explore Our Collection', 'Premium cashews, almonds, seeds, honey, dry fruits and exclusive varieties.'],
    ['📦', 'Bulk & Wholesale Orders', 'Special assistance for retailers, businesses, events and bulk requirements.'],
  ] as const

  const features = ['Product Tasting', 'Custom Gift Boxes', 'Wholesale Orders', 'Premium Collection']

  return (
    <div className="studio-location-container">
      <div className="section-head">
        <div>
          <p className="eyebrow">
            <MapPin size={14} /> {t('AJR • Virudhunagar')}
          </p>
          <h2>
            {t('AJR — Virudhunagar')}
          </h2>
          <p className="studio-subtitle">{t('Premium Dry Fruits • Nuts • Seeds • Honey')}</p>
        </div>
        <p className="section-intro">
          {t('Discover the world of AJR in person. Explore our premium collection, taste selected products, customise gift boxes, and find the perfect choice for your everyday needs or special occasions.')}
        </p>
      </div>

      <div className="studio-card-grid">
        {/* Left side: AJR discovery point information and actions */}
        <div className="studio-info-card">
          <div className="studio-status-row">
            <span className="city-tag">{t('AJR • Virudhunagar')}</span>
          </div>

          <h3>{t('AJR — Virudhunagar')}</h3>
          <p className="studio-card-subtitle">{t('Premium Dry Fruits • Nuts • Seeds • Honey')}</p>
          <p className="studio-address">
            <MapPin size={16} /> 14, TC Godown Street, Vadiyan St, Virudhunagar, Tamil Nadu 626001
          </p>

          <p className="studio-discovery-intro">
            {t('Discover the world of AJR in person. Explore our premium collection, taste selected products, customise gift boxes, and find the perfect choice for your everyday needs or special occasions.')}
          </p>

          <div className="studio-capabilities" aria-label={t('AJR Virudhunagar services')}>
            {capabilities.map(([icon, title, description]) => (
              <article className="studio-capability" key={title}>
                <span className="studio-capability-icon" aria-hidden="true">{icon}</span>
                <div>
                  <h4>{t(title)}</h4>
                  <p>{t(description)}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="studio-features-list">
            {features.map((feature) => (
              <span key={feature}>
                <Check size={13} className="text-emerald-600" /> {t(feature)}
              </span>
            ))}
          </div>

          <div className="studio-actions-row">
            <a
              href="https://maps.google.com/?q=14+TC+Godown+Street+Vadiyan+St+Virudhunagar+Tamil+Nadu+626001"
              target="_blank"
              rel="noreferrer"
              className="button button-dark"
            >
              {t('Get Directions →')}
            </a>
            <a href="tel:+919876543210" className="button button-ghost">
              {t('Call AJR ☎')}
            </a>
          </div>
        </div>

        {/* Right Side: Interactive location map */}
        <div className="studio-visual-card">
          <iframe
            className="studio-map-frame"
            title={t('AJR Virudhunagar location map')}
            src="https://www.google.com/maps?q=14%20TC%20Godown%20Street%2C%20Vadiyan%20St%2C%20Virudhunagar%2C%20Tamil%20Nadu%20626001&z=16&output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="visual-overlay">
            <Navigation size={18} className="text-lime" />
            <div>
              <strong>{t('Find AJR in Virudhunagar')}</strong>
              <p>{t('Open the map for directions to AJR — Virudhunagar.')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
