export type AnalyticsPage =
  | 'home'
  | 'about'
  | 'shop'
  | 'contact'
  | 'cart'
  | 'wishlist'
  | 'product-detail'
  | 'orders'
  | 'login'
  | 'signup'

export type AnalyticsEventName =
  | 'page_view'
  | 'page_duration'
  | 'cart_add'
  | 'checkout_start'
  | 'purchase'
  | 'heartbeat'

type AnalyticsConsent = 'accepted' | 'declined' | null
let inMemoryConsent: AnalyticsConsent = null

const CONSENT_KEY = 'ajr-analytics-consent'
const VISITOR_KEY = 'ajr-analytics-visitor'
const SESSION_KEY = 'ajr-analytics-session'
const SESSION_INACTIVITY_MS = 30 * 60 * 1000
const VISITOR_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
let memoryVisitorId = ''
let memorySessionId = ''
let memorySessionLastSeenAt = 0

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return null
  try {
    const consent = window.localStorage.getItem(CONSENT_KEY)
    if (consent === 'accepted' || consent === 'declined') return consent
    return null
  } catch {
    return inMemoryConsent
  }
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>) {
  if (typeof window === 'undefined') return
  inMemoryConsent = consent
  try {
    window.localStorage.setItem(CONSENT_KEY, consent)
    if (consent === 'declined') {
      window.localStorage.removeItem(VISITOR_KEY)
      window.localStorage.removeItem(SESSION_KEY)
    }
  } catch {}
  if (consent === 'declined') {
    memoryVisitorId = ''
    memorySessionId = ''
    memorySessionLastSeenAt = 0
  }
  window.dispatchEvent(new CustomEvent('ajr-analytics-consent', { detail: consent }))
}

function uuid() {
  if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function identity() {
  const now = Date.now()
  let visitorId = ''
  let sessionId = ''

  try {
    const storedVisitor = JSON.parse(window.localStorage.getItem(VISITOR_KEY) || 'null')
    if (
      typeof storedVisitor?.id === 'string' &&
      Number.isFinite(storedVisitor.createdAt) &&
      now - storedVisitor.createdAt < VISITOR_RETENTION_MS
    ) {
      visitorId = storedVisitor.id
    }
    if (!visitorId) {
      visitorId = uuid()
      window.localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: visitorId, createdAt: now }))
    }

    const storedSession = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null')
    if (
      typeof storedSession?.id === 'string' &&
      Number.isFinite(storedSession.lastSeenAt) &&
      now - storedSession.lastSeenAt < SESSION_INACTIVITY_MS
    ) {
      sessionId = storedSession.id
    }
    if (!sessionId) sessionId = uuid()
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionId, lastSeenAt: now }))
  } catch {
    visitorId = memoryVisitorId || uuid()
    sessionId = memorySessionId && now - memorySessionLastSeenAt < SESSION_INACTIVITY_MS
      ? memorySessionId
      : uuid()
  }

  memoryVisitorId = visitorId
  memorySessionId = sessionId
  memorySessionLastSeenAt = now
  return { visitorId, sessionId }
}

function deviceProfile() {
  const ua = navigator.userAgent || ''
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Firefox\//i.test(ua)
      ? 'Firefox'
      : /(?:Chrome|CriOS)\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Other'
  const operatingSystem = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) || iPadOS
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other'
  const deviceType = /iPad|Tablet/i.test(ua) || iPadOS || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    ? 'tablet'
    : /Mobile|Android|iPhone|iPod/i.test(ua)
      ? 'mobile'
      : 'desktop'

  return { deviceType, browser, operatingSystem }
}

export function trackAnalytics(
  eventName: AnalyticsEventName,
  page: AnalyticsPage,
  durationMs?: number,
  productId?: number,
) {
  if (typeof window === 'undefined' || getAnalyticsConsent() !== 'accepted') return

  try {
    const { visitorId, sessionId } = identity()
    const profile = deviceProfile()
    const payload = {
      visitorId,
      sessionId,
      eventName,
      page,
      ...(page === 'product-detail' && typeof productId === 'number' && Number.isSafeInteger(productId) && productId > 0
        ? { productId }
        : {}),
      durationMs: eventName === 'page_duration' ? Math.min(900_000, Math.max(0, Math.round(durationMs || 0))) : null,
      ...profile,
    }
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: eventName === 'page_duration',
      credentials: 'same-origin',
    }).catch(() => {})
  } catch {
    // Analytics is optional and must never interrupt shopping.
  }
}
