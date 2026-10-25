import { createClient as createServerClient, createClient } from '@supabase/supabase-js'

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Sanitize the Supabase base URL so a misconfigured env var (e.g. one that
// accidentally includes /rest/v1, /auth/v1, or a trailing slash) does not
// cause the SDK to build duplicated paths like
// https://project.supabase.co/rest/v1/auth/v1/token — which Supabase rejects
// with "Invalid path specified in request URL".
const cleanSupabaseUrl = rawSupabaseUrl
  ? rawSupabaseUrl
      .replace(/\/+$/, '')                     // strip trailing slashes
      .replace(/\/rest\/v1.*$/, '')            // strip /rest/v1 and anything after
      .replace(/\/auth\/v1.*$/, '')            // strip /auth/v1 and anything after
  : ''

if (!cleanSupabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Browser / client-side Supabase (anon key, safe to expose)
export const supabase = createClient(cleanSupabaseUrl, supabaseAnonKey)

// ---- Admin access control ----
// These emails may use the admin dashboard / admin API routes.
// Keep the test/demo admin available locally so QA can exercise the dashboard.
export const TEST_ADMIN_EMAIL = 'test@example.com'
export const ADMIN_EMAILS = [
  'priyankab.25cse@kongu.edu',
  'devdharrshan421@gmail.com',
  'devdharrshans.23csd@kongu.edu',
  TEST_ADMIN_EMAIL,
]
export const ADMIN_EMAIL = ADMIN_EMAILS[0]

export function isAdminEmail(email: unknown) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

// Server-side Supabase (service role — use only inside app/api/* route handlers).
// NOTE: this file is imported by API routes (server). The `supabase` export
// above is safe for the browser; `supabaseAdmin()` must never be called client-side.

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!cleanSupabaseUrl || !serviceKey) {
    throw new Error('Supabase server env vars missing (URL or SERVICE_ROLE_KEY).')
  }
  return createServerClient(cleanSupabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })
}

// Verify a Supabase access token and return the user (or null).
export async function getUserFromToken(accessToken: string) {
  if (!accessToken) return null
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.auth.getUser(accessToken)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}

// Guard for admin-only API routes. Returns the user if admin, else a 403 response.
export async function requireAdmin(request: Request): Promise<{ user: any } | { response: Response }> {
  const { NextResponse } = await import('next/server')
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const user = await getUserFromToken(token)
  if (!user || !isAdminEmail(user.email)) {
    return { response: NextResponse.json({ message: 'Admin access only.' }, { status: 403 }) }
  }
  return { user }
}

export type OrderItemInput = {
  id: number | string
  name: string
  type?: string
  price: number
  quantity: number
  image?: string
}

export type OrderRow = {
  id: string
  order_number: string
  customer_name: string
  email: string
  phone: string
  address: string
  items: OrderItemInput[]
  subtotal: number
  shipping: number
  total: number
  status: string
  channel: string
  created_at: string
}

export type VarietyRow = { name: string; price: number } // price is per 1 kg (₹)

// ---- Pack sizes -----------------------------------------------------------
// The gram options a product may be sold in. This is the single source of truth
// for both the shop's pack-size dropdown and the admin form's picker.
export const PACK_SIZE_OPTIONS = ['25 g', '50 g', '100 g', '250 g', '500 g', '1 kg'] as const

export type PackSize = (typeof PACK_SIZE_OPTIONS)[number]

// Normalise an incoming pack-size list: drop anything the shop cannot price and
// keep the catalogue's canonical order (smallest pack first).
export function normalizePackSizes(input: unknown): PackSize[] {
  const list = Array.isArray(input) ? input : []
  const wanted = new Set(
    list
      .map((v: any) => String(v ?? '').trim())
      .filter((v: string) => v.length > 0)
  )
  return PACK_SIZE_OPTIONS.filter((size) => wanted.has(size))
}

// ---- Customer feature helpers ----

// Every order status the admin may set and the customer sees in My Orders.
export const ORDER_STATUSES = [
  'Pending',
  'Order Placed',
  'Confirmed',
  'Processing',
  'Packed',
  'Shipped',
  'Out for delivery',
  'Delivered',
  'Cancelled',
  'Paid',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_METHODS = ['COD', 'UPI', 'Card', 'Netbanking'] as const
export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// One line of a cart: the product snapshot the shop renders plus its quantity.
export type CartLine = { product: any; quantity: number }

// Guard for customer-only API routes (cart, wishlist, my orders).
// Returns the authenticated Supabase user, or a 401 response.
export async function requireUser(request: Request): Promise<{ user: any } | { response: Response }> {
  const { NextResponse } = await import('next/server')
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const user = await getUserFromToken(token)
  if (!user) {
    return { response: NextResponse.json({ message: 'Please log in to continue.' }, { status: 401 }) }
  }
  return { user }
}

// Read a Bearer token when present, but do not require one (used by checkout,
// where an anonymous visitor may still be browsing).
export async function optionalUser(request: Request) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  return token ? await getUserFromToken(token) : null
}

export type ProductRow = {
  id: number
  name: string
  type: string
  category: string
  price: number
  stock: number
  status: string
  image: string
  detail: string
  rating: number
  reviews_count: number
  origin: string
  nutrients: string[]
  varieties?: VarietyRow[]
  // Gram options offered for this product. Empty = fall back to the shop's
  // defaults for the product's category.
  pack_sizes?: string[]
  active: boolean
  updated_at: string
}

// Normalise an incoming variety list. Prices are per 1 kg.
// When no valid varieties are supplied, fall back to one "Standard" variety at the given per-kg price.
export function normalizeVarieties(input: unknown, fallbackPerKg?: unknown): VarietyRow[] {
  const list = Array.isArray(input) ? input : []
  const cleaned = list
    .map((v: any) => ({ name: String(v?.name ?? '').trim(), price: Number(v?.price ?? v?.perKg ?? 0) }))
    .filter((v) => v.name.length > 0 && Number.isFinite(v.price) && v.price > 0)
  if (cleaned.length > 0) return cleaned
  const perKg = Number(fallbackPerKg)
  if (Number.isFinite(perKg) && perKg > 0) return [{ name: 'Standard', price: perKg }]
  return []
}

