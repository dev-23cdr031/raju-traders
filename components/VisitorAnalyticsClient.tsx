'use client'

import { Analytics } from '@vercel/analytics/next'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  startScrollTracking,
  trackAnalytics,
  type AnalyticsPage,
} from '@/lib/visitor-analytics-client'

const ROUTE_PAGES: Record<string, AnalyticsPage> = {
  '/login': 'login',
  '/signup': 'signup',
}

type ActivePage = { key: string; page: AnalyticsPage; startedAt: number; durationSent: boolean }

export default function VisitorAnalyticsClient() {
  const pathname = usePathname()
  const page = ROUTE_PAGES[pathname]
  const [consent, setConsent] = useState<ReturnType<typeof getAnalyticsConsent>>(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const activePage = useRef<ActivePage | null>(null)

  useEffect(() => {
    setConsent(getAnalyticsConsent())
    setReady(true)
    const handleConsent = (event: Event) => {
      const next = (event as CustomEvent<'accepted' | 'declined'>).detail
      setConsent(next)
      setEditing(false)
    }
    const handleStorage = () => setConsent(getAnalyticsConsent())
    window.addEventListener('ajr-analytics-consent', handleConsent)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('ajr-analytics-consent', handleConsent)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const flushDuration = () => {
    const current = activePage.current
    if (!current || current.durationSent) return
    current.durationSent = true
    const duration = Date.now() - current.startedAt
    if (duration > 1000) trackAnalytics('page_duration', current.page, duration)
  }

  useEffect(() => {
    const flush = () => flushDuration()
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    if (consent !== 'accepted' || !page) {
      flushDuration()
      activePage.current = null
      return
    }

    const key = pathname
    if (activePage.current?.key === key) return
    flushDuration()
    activePage.current = { key, page, startedAt: Date.now(), durationSent: false }
    trackAnalytics('page_view', page)
  }, [consent, page, pathname])

  useEffect(() => {
    if (consent !== 'accepted' || !page) return
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') trackAnalytics('heartbeat', page)
    }, 60_000)
    return () => window.clearInterval(heartbeat)
  }, [consent, page])

  useEffect(() => {
    if (consent !== 'accepted' || !page) return
    return startScrollTracking(page)
  }, [consent, page])

  if (!ready || pathname.startsWith('/admin') || pathname.startsWith('/api') || pathname === '/auth/callback' || pathname === '/reset-password') return null

  const showConsent = consent === null || editing
  return (
    <>
      {!showConsent && (
        <button className="ajr-privacy-choices" type="button" onClick={() => setEditing(true)}>
          Privacy choices
        </button>
      )}
      {showConsent && (
        <aside className="ajr-analytics-consent" aria-label="Anonymous analytics choices">
          <div className="ajr-analytics-consent-copy">
            <strong>Help us improve AJR</strong>
            <p>
              Optional analytics stays off until you allow it. If enabled, a random first-party
              visitor ID lasts up to 180 days and a session ID expires after 30 minutes idle.
              We send page/activity times, estimated scrolling time, coarse device, browser, and OS categories, plus anonymous
              product-detail view counts and numeric product IDs to AJR. Product names shown in the
              admin report come only from the server catalog; names are not sent from your browser.
              We never store IP addresses, names,
              contact details, form entries, payment data, referrers, or query strings.
              Vercel Analytics is also disabled until you opt in.
            </p>
          </div>
          <div className="ajr-analytics-consent-actions">
            <button type="button" className="ajr-analytics-essential" onClick={() => setAnalyticsConsent('declined')}>
              Essential only
            </button>
            <button type="button" className="ajr-analytics-allow" onClick={() => setAnalyticsConsent('accepted')}>
              Allow anonymous analytics
            </button>
          </div>
        </aside>
      )}
      {process.env.NODE_ENV === 'production' && consent === 'accepted' && <Analytics />}
    </>
  )
}
