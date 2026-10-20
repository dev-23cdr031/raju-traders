'use client'

import { useState, useEffect } from 'react'
import { MapPin, Clock, Navigation, Phone, Check, Coffee } from 'lucide-react'

export default function StudioLocation() {
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    const checkOpen = () => {
      const now = new Date()
      const day = now.getDay()
      const hour = now.getHours()
      // Mon (1) to Sat (6), 10 AM (10) to 7 PM (19)
      if (day >= 1 && day <= 6 && hour >= 10 && hour < 19) {
        setIsOpen(true)
      } else {
        setIsOpen(false)
      }
    }
    checkOpen()
  }, [])

  return (
    <div className="studio-location-container">
      <div className="section-head">
        <div>
          <p className="eyebrow">
            <MapPin size={14} /> Visit Our Studio &amp; Tasting Room
          </p>
          <h2>
            Experience the Harvest <em>In Person</em>
          </h2>
        </div>
        <p className="section-intro">
          Step into our Virudhunagar studio to taste fresh dry fruit batches, inspect royal wooden gift hampers, and consult with our master tasters.
        </p>
      </div>

      <div className="studio-card-grid">
        {/* Left Side: Address & Live Status */}
        <div className="studio-info-card">
          <div className="studio-status-row">
            <span className={`status-badge ${isOpen ? 'open' : 'closed'}`}>
              <span className="dot" />
              {isOpen ? 'Studio Open Now (Until 7:00 PM IST)' : 'Studio Currently Closed (Opens 10:00 AM IST)'}
            </span>
            <span className="city-tag">Virudhunagar Flagship</span>
          </div>

          <h3>AJR Essence of Nature Studio</h3>
          <p className="studio-address">
            <MapPin size={16} /> 14, TC Godown Street, Vadiyan St, Virudhunagar, Tamil Nadu 626001
          </p>

          <div className="hours-grid">
            <div className="hour-item">
              <Clock size={16} />
              <div>
                <strong>Studio &amp; Tasting Counter</strong>
                <span>Mon – Sat: 10:00 AM – 7:00 PM IST</span>
              </div>
            </div>
            <div className="hour-item">
              <Coffee size={16} />
              <div>
                <strong>Complimentary Saffron Almond Milk</strong>
                <span>Served daily 11:30 AM – 5:00 PM</span>
              </div>
            </div>
          </div>

          <div className="studio-features-list">
            <span>
              <Check size={13} className="text-emerald-600" /> Free Private Parking
            </span>
            <span>
              <Check size={13} className="text-emerald-600" /> Sample Tasting Counter
            </span>
            <span>
              <Check size={13} className="text-emerald-600" /> Same-Day Custom Engraving
            </span>
          </div>

          <div className="studio-actions-row">
            <a
              href="https://maps.google.com/?q=14+TC+Godown+Street+Vadiyan+St+Virudhunagar+Tamil+Nadu+626001"
              target="_blank"
              rel="noreferrer"
              className="button button-dark"
            >
              Get Directions on Google Maps <Navigation size={16} />
            </a>
            <a href="tel:+919876543210" className="button button-ghost">
              Call Studio <Phone size={15} />
            </a>
          </div>
        </div>

        {/* Right Side: Interactive location map */}
        <div className="studio-visual-card">
          <iframe
            className="studio-map-frame"
            title="AJR Essence of Nature studio location in Virudhunagar"
            src="https://www.google.com/maps?q=14%20TC%20Godown%20Street%2C%20Vadiyan%20St%2C%20Virudhunagar%2C%20Tamil%20Nadu%20626001&z=16&output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="visual-overlay">
            <Navigation size={18} className="text-lime" />
            <div>
              <strong>Find us in Virudhunagar</strong>
              <p>Open the map for directions to our studio and tasting counter.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
