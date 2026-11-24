'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, type CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import { resolveVarietyImage } from '@/lib/variety-images'
import { persistAuthSession } from '@/lib/auth-session-client'
import VisitorAnalytics from './VisitorAnalytics'
import LoginUsers from './LoginUsers'
import AbandonedCarts from './AbandonedCarts'
import NotificationAutomation from './NotificationAutomation'
import AiAssistantAdmin from './AiAssistantAdmin'
import './style.css'
import {
  ADMIN_EMAILS,
  isAdminEmail,
  ORDER_STATUSES,
  PACK_SIZE_OPTIONS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  supabase,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@/lib/supabase'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  Calendar,
  Check,
  CheckCircle,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  DollarSign,
  Eye,
  EyeOff,
  Globe2,
  Image,
  Inbox,
  Leaf,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  Trash2,
  Truck,
  Upload,
  User,
  X,
} from 'lucide-react'

// These are sizeable, independent admin workspaces. Loading them on demand
// keeps navigation chunks coherent across deploys and avoids serving a stale
// factory after a client-side Fast Refresh or production rollout.
const CouponsOffers = dynamic(() => import('./CouponsOffers'), { ssr: false })
const WebsiteContentManager = dynamic(() => import('./WebsiteContentManager'), { ssr: false })

type InventoryStatus = 'In stock' | 'Low stock' | 'Out of stock'

type Variety = {
  id?: string
  name: string
  price: number
  image?: string
  stock?: number
  active?: boolean
}

type Product = {
  id: number
  name: string
  category: string
  price: number
  stock: number
  status: InventoryStatus
  image: string
  detail?: string
  rating?: number
  reviewsCount?: number
  origin?: string
  nutrients?: string[]
  benefits?: string[]
  ingredients?: string[]
  seoTitle?: string
  seoDescription?: string
  varieties?: Variety[]
  // Gram options offered for this product. Empty = shop defaults for the category.
  packSizes?: string[]
  active?: boolean
}

type StockFeedback = {
  tone: 'pending' | 'success' | 'error'
  message: string
}

const isAvailableForSale = (product: Product) => product.status !== 'Out of stock' && product.stock > 0

function AvailabilitySwitch({
  product,
  pending,
  feedback,
  onToggle,
}: {
  product: Product
  pending: boolean
  feedback?: StockFeedback
  onToggle: (product: Product) => void
}) {
  const available = isAvailableForSale(product)
  const stateLabel = available ? 'In stock' : 'Out of stock'
  const quantityLabel = product.status === 'Low stock'
    ? `Low stock: ${product.stock} ${product.stock === 1 ? 'unit' : 'units'} remaining`
    : `${product.stock} ${product.stock === 1 ? 'unit' : 'units'} tracked`

  return (
    <div className="availability-control">
      <div className="availability-switch-row">
        <button
          type="button"
          className={`availability-switch ${available ? 'is-on' : 'is-off'}`}
          role="switch"
          aria-checked={available}
          aria-label={`${product.name}: ${stateLabel}. Activate to mark ${available ? 'out of stock' : 'in stock'}.`}
          disabled={pending}
          onClick={() => onToggle(product)}
        >
          <span className="availability-switch-thumb" aria-hidden="true" />
        </button>
        <span className={`availability-state ${available ? 'is-on' : 'is-off'}`}>{pending ? 'Saving…' : stateLabel}</span>
      </div>
      <span className="availability-quantity">{quantityLabel}</span>
      {feedback && <span className={`availability-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.message}</span>}
    </div>
  )
}

type VarietyDraft = {
  id: string
  name: string
  price: string
  image: string
  stock: string
  active: boolean
}

type ProductDraft = {
  name: string
  type: string
  image: string
  detail: string
  perKg: string
  varieties: VarietyDraft[]
  packSizes: string[]
  stock: string
  status: string
  origin: string
  nutrients: string
  benefits: string
  ingredients: string
  seoTitle: string
  seoDescription: string
  rating: string
  reviewsCount: string
  active: boolean
}

const createVarietyId = () => `variety-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const newVarietyDraft = (price = ''): VarietyDraft => ({
  id: createVarietyId(),
  name: '',
  price,
  image: '',
  stock: '',
  active: true,
})

const emptyProductDraft = (): ProductDraft => ({
  name: '',
  type: 'Snacking',
  image: '',
  detail: '',
  perKg: '299',
  varieties: [],
  packSizes: ['100 g', '250 g', '500 g'],
  stock: '10',
  status: 'In stock',
  origin: 'India',
  nutrients: '',
  benefits: '',
  ingredients: '',
  seoTitle: '',
  seoDescription: '',
  rating: '4.9',
  reviewsCount: '0',
  active: true,
})

const draftFromProduct = (p: Product): ProductDraft => ({
  name: p.name,
  type: p.category,
  image: p.image || '',
  detail: p.detail || '',
  perKg: String(p.varieties?.[0]?.price ?? p.price * 4),
  varieties: (p.varieties || []).map((v) => ({ id: v.id || createVarietyId(), name: v.name, price: String(v.price), image: v.image || '', stock: v.stock === undefined ? '' : String(v.stock), active: v.active !== false })),
  packSizes: [...(p.packSizes || [])],
  stock: String(p.stock),
  status: p.status,
  origin: p.origin || 'India',
  nutrients: (p.nutrients || []).join(', '),
  benefits: (p.benefits || []).join(', '),
  ingredients: (p.ingredients || []).join(', '),
  seoTitle: p.seoTitle || '',
  seoDescription: p.seoDescription || '',
  rating: String(p.rating ?? 4.9),
  reviewsCount: String(p.reviewsCount ?? 0),
  active: p.active !== false,
})

type Order = {
  dbId?: string
  id: string
  customer: string
  email: string
  phone?: string
  address?: string
  channel: 'Online' | 'Offline'
  total: number
  subtotal?: number
  shipping?: number
  couponCode?: string
  couponName?: string
  couponDiscount?: number
  couponShippingDiscount?: number
  couponOriginalSubtotal?: number
  items?: { id: number | string; name: string; price: number; quantity: number }[]
  status: OrderStatus
  paymentMethod?: PaymentMethod
  paymentStatus?: PaymentStatus
  date: string
}

// ---- Order mapping --------------------------------------------------------
// One place that turns a raw Supabase order row into the shape this console
// renders, so Refresh / offline-sale / payment-status updates never drift apart.
const asOrderStatus = (value: unknown): OrderStatus =>
  ORDER_STATUSES.includes(String(value || '') as OrderStatus) ? (String(value) as OrderStatus) : 'Pending'

const asPaymentStatus = (value: unknown): PaymentStatus =>
  PAYMENT_STATUSES.includes(String(value || '') as PaymentStatus) ? (String(value) as PaymentStatus) : 'Pending'

const asPaymentMethod = (value: unknown): PaymentMethod =>
  PAYMENT_METHODS.includes(String(value || '') as PaymentMethod) ? (String(value) as PaymentMethod) : 'COD'

const mapDbOrder = (r: any): Order => ({
  dbId: r.id,
  id: r.order_number,
  customer: r.customer_name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  channel: r.channel === 'Offline' ? 'Offline' : 'Online',
  total: Number(r.total),
  subtotal: Number(r.subtotal ?? 0),
  shipping: Number(r.shipping ?? 0),
  couponCode: String(r.coupon_code || ''),
  couponName: String(r.coupon_name || ''),
  couponDiscount: Number(r.coupon_discount_amount || 0),
  couponShippingDiscount: Number(r.coupon_shipping_discount || 0),
  couponOriginalSubtotal: r.coupon_original_subtotal == null ? undefined : Number(r.coupon_original_subtotal),
  items: Array.isArray(r.items) ? r.items : [],
  status: asOrderStatus(r.status),
  paymentMethod: asPaymentMethod(r.payment_method),
  paymentStatus: asPaymentStatus(r.payment_status),
  date: String(r.created_at || '').slice(0, 10),
})

type Message = {
  id?: string
  customer: string
  email: string
  phone?: string
  subject: string
  detail: string
  read: boolean
  time: string
  created_at?: string
}

type StoreSettings = {
  shopName: string
  tagline: string
  logoUrl: string
}

const defaultStoreSettings: StoreSettings = {
  shopName: 'AJR',
  tagline: 'ALWAYS JUST ROYAL',
  logoUrl: '/ajr-logo.png',
}

type SpreadsheetValue = string | number | boolean | null | undefined
type SpreadsheetRow = Record<string, SpreadsheetValue>

const xmlEscape = (value: SpreadsheetValue) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const spreadsheetValue = (value: SpreadsheetValue) => {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  // Excel evaluates cells beginning with these characters as formulas. Prefix
  // a quote to retain the data as text when an export is opened.
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text
}

function downloadExcelWorkbook(sheetName: string, columns: { key: string; label: string }[], rows: SpreadsheetRow[]) {
  const cells = (row: SpreadsheetRow, isHeader = false) => columns
    .map((column) => `<Cell ss:StyleID="${isHeader ? 'header' : 'cell'}"><Data ss:Type="String">${xmlEscape(isHeader ? column.label : spreadsheetValue(row[column.key]))}</Data></Cell>`)
    .join('')
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#173C31" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
    <Style ss:ID="cell"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
  </Styles>
  <Worksheet ss:Name="${xmlEscape(sheetName).slice(0, 31)}"><Table>
    <Row>${cells({}, true)}</Row>
    ${rows.map((row) => `<Row>${cells(row)}</Row>`).join('')}
  </Table></Worksheet>
</Workbook>`
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = URL.createObjectURL(blob)
  link.download = `ajr-${sheetName.toLowerCase().replace(/\s+/g, '-')}-${stamp}.xls`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

const SUBJECT_LABELS: Record<string, string> = {
  retail: 'Product & Retail Support',
  gifting: 'Custom Festive Hampers',
  corporate: 'Corporate Bulk Inquiry',
  press: 'Press & Collaborations',
  'general inquiry': 'General inquiry',
}

const subjectLabel = (subject: string) => {
  const s = String(subject || '').trim().toLowerCase()
  if (SUBJECT_LABELS[s]) return SUBJECT_LABELS[s]
  return String(subject || 'General inquiry').trim() || 'General inquiry'
}

const categoryKey = (subject: string) => {
  const s = String(subject || '').trim().toLowerCase()
  if (s === 'retail') return 'retail'
  if (s === 'gifting') return 'gifting'
  if (s === 'corporate') return 'corporate'
  if (s === 'press') return 'press'
  return 'general'
}

const initials = (name: string) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

const relativeTime = (iso?: string) => {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return String(iso).slice(0, 16).replace('T', ' ')
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type AdminSection = 'overview' | 'orders' | 'products' | 'inventory' | 'messages' | 'login-users' | 'analytics' | 'abandoned-carts' | 'notification-automation' | 'coupons-offers' | 'website-content' | 'ai-assistant' | 'settings'

export default function AdminDashboardPage({ section = 'overview' }: { section?: AdminSection }) {
  const { t } = useLanguage()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [contentOnly, setContentOnly] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const navigationTriggerRef = useRef<HTMLButtonElement>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productVisibilityFilter, setProductVisibilityFilter] = useState<'All' | 'Visible' | 'Hidden'>('All')
  const [productQuery, setProductQuery] = useState('')
  const [expandedVariantProductIds, setExpandedVariantProductIds] = useState<Set<number>>(() => new Set())
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productsError, setProductsError] = useState('')
  const [pendingStockIds, setPendingStockIds] = useState<Set<number>>(() => new Set())
  const [stockFeedback, setStockFeedback] = useState<Record<number, StockFeedback>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [orderQuery, setOrderQuery] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('All')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [messageQuery, setMessageQuery] = useState('')
  const [messageFilter, setMessageFilter] = useState('All')
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings)
  const [brandingDraft, setBrandingDraft] = useState<StoreSettings>(defaultStoreSettings)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsNotice, setSettingsNotice] = useState('')
  const [emailOrderId, setEmailOrderId] = useState('')
  const [emailSendBusy, setEmailSendBusy] = useState(false)
  const [emailSendError, setEmailSendError] = useState('')
  const [emailSendNotice, setEmailSendNotice] = useState('')
  const [smsOrderId, setSmsOrderId] = useState('')
  const [smsSendBusy, setSmsSendBusy] = useState(false)
  const [smsSendError, setSmsSendError] = useState('')
  const [smsSendNotice, setSmsSendNotice] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showOfflineOrder, setShowOfflineOrder] = useState(false)
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [offlineError, setOfflineError] = useState('')
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft)
  const [savingProduct, setSavingProduct] = useState(false)
  const [newOrder, setNewOrder] = useState({
    customer: '',
    phone: '',
    email: '',
    address: '',
    productId: '',
    quantity: '1',
    payment: 'Paid' as 'Paid' | 'Pending',
    note: '',
  })

  useEffect(() => {
    if (!mobileNavOpen) return
    const mobileViewport = window.matchMedia('(max-width: 980px)')
    if (!mobileViewport.matches) { setMobileNavOpen(false); return }
    const sidebar = sidebarRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebar?.querySelector<HTMLButtonElement>('.admin-mobile-close')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNavOpen(false); return }
      if (event.key !== 'Tab' || !sidebar) return
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    const handleViewport = () => { if (!mobileViewport.matches) setMobileNavOpen(false) }
    document.addEventListener('keydown', handleKey)
    mobileViewport.addEventListener('change', handleViewport)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      mobileViewport.removeEventListener('change', handleViewport)
      if (mobileViewport.matches) navigationTriggerRef.current?.focus()
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!selectedOrder && !showProductForm && !showOfflineOrder) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>('[data-admin-dialog]')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedOrder(null)
        setShowProductForm(false)
        setShowOfflineOrder(false)
      }
      if (event.key === 'Tab' && dialog) {
        const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0)
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      previousFocus?.focus()
    }
  }, [Boolean(selectedOrder), showProductForm, showOfflineOrder])

  const totalRevenue = useMemo(() => {
    if (dashboard?.revenue !== undefined) return Number(dashboard.revenue)
    return orders.filter((order) => order.status !== 'Cancelled').reduce((sum, order) => sum + order.total, 0)
  }, [orders, dashboard])

  const lowStock = useMemo(() => products.filter((product) => product.status !== 'In stock').length, [products])
  const visibleProductCount = useMemo(() => products.filter((product) => product.active !== false).length, [products])
  const hiddenProductCount = useMemo(() => products.filter((product) => product.active === false).length, [products])
  const availableProductCount = useMemo(() => products.filter(isAvailableForSale).length, [products])
  const filteredProducts = useMemo(
    () => products.filter((product) => {
      const query = productQuery.trim().toLowerCase()
      const matchesVisibility = productVisibilityFilter === 'All' || (product.active !== false) === (productVisibilityFilter === 'Visible')
      const matchesQuery = !query || [product.name, product.category, product.origin, product.detail, ...(product.nutrients || []), ...(product.varieties || []).map((variety) => variety.name)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
      return matchesVisibility && matchesQuery
    }),
    [products, productVisibilityFilter, productQuery]
  )

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = orderQuery.trim().toLowerCase()
      const matchQ =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q)
      const matchS = orderStatusFilter === 'All' || o.status === orderStatusFilter
      const matchP = paymentStatusFilter === 'All' || (o.paymentStatus || 'Pending') === paymentStatusFilter
      return matchQ && matchS && matchP
    })
  }, [orders, orderQuery, orderStatusFilter, paymentStatusFilter])

  const emailableOrders = useMemo(
    () => orders.filter((order) => Boolean(order.dbId && order.email) && order.status !== 'Cancelled'),
    [orders],
  )
  const smsableOrders = useMemo(
    () => orders.filter((order) => Boolean(order.dbId && order.phone) && order.status !== 'Cancelled'),
    [orders],
  )

  const unreadCount = useMemo(() => messages.filter((m) => !m.read).length, [messages])

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      const q = messageQuery.trim().toLowerCase()
      const matchQ =
        !q ||
        m.customer.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.detail.toLowerCase().includes(q) ||
        subjectLabel(m.subject).toLowerCase().includes(q)
      const matchF = messageFilter === 'All' || subjectLabel(m.subject) === messageFilter
      return matchQ && matchF
    })
  }, [messages, messageQuery, messageFilter])

  const offlineSelectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(newOrder.productId)),
    [products, newOrder.productId]
  )
  const offlineQty = Math.max(1, Number(newOrder.quantity) || 1)
  const offlineTotal = (offlineSelectedProduct?.price ?? 0) * offlineQty
  const authHeaders = () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('ajr-access-token') || '' : ''
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }
  }

  useEffect(() => {
    setCheckingAuth(true)
    setAuthorized(false)
    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        let token = data.session?.access_token || ''
        if (!token && typeof window !== 'undefined') {
          token = localStorage.getItem('ajr-access-token') || ''
        }
        if (token && data.session?.access_token) {
          try {
            localStorage.setItem('ajr-access-token', token)
          } catch {
            console.error('Could not synchronize the current authentication session.')
          }
        }
        const response = token
          ? await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
          : null
        const result = response ? await response.json().catch(() => ({})) : {}
        const email = String(result.user?.email || '').trim().toLowerCase()
        const isAdministrator = Boolean(response?.ok && isAdminEmail(email))
        if (isAdministrator) {
          setLoginEmail(email)
          setContentOnly(false)
          setAuthorized(true)
          loadOrders(token)
          loadProducts()
          loadExtras(token)
          loadStoreSettings(token)
        } else if (response?.ok && section === 'website-content') {
          const cmsResponse = await fetch('/api/admin/content', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })
          if (cmsResponse.ok) {
            setLoginEmail(email)
            setContentOnly(true)
            setAuthorized(true)
          } else {
            setContentOnly(false)
            setAuthorized(false)
          }
        } else {
          setContentOnly(false)
          setAuthorized(false)
        }
      } catch {
        setContentOnly(false)
        setAuthorized(false)
      } finally {
        setCheckingAuth(false)
      }
    }
    check()
  }, [section])

  const loadOrders = async (token?: string) => {
    setLoadingOrders(true)
    setOrdersError('')
    try {
      const t = token ?? (typeof window !== 'undefined' ? localStorage.getItem('ajr-access-token') || '' : '')
      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${t}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not load orders from Supabase.')
      const rows = Array.isArray(data.orders) ? data.orders : []
      setOrders(rows.map(mapDbOrder))
    } catch (e: any) {
      setOrdersError(e?.message || 'Could not load orders.')
    } finally {
      setLoadingOrders(false)
    }
  }

  useEffect(() => {
    if (!authorized || section === 'website-content') return
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOrders()
    }, 15000)
    return () => window.clearInterval(refreshTimer)
  }, [authorized, section])

  const loadMessages = async (token?: string) => {
    setLoadingMessages(true)
    setMessagesError('')
    try {
      const t = token ?? (typeof window !== 'undefined' ? localStorage.getItem('ajr-access-token') || '' : '')
      const res = await fetch('/api/messages', {
        headers: { Authorization: `Bearer ${t}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not load messages from Supabase.')
      const rows = Array.isArray(data.messages) ? data.messages : []
      setMessages(
        rows.map((m: any) => ({
          id: m.id,
          customer: m.customer,
          email: m.email,
          phone: m.phone || '',
          subject: m.subject || 'General inquiry',
          detail: m.detail,
          read: Boolean(m.read),
          time: relativeTime(m.created_at),
          created_at: m.created_at,
        }))
      )
    } catch (e: any) {
      setMessagesError(e?.message || 'Could not load messages.')
    } finally {
      setLoadingMessages(false)
    }
  }

  const loadExtras = async (token?: string) => {
    setDashboardLoading(true)
    setDashboardError('')
    const accessToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('ajr-access-token') || '' : '')
    try {
      const r = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.message || 'Could not load overview data from Supabase.')
      setDashboard(d)
    } catch (e: any) {
      setDashboardError(e?.message || 'Could not load overview data from Supabase.')
    } finally {
      setDashboardLoading(false)
    }
    loadMessages(accessToken)
  }

  useEffect(() => {
    if (!authorized || section === 'website-content') return
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadExtras()
    }, 15000)
    return () => window.clearInterval(refreshTimer)
  }, [authorized, section])

  const loadProducts = async () => {
    setLoadingProducts(true)
    setProductsError('')
    try {
      const res = await fetch('/api/products?includeInactive=true', { headers: authHeaders(), cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Run supabase/schema.sql first.')
      const rows = Array.isArray(data.products) ? data.products : []
      setProducts(
        rows.map((r: any) => ({
            id: Number(r.id),
            name: r.name,
            category: r.type || r.category || 'Snacking',
            price: Number(r.price),
            stock: Number(r.stock ?? 0),
            status: (r.status || 'In stock') as InventoryStatus,
            image: r.image || '/nut-selection.png',
            detail: r.detail || '',
            rating: Number(r.rating ?? 4.9),
            reviewsCount: Number(r.reviews_count ?? r.reviewsCount ?? 0),
            origin: r.origin || 'India',
            nutrients: Array.isArray(r.nutrients) ? r.nutrients : [],
            benefits: Array.isArray(r.benefits) ? r.benefits : [],
            ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
            seoTitle: String(r.seo_title || ''),
            seoDescription: String(r.seo_description || ''),
            varieties: Array.isArray(r.varieties) ? r.varieties : [],
            packSizes: Array.isArray(r.pack_sizes) ? r.pack_sizes : [],
            active: r.active !== false,
        }))
          )
    } catch (e: any) {
      setProductsError(e?.message || 'Could not load products.')
    } finally {
      setLoadingProducts(false)
    }
  }

  const loadStoreSettings = async (token?: string) => {
    setSettingsLoading(true)
    setSettingsError('')
    try {
      const accessToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('ajr-access-token') || '' : '')
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not load store settings.')
      const next: StoreSettings = {
        shopName: String(data.settings?.shopName || defaultStoreSettings.shopName),
        tagline: String(data.settings?.tagline || defaultStoreSettings.tagline),
        logoUrl: String(data.settings?.logoUrl || defaultStoreSettings.logoUrl),
      }
      setStoreSettings(next)
      setBrandingDraft(next)
    } catch (error: any) {
      setSettingsError(error?.message || 'Could not load store settings.')
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveStoreSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsSaving(true)
    setSettingsError('')
    setSettingsNotice('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(brandingDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save store settings.')
      const next: StoreSettings = {
        shopName: String(data.settings?.shopName || brandingDraft.shopName),
        tagline: String(data.settings?.tagline || brandingDraft.tagline),
        logoUrl: String(data.settings?.logoUrl || brandingDraft.logoUrl),
      }
      setStoreSettings(next)
      setBrandingDraft(next)
      setSettingsNotice('Brand details saved.')
    } catch (error: any) {
      setSettingsError(error?.message || 'Could not save store settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  const uploadStoreLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSettingsError('')
    setSettingsNotice('')
    if (!file.type.startsWith('image/')) {
      setSettingsError('Choose an image file for the shop logo.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setSettingsError('Logo image must be smaller than 5 MB.')
      return
    }
    setLogoUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: authHeaders().Authorization },
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data?.message || 'Logo upload failed.')
      setBrandingDraft((current) => ({ ...current, logoUrl: String(data.url) }))
      setSettingsNotice('Logo uploaded. Save your brand details to publish it.')
    } catch (error: any) {
      setSettingsError(error?.message || 'Logo upload failed.')
    } finally {
      setLogoUploading(false)
    }
  }

  const exportProducts = () => downloadExcelWorkbook('Products', [
    { key: 'id', label: 'Product ID' }, { key: 'name', label: 'Product name' }, { key: 'category', label: 'Category' },
    { key: 'pricePerKg', label: 'Price per kg (INR)' }, { key: 'stock', label: 'Stock units' }, { key: 'status', label: 'Inventory status' },
    { key: 'visibility', label: 'Shop visibility' }, { key: 'origin', label: 'Origin' }, { key: 'varieties', label: 'Varieties' },
    { key: 'packSizes', label: 'Pack sizes' }, { key: 'nutrients', label: 'Nutrients' }, { key: 'detail', label: 'Description' },
  ], products.map((product) => ({
    id: product.id, name: product.name, category: product.category, pricePerKg: product.varieties?.[0]?.price ?? product.price * 4,
    stock: product.stock, status: product.status, visibility: product.active === false ? 'Hidden' : 'Visible', origin: product.origin || '',
    varieties: product.varieties?.map((variety) => `${variety.name} (₹${variety.price}/kg)`).join(', ') || 'Standard',
    packSizes: product.packSizes?.join(', ') || '', nutrients: product.nutrients?.join(', ') || '', detail: product.detail || '',
  })))

  const exportOrders = () => downloadExcelWorkbook('Orders', [
    { key: 'orderNumber', label: 'Order number' }, { key: 'date', label: 'Order date' }, { key: 'customer', label: 'Customer' },
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Delivery address' },
    { key: 'items', label: 'Items' }, { key: 'channel', label: 'Channel' }, { key: 'status', label: 'Order status' },
    { key: 'paymentMethod', label: 'Payment method' }, { key: 'paymentStatus', label: 'Payment status' }, { key: 'subtotal', label: 'Subtotal (INR)' },
    { key: 'shipping', label: 'Shipping (INR)' }, { key: 'total', label: 'Total (INR)' },
  ], orders.map((order) => ({
    orderNumber: order.id, date: order.date, customer: order.customer, email: order.email, phone: order.phone || '', address: order.address || '',
    items: order.items?.map((item) => `${item.quantity} × ${item.name} (₹${item.price})`).join('; ') || '', channel: order.channel,
    status: order.status, paymentMethod: order.paymentMethod || 'COD', paymentStatus: order.paymentStatus || 'Pending',
    subtotal: order.subtotal ?? order.total, shipping: order.shipping ?? 0, total: order.total,
  })))

  const exportMessages = () => downloadExcelWorkbook('Messages', [
    { key: 'receivedAt', label: 'Received at' }, { key: 'customer', label: 'Customer' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'subject', label: 'Subject' }, { key: 'message', label: 'Message' }, { key: 'status', label: 'Status' },
  ], messages.map((message) => ({
    receivedAt: message.created_at || message.time, customer: message.customer, email: message.email, phone: message.phone || '',
    subject: subjectLabel(message.subject), message: message.detail, status: message.read ? 'Read' : 'Unread',
  })))

  const sendOrderEmail = async (mode: 'customer' | 'preview') => {
    setEmailSendError('')
    setEmailSendNotice('')
    if (!emailOrderId) {
      setEmailSendError('Select an order before sending an email.')
      return
    }
    setEmailSendBusy(true)
    try {
      const res = await fetch('/api/admin/order-emails', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ orderId: emailOrderId, mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not send the order email.')
      setEmailSendNotice(String(data.message || 'Order email sent.'))
    } catch (error: any) {
      setEmailSendError(error?.message || 'Could not send the order email.')
    } finally {
      setEmailSendBusy(false)
    }
  }

  const sendOrderSms = async () => {
    setSmsSendError('')
    setSmsSendNotice('')
    if (!smsOrderId) {
      setSmsSendError('Select an order before sending an SMS.')
      return
    }
    setSmsSendBusy(true)
    try {
      const res = await fetch('/api/admin/order-sms', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ orderId: smsOrderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not send the order SMS.')
      setSmsSendNotice(String(data.message || 'Order SMS submitted.'))
    } catch (error: any) {
      setSmsSendError(error?.message || 'Could not send the order SMS.')
    } finally {
      setSmsSendBusy(false)
    }
  }

  const adminLogin = async (event: FormEvent) => {
    event.preventDefault()
    setLoginError('')
    if (section !== 'website-content' && !isAdminEmail(loginEmail)) {
      setLoginError(`Only ${ADMIN_EMAILS.join(' or ')} can access.`)
      return
    }
    setLoginBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Login failed.')
      const email = String(data.user?.email || loginEmail).toLowerCase()
      const token = data.session?.access_token || ''
      const isAdministrator = isAdminEmail(email)
      if (!isAdministrator) {
        if (section !== 'website-content') throw new Error('Not an admin account.')
        const cmsResponse = await fetch('/api/admin/content', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const cmsData = await cmsResponse.json().catch(() => ({}))
        if (!cmsResponse.ok) throw new Error(cmsData?.message || 'This account does not have Website Content Manager access.')
      }
      if (!await persistAuthSession(data.session || {})) {
        throw new Error('Sign-in succeeded, but session renewal could not be initialized. Please sign in again.')
      }
      try {
        localStorage.setItem('adminAccessEmail', email)
      } catch {}
      setLoginEmail(email)
      setContentOnly(!isAdministrator)
      setAuthorized(true)
      if (isAdministrator) {
        loadOrders(token)
        loadProducts()
        loadExtras(token)
        loadStoreSettings(token)
      }
    } catch (e: any) {
      setLoginError(e?.message || 'Login failed.')
    } finally {
      setLoginBusy(false)
    }
  }

  const adminLogout = async () => {
    const token = localStorage.getItem('ajr-access-token') || ''
    if (token) {
      void fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {})
    }
    try {
      await supabase.auth.signOut()
      localStorage.removeItem('ajr-access-token')
      localStorage.removeItem('adminAccessEmail')
    } catch {}
    setAuthorized(false)
    router.push('/login')
  }

  // Optimistic-then-persist so the console never shows a stale value while the
  // Supabase PATCH is in flight, and rolls the row back if the write fails.
  const patchOrder = async (order: Order, patch: Partial<Order>, body: Record<string, unknown>) => {
    const previous: Partial<Order> = { status: order.status, paymentStatus: order.paymentStatus }
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, ...patch } : o)))
    setSelectedOrder((current) => (current && current.id === order.id ? { ...current, ...patch } : current))
    if (!order.dbId) return true
    try {
      const res = await fetch(`/api/orders/${order.dbId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Update failed')
      return true
    } catch {
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, ...previous } : o)))
      setSelectedOrder((current) => (current && current.id === order.id ? { ...current, ...previous } : current))
      return false
    }
  }

  // Order status and payment status are independent columns, so the admin can
  // move an order to Shipped while its payment is still Pending (COD), etc.
  const updateOrderStatus = async (order: Order, next: OrderStatus) => {
    const ok = await patchOrder(order, { status: next }, { status: next })
    if (!ok) alert('Could not update status in Supabase.')
  }

  const updatePaymentStatus = async (order: Order, next: PaymentStatus) => {
    const ok = await patchOrder(order, { paymentStatus: next }, { payment_status: next })
    if (!ok) alert('Could not update payment status in Supabase.')
  }

  const deleteOrder = async (order: Order) => {
    if (!order.dbId) {
      setOrders(orders.filter((o) => o.id !== order.id))
      return
    }
    if (!confirm(`Delete order ${order.id}?`)) return
    try {
      const res = await fetch(`/api/orders/${order.dbId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Delete failed')
      setOrders(orders.filter((o) => o.dbId !== order.dbId))
      setSelectedOrder(null)
    } catch {
      alert('Could not delete order.')
    }
  }

  const toggleMessageRead = async (message: Message) => {
    const next = !message.read
    setMessages(messages.map((m) => (m.id === message.id ? { ...m, read: next } : m)))
    if (selectedMessage && selectedMessage.id === message.id) {
      setSelectedMessage({ ...selectedMessage, read: next })
    }
    if (!message.id) return
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ read: next }),
      })
      if (!res.ok) throw new Error('Update failed')
    } catch {
      setMessages(messages.map((m) => (m.id === message.id ? { ...m, read: !next } : m)))
    }
  }

  const deleteMessage = async (message: Message) => {
    if (!message.id) {
      setMessages(messages.filter((m) => m.id !== message.id))
      if (selectedMessage?.id === message.id) setSelectedMessage(null)
      return
    }
    if (!confirm(`Delete message from ${message.customer}?`)) return
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Delete failed')
      setMessages(messages.filter((m) => m.id !== message.id))
      if (selectedMessage?.id === message.id) setSelectedMessage(null)
    } catch {
      alert('Could not delete message.')
    }
  }

  const markAllRead = async () => {
    const unread = messages.filter((m) => !m.read && m.id)
    if (unread.length === 0) return
    setMessages(messages.map((m) => ({ ...m, read: true })))
    await Promise.all(
      unread.map((m) =>
        fetch(`/api/messages/${m.id}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ read: true }),
        }).catch(() => null)
      )
    )
  }

  const toggleStock = async (product: Product) => {
    if (pendingStockIds.has(product.id)) return

    const wasAvailable = isAvailableForSale(product)
    // Removing availability should not erase a count the team has already entered.
    // Restoring availability needs at least one unit so the shop never receives a
    // contradictory "In stock / 0 units" state.
    const nextStock = wasAvailable ? product.stock : Math.max(1, product.stock)
    const nextStatus: InventoryStatus = wasAvailable ? 'Out of stock' : 'In stock'
    const optimisticProduct = { ...product, stock: nextStock, status: nextStatus }

    setPendingStockIds((current) => new Set(current).add(product.id))
    setStockFeedback((current) => ({ ...current, [product.id]: { tone: 'pending', message: 'Saving availability…' } }))
    setProducts((current) => current.map((item) => (item.id === product.id ? optimisticProduct : item)))

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ stock: nextStock, status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save availability.')

      const savedStock = Number(data?.product?.stock)
      const savedStatus = data?.product?.status
      const persistedStatus: InventoryStatus = savedStatus === 'In stock' || savedStatus === 'Low stock' || savedStatus === 'Out of stock'
        ? savedStatus
        : nextStatus
      setProducts((current) => current.map((item) => item.id === product.id
        ? { ...item, stock: Number.isFinite(savedStock) ? savedStock : nextStock, status: persistedStatus }
        : item))
      setStockFeedback((current) => ({
        ...current,
        [product.id]: { tone: 'success', message: `${persistedStatus} saved.` },
      }))
    } catch (error: any) {
      // Only restore the fields this request changed. A visibility edit may have
      // completed while the availability request was in flight.
      setProducts((current) => current.map((item) => (item.id === product.id
        ? { ...item, stock: product.stock, status: product.status }
        : item)))
      setStockFeedback((current) => ({
        ...current,
        [product.id]: { tone: 'error', message: error?.message || 'Could not save. Restored the previous availability.' },
      }))
    } finally {
      setPendingStockIds((current) => {
        const next = new Set(current)
        next.delete(product.id)
        return next
      })
    }
  }

  const openCreateProduct = () => {
    setEditingId(null)
    setProductDraft(emptyProductDraft())
    setShowProductForm(true)
  }

  const openEditProduct = (product: Product) => {
    setEditingId(product.id)
    setProductDraft(draftFromProduct(product))
    setShowProductForm(true)
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: authHeaders().Authorization },
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Upload failed.')
      return String(data.url || '')
    } catch (e: any) {
      alert(e?.message || 'Could not upload image.')
      return null
    }
  }

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault()
    if (savingProduct) return
    setSavingProduct(true)
    try {
      const perKg = Number(productDraft.perKg)
      const varieties = productDraft.varieties
        .map((v) => ({
          id: v.id,
          name: v.name.trim(),
          price: Number(v.price),
          image: v.image.trim() || undefined,
          stock: v.stock.trim() === '' ? undefined : Number(v.stock),
          active: v.active,
        }))
        .filter((v) => v.name.length > 0 && Number.isFinite(v.price) && v.price > 0)
      const stock = Number(productDraft.stock)
      const type = productDraft.type.trim() || 'Snacking'
      const payload: Record<string, any> = {
        name: productDraft.name.trim() || 'New Product',
        type,
        category: type,
        image: productDraft.image.trim(),
        detail: productDraft.detail,
        description: productDraft.detail,
        origin: productDraft.origin.trim() || 'India',
        nutrients: productDraft.nutrients.split(',').map((n) => n.trim()).filter(Boolean),
        benefits: productDraft.benefits.split(',').map((n) => n.trim()).filter(Boolean),
        ingredients: productDraft.ingredients.split(',').map((n) => n.trim()).filter(Boolean),
        seo_title: productDraft.seoTitle.trim(),
        seo_description: productDraft.seoDescription.trim(),
        rating: Number(productDraft.rating),
        reviews_count: Number(productDraft.reviewsCount),
        stock: Number.isFinite(stock) ? stock : 0,
        status: productDraft.status || (stock <= 0 ? 'Out of stock' : stock <= 8 ? 'Low stock' : 'In stock'),
        active: productDraft.active,
        varieties,
        perKg: Number.isFinite(perKg) ? perKg : 0,
        pack_sizes: productDraft.packSizes,
      }

      const res = await fetch(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save product.')
      if (data?.warning) alert(data.warning)
      setShowProductForm(false)
      setEditingId(null)
      setProductDraft(emptyProductDraft())
      loadProducts()
    } catch (e: any) {
      alert(e?.message || 'Could not save product.')
    } finally {
      setSavingProduct(false)
    }
  }

  const deleteProduct = async (product: Product) => {
    if (!confirm(`Delete ${product.name}? It will leave the shop.`)) return
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Delete failed')
      setProducts(products.filter((p) => p.id !== product.id))
    } catch {
      alert('Could not delete product.')
    }
  }

  const toggleProductVisibility = async (product: Product) => {
    const active = product.active === false
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not update shop visibility.')
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active } : item))
    } catch (error: any) {
      alert(error?.message || 'Could not update shop visibility.')
    }
  }

  // Each /admin/[section] navigation mounts a fresh dashboard instance. Keep the
  // access gate hidden until the saved session has been verified, otherwise it
  // briefly flashes between authenticated admin pages.
  if (checkingAuth) {
    return (
      <main className="admin-page admin-studio admin-session-check" aria-busy="true" aria-live="polite">
        <div className="admin-session-check-card">
          <span className="admin-session-check-mark"><Leaf size={19} aria-hidden="true" /></span>
          <span>{t('Opening your workspace…')}</span>
        </div>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main className="admin-access-gate admin-studio">
        <section className="admin-access-story" aria-label={t('AJR store workspace')}>
          <Link href="/" className="admin-access-brand">AJR<span>ALWAYS JUST ROYAL</span></Link>
          <div><span className="admin-story-eyebrow"><Leaf size={16} /> {t('Rooted in good things')}</span><h2>{t('A little care.')}<br />{t('A flourishing')}<br /><em>{t('business.')}</em></h2><p>{t('Your products, your people, your progress.')}<br />{t('A thoughtful space to bring it all together.')}</p></div>
          <span className="admin-story-footer">{t('THE AJR WORKSPACE')} <span>{t('Made for everyday growth.')}</span></span>
        </section>
        <section className="admin-access-card">
          <LanguageSwitcher className="admin-access-language-switcher" />
          <span className="admin-access-icon"><ShieldCheck size={25} /></span>
          <span className="admin-kicker">{t('Your store, thoughtfully managed')}</span>
          <h1>{t('Welcome back.')}</h1>
          <p>{section === 'website-content'
            ? 'Sign in with an administrator or an assigned content account to manage the storefront.'
            : t('Sign in with your administrator account to tend to your store.')}</p>
          <form className="admin-form" onSubmit={adminLogin}>
            <label><span>{t('Email address')}</span><input type="email" autoComplete="username" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required suppressHydrationWarning /></label>
            <label><span>{t('Password')}</span><input type="password" autoComplete="current-password" placeholder={t('Enter your password')} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required suppressHydrationWarning /></label>
            {loginError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{loginError}</p>}
            <button className="button button-dark" type="submit" disabled={loginBusy} suppressHydrationWarning>
              {loginBusy ? 'Signing in…' : 'Enter your workspace'} <ArrowRight size={16} />
            </button>
          </form>
          <Link className="admin-back-link" href="/">{t('Back to the store')} <ArrowUpRight size={14} /></Link>
        </section>
      </main>
    )
  }

  const addOfflineOrder = async (event: FormEvent) => {
    event.preventDefault()
    setOfflineError('')
    if (!newOrder.customer.trim()) {
      setOfflineError('Please enter the customer name.')
      return
    }
    if (!offlineSelectedProduct) {
      setOfflineError('Please select a product sold in-store.')
      return
    }
    if (!Number.isFinite(offlineTotal) || offlineTotal <= 0) {
      setOfflineError('Invalid order total.')
      return
    }
    setOfflineBusy(true)
    try {
      // ✅ Saves DIRECTLY to Supabase via /api/orders (service-role insert).
      // Nothing is kept in localStorage — Refresh re-loads this row from Supabase.
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: newOrder.customer.trim(),
          email: (newOrder.email.trim() || 'walkin@ajr.store').toLowerCase(),
          phone: newOrder.phone.trim() || 'walk-in',
          address: newOrder.address.trim() || 'In-store purchase',
          items: [
            {
              id: offlineSelectedProduct.id,
              name: offlineSelectedProduct.name,
              type: offlineSelectedProduct.category,
              price: offlineSelectedProduct.price,
              quantity: offlineQty,
            },
          ],
          subtotal: offlineTotal,
          shipping: 0,
          total: offlineTotal,
          status: newOrder.payment,
          // Counter sales settle in cash at the store; 'COD' is the closest of the
          // supported methods (PAYMENT_METHODS) and the column default.
          payment_method: 'COD',
          // The Paid / Pending picker in this form IS the payment status.
          payment_status: newOrder.payment === 'Paid' ? 'Paid' : 'Pending',
          channel: 'Offline',
          note: newOrder.note.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to save offline order in Supabase.')
      const nextOrder: Order = { ...mapDbOrder(data.order), channel: 'Offline' }
      setOrders([nextOrder, ...orders])
      setSelectedOrder(nextOrder)
      setShowOfflineOrder(false)
      setNewOrder({ customer: '', phone: '', email: '', address: '', productId: '', quantity: '1', payment: 'Paid', note: '' })
    } catch (e: any) {
      setOfflineError(e?.message || 'Failed to save offline order. Run supabase/schema.sql + supabase/customer-features.sql first.')
    } finally {
      setOfflineBusy(false)
    }
  }

  const markOutOfStock = (id: number) => {
    const p = products.find((x) => x.id === id)
    if (p) toggleStock(p)
  }

  const salesData = Array.isArray(dashboard?.monthlyRevenue) ? dashboard.monthlyRevenue : []
  const maxSales = Math.max(1, ...salesData.map((month: any) => Number(month.revenue) || 0))
  const inStockCount = products.filter((product) => product.status === 'In stock').length
  const outOfStockCount = products.filter((product) => product.status === 'Out of stock').length
  const lowStockCount = products.filter((product) => product.status === 'Low stock').length
  const healthyStockPercent = products.length ? Math.round((inStockCount / products.length) * 100) : 0
  const pendingOrders = dashboard?.pending ?? orders.filter((order) => order.status === 'Pending').length
  const sectionNames: Record<AdminSection, string> = { overview: t('Overview'), orders: t('Orders'), products: t('Products'), inventory: t('Inventory'), messages: t('Messages'), 'login-users': 'Login Users', analytics: 'Visitor Analytics', 'abandoned-carts': 'Abandoned Carts', 'notification-automation': 'Notification Automation', 'coupons-offers': 'Coupons & Offers', 'website-content': 'Website Content', 'ai-assistant': 'AI Assistant', settings: t('Settings') }
  const refreshOverview = () => { void loadOrders(); void loadProducts(); void loadExtras() }

  return (
    <main className="admin-page admin-studio">
      <a className="admin-skip-link" href="#admin-workspace">Skip to workspace</a>
      {mobileNavOpen && <button className="admin-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside ref={sidebarRef} className={`admin-sidebar ${mobileNavOpen ? 'is-open' : ''}`} role={mobileNavOpen ? 'dialog' : undefined} aria-modal={mobileNavOpen ? true : undefined} aria-label="Store navigation">
        <div className="admin-brand">
          <Link href={contentOnly ? '/admin/website-content' : '/admin'} className="admin-wordmark">AJR<span>ALWAYS JUST ROYAL</span></Link>
          <span className="admin-workspace-tag">STORE WORKSPACE</span>
          <button className="admin-mobile-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={20} /></button>
        </div>

        <div className="admin-nav-title">{t('Workspace')}</div>
        <nav className="admin-nav" id="admin-navigation" aria-label="Administration" onClick={() => setMobileNavOpen(false)}>
          {contentOnly && <Link className={section === 'website-content' ? 'active' : ''} aria-current={section === 'website-content' ? 'page' : undefined} href="/admin/website-content">
            <Globe2 size={18} /> Website Content
          </Link>}
          {!contentOnly && <>
          <Link className={section === 'overview' ? 'active' : ''} aria-current={section === 'overview' ? 'page' : undefined} href="/admin">
            <BarChart3 size={18} /> {t('Overview')}
          </Link>
          <Link className={section === 'orders' ? 'active' : ''} aria-current={section === 'orders' ? 'page' : undefined} href="/admin/orders">
            <ShoppingBag size={18} /> {t('Orders')}
          </Link>
          <Link className={section === 'coupons-offers' ? 'active' : ''} aria-current={section === 'coupons-offers' ? 'page' : undefined} href="/admin/coupons-offers">
            <Tag size={18} /> Coupons &amp; Offers
          </Link>
          <Link className={section === 'abandoned-carts' ? 'active' : ''} aria-current={section === 'abandoned-carts' ? 'page' : undefined} href="/admin/abandoned-carts">
            <ShoppingCart size={18} /> Abandoned Carts
          </Link>
          <Link className={section === 'notification-automation' ? 'active' : ''} aria-current={section === 'notification-automation' ? 'page' : undefined} href="/admin/notification-automation">
            <Bell size={17} /><span>Notifications</span>
          </Link>
          <Link className={section === 'products' ? 'active' : ''} aria-current={section === 'products' ? 'page' : undefined} href="/admin/products">
            <Package size={18} /> {t('Products')}
          </Link>
          <Link className={section === 'inventory' ? 'active' : ''} aria-current={section === 'inventory' ? 'page' : undefined} href="/admin/inventory">
            <Box size={18} /> {t('Inventory')}
          </Link>
          <Link className={section === 'messages' ? 'active' : ''} aria-current={section === 'messages' ? 'page' : undefined} href="/admin/messages">
            <MessageCircle size={18} /> {t('Messages')}
            {unreadCount > 0 && <span className="admin-nav-badge">{unreadCount}</span>}
          </Link>
          <Link className={section === 'login-users' ? 'active' : ''} aria-current={section === 'login-users' ? 'page' : undefined} href="/admin/login-users">
            <User size={18} /> Login Users
          </Link>
          <Link className={section === 'analytics' ? 'active' : ''} aria-current={section === 'analytics' ? 'page' : undefined} href="/admin/analytics">
            <BarChart3 size={18} /> Visitor Analytics
          </Link>
          <Link className={section === 'ai-assistant' ? 'active' : ''} aria-current={section === 'ai-assistant' ? 'page' : undefined} href="/admin/ai-assistant">
            <BarChart3 size={18} /> AI Assistant
          </Link>
          <Link className={section === 'website-content' ? 'active' : ''} aria-current={section === 'website-content' ? 'page' : undefined} href="/admin/website-content">
            <Globe2 size={18} /> Website Content
          </Link>
          <Link className={section === 'settings' ? 'active' : ''} aria-current={section === 'settings' ? 'page' : undefined} href="/admin/settings">
            <Settings size={18} /> {t('Settings')}
          </Link>
          </>}
        </nav>

        <LanguageSwitcher className="admin-language-switcher" />
        <Link href="/" className="admin-store-link"><Store size={17} /><span>{t('Visit your store')}<small>{t('See the customer experience')}</small></span><ArrowUpRight size={16} /></Link>
        <div className="admin-profile-card">
          <div className="admin-profile-top">
            <div className="admin-avatar"><User size={19} /></div>
            <div>
              <span className="admin-profile-label">{contentOnly ? 'Content Manager' : 'Admin'}</span>
              <span className="admin-profile-mail">{loginEmail || ADMIN_EMAILS[0]}</span>
            </div>
          </div>
          <button className="button button-dark admin-logout" onClick={adminLogout}>
            <LogOut size={14} /> {t('Sign out')}
          </button>
        </div>
      </aside>

      <section className="admin-content" id="admin-workspace" tabIndex={-1} inert={mobileNavOpen}>
        <header className="admin-workspace-bar">
          <div><button ref={navigationTriggerRef} className="admin-menu-toggle" aria-label={t('Open navigation')} aria-expanded={mobileNavOpen} aria-controls="admin-navigation" onClick={() => setMobileNavOpen(!mobileNavOpen)}><Menu size={21} /></button><span className="admin-breadcrumb-brand">{t('Workspace')}</span><ChevronRight size={14} /><span>{sectionNames[section]}</span></div>
          <div><span className="admin-private-label"><ShieldCheck size={14} /> {t('Private workspace')}</span>{!contentOnly && <><Link href="/admin/messages" className="icon-button admin-inbox-shortcut" aria-label={`${t('Messages')}, ${unreadCount} ${t('unread')}`}><Bell size={18} />{unreadCount > 0 && <span className="admin-badge-dot" />}</Link><Link href="/admin/settings" className="admin-header-avatar" aria-label={t('Administrator settings')}><User size={17} /></Link></>}</div>
        </header>
        {section === 'overview' ? (
          <>
        <section className="admin-topbar">
          <div>
            <span className="admin-kicker"><span className="admin-kicker-line" /> A little overview. A bigger picture.</span>
            <h1>Good things are <em>growing.</em></h1>
            <p className="admin-page-description">Welcome back. Here’s how your store is doing.</p>
          </div>
          <div className="admin-topbar-actions">
            <button className="button button-light" onClick={refreshOverview} disabled={dashboardLoading || loadingOrders || loadingProducts}><RefreshCw size={15} /> Refresh</button>
            <button className="button button-dark" onClick={openCreateProduct}><Plus size={16} /> Add product</button>
          </div>
        </section>

        <section className="admin-summary-grid">
          <article className="admin-summary-card admin-revenue-card">
            <div className="summary-card-head">
              <span>Total revenue</span>
              <span className="admin-metric-icon"><CircleDollarSign size={19} /></span>
            </div>
            <div className="summary-value">₹{totalRevenue.toLocaleString('en-IN')}</div>
            <div className="summary-meta"><span className="admin-meta-dot" /> Excluding cancelled orders</div>
          </article>
          <article className="admin-summary-card">
            <div className="summary-card-head">
              <span>Total orders</span>
              <span className="admin-metric-icon"><ShoppingBag size={19} /></span>
            </div>
            <div className="summary-value">{dashboard?.orders ?? orders.length}</div>
            <div className="summary-meta"><span className="admin-meta-dot amber" /> {pendingOrders} awaiting fulfilment</div>
          </article>
          <article className="admin-summary-card">
            <div className="summary-card-head">
              <span>Products</span>
              <span className="admin-metric-icon"><Package size={19} /></span>
            </div>
            <div className="summary-value">{products.length}</div>
            <div className="summary-meta"><span className={`admin-meta-dot ${lowStock > 0 ? 'amber' : ''}`} /> {lowStock > 0 ? `${lowStock} need your attention` : 'No stock alerts'}</div>
          </article>
          <article className="admin-summary-card">
            <div className="summary-card-head">
              <span>Customer inquiries</span>
              <span className="admin-metric-icon"><MessageCircle size={19} /></span>
            </div>
            <div className="summary-value">{dashboard?.inquiries ?? messages.length}</div>
            <div className="summary-meta"><span className="admin-meta-dot" /> {unreadCount} unread messages</div>
          </article>
        </section>

        {(dashboardError || productsError || ordersError || messagesError) && <p className="messages-error" role="alert">Some store data couldn’t be loaded. Refresh to try again. {[dashboardError, productsError, ordersError, messagesError].filter(Boolean).join(' ')}</p>}
        {(dashboardLoading || loadingProducts || loadingOrders) && <p className="admin-loading-note" role="status">Updating your store overview…</p>}

        <section className="admin-grid">
          <section className="admin-panel admin-panel-large">
            <section className="panel-head">
              <div>
                <span className="panel-eyebrow">Performance</span>
                <h2>Revenue at a glance</h2>
              </div>
              <span className="admin-period"><Calendar size={14} /> Last 12 months</span>
            </section>

            <section className="chart-panel">
              {dashboardLoading && salesData.length === 0 ? <div className="admin-chart-empty" role="status"><BarChart3 size={28} /><p>Gathering your sales…</p></div> : salesData.length === 0 || salesData.every((month: any) => Number(month.revenue) === 0) ? <div className="admin-chart-empty"><BarChart3 size={32} /><h3>Your next chapter starts here</h3><p>Revenue will take shape as your first orders arrive.</p><Link href="/admin/orders" className="admin-inline-link">View orders <ArrowRight size={14} /></Link></div> : (
                <div className="admin-chart-scroll" tabIndex={0} aria-label="Monthly revenue chart, scroll to see all months"><div className="admin-chart-plot">
                  <div className="admin-chart-axis" aria-hidden="true"><span>₹{maxSales.toLocaleString('en-IN')}</span><span>₹{Math.round(maxSales / 2).toLocaleString('en-IN')}</span><span>₹0</span></div>
                  <div className="chart-grid" role="img" aria-label={`Monthly revenue: ${salesData.map((month: any) => `${month.label}, ${Number(month.revenue || 0).toLocaleString('en-IN')} rupees`).join('; ')}`}>
                    {salesData.map((month: any, index: number) => (
                      <div className="chart-bar-wrap" key={month.label} tabIndex={0} aria-label={`${month.label}: ₹${Number(month.revenue || 0).toLocaleString('en-IN')}`}>
                        <span className="admin-chart-tooltip">₹{Number(month.revenue || 0).toLocaleString('en-IN')}</span>
                        <div className="chart-bar-bg">
                          <div className="chart-bar" style={{ height: `${Math.round(((Number(month.revenue) || 0) / maxSales) * 100)}%`, animationDelay: `${index * 35}ms` }}></div>
                        </div>
                        <span className="chart-label">{month.label}</span>
                      </div>
                    ))}
                  </div>
                </div></div>
              )}
            </section>
            <section className="mini-stats">
              <div><span className="stat-label">Online sales</span><span className="stat-value">₹{Number(dashboard?.onlineRevenue ?? 0).toLocaleString('en-IN')} · {dashboard?.onlineOrders ?? 0} orders</span></div>
              <div><span className="stat-label">Offline sales</span><span className="stat-value">₹{Number(dashboard?.offlineRevenue ?? 0).toLocaleString('en-IN')} · {dashboard?.offlineOrders ?? 0} orders</span></div>
              <div><span className="stat-label">Pending fulfilments</span><span className="stat-value">{dashboard?.pending ?? 0}</span></div>
            </section>
          </section>

          <section className="admin-panel admin-health-panel">
            <section className="panel-head compact">
              <div>
                <span className="panel-eyebrow">A well-stocked store</span>
                <h2>Inventory health</h2>
              </div>
              <Leaf size={21} />
            </section>
            <div className="admin-stock-visual">
              <div className="admin-stock-ring" style={{ '--stock-progress': `${healthyStockPercent}%` } as CSSProperties} role="img" aria-label={`${inStockCount} of ${products.length} products in stock`}><div><strong>{loadingProducts && products.length === 0 ? '—' : products.length ? `${healthyStockPercent}%` : '—'}</strong><span>{products.length ? 'in stock' : 'no products yet'}</span></div></div>
            </div>
            <div className="admin-stock-legend"><span><i /> In stock <strong>{inStockCount}</strong></span><span><i /> Low stock <strong>{lowStockCount}</strong></span><span><i /> Out of stock <strong>{outOfStockCount}</strong></span></div>
            <Link href="/admin/inventory" className="admin-health-link">{lowStock > 0 ? `${lowStock} products need attention` : 'Manage your inventory'}<ArrowRight size={16} /></Link>
          </section>
        </section>

        <section className="admin-grid lower-grid">
          <section className="admin-panel admin-recent-panel">
            <div className="panel-head"><div><span className="panel-eyebrow">Fresh from your store</span><h2>Recent orders</h2></div><Link className="admin-inline-link" href="/admin/orders">View all <ArrowUpRight size={15} /></Link></div>
            {orders.length === 0 ? <div className="messages-empty"><ShoppingBag size={30} /><h3>{loadingOrders ? 'Loading your orders…' : 'Room for your first order'}</h3><p>Online and in-store orders will appear here.</p></div> : <div className="admin-recent-list">{orders.slice(0, 4).map((order) => <button className="admin-recent-order" key={order.dbId || order.id} onClick={() => setSelectedOrder(order)}><span className="admin-customer-avatar">{initials(order.customer)}</span><span className="admin-recent-customer"><strong>{order.customer}</strong><small>{order.id} · {order.channel}</small></span><span className={`admin-order-status status-${order.status.toLowerCase()}`}>{order.status}</span><strong className="admin-recent-total">₹{order.total.toLocaleString('en-IN')}</strong><ChevronRight size={15} /></button>)}</div>}
          </section>
          <section className="admin-panel admin-care-panel">
            <span className="admin-care-icon"><MessageCircle size={23} /></span><span className="panel-eyebrow">A personal touch</span><h2>Great stores start<br />with a conversation.</h2><p>{unreadCount > 0 ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'inquiry' : 'inquiries'}. A little attention goes a long way.` : 'You’re all caught up. Your next customer conversation will be right here.'}</p><Link href="/admin/messages" className="admin-inline-link">Open your inbox <ArrowRight size={16} /></Link>
            <div className="admin-fulfilment-note"><Truck size={18} /><span><strong>{pendingOrders}</strong> orders awaiting fulfilment</span><Link href="/admin/orders" aria-label="View orders awaiting fulfilment"><ArrowUpRight size={17} /></Link></div>
          </section>
        </section>
        <div className="admin-overview-footer"><span><Leaf size={14} /> Thoughtfully managed. Naturally AJR.</span><Link href="/">Visit storefront <ArrowUpRight size={13} /></Link></div>

          </>
        ) : section === 'messages' ? (
          <>
            <section className="messages-page">
              <section className="admin-topbar">
                <div>
                  <span className="admin-kicker">Customer Inbox</span>
                  <h1>Messages</h1>
                </div>
                <div className="admin-topbar-actions">
                  <button className="button button-light" onClick={() => loadMessages()}>{loadingMessages ? 'Refreshing…' : 'Refresh'}</button>
                  <Link className="button button-dark" href="/admin"><BarChart3 size={16} /> Overview</Link>
                </div>
              </section>

              <section className="messages-stat-grid">
                <article className="admin-summary-card">
                  <div className="summary-card-head"><span><MessageCircle size={16} /> Total</span><Inbox size={16} /></div>
                  <div className="summary-value">{messages.length}</div>
                  <div className="summary-meta">all inquiries</div>
                </article>
                <article className="admin-summary-card">
                  <div className="summary-card-head"><span><Bell size={16} /> Unread</span><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--lime)', display: 'inline-block' }} /></div>
                  <div className="summary-value">{unreadCount}</div>
                  <div className="summary-meta">awaiting your reply</div>
                </article>
                <article className="admin-summary-card">
                  <div className="summary-card-head"><span><CheckCircle size={16} /> Read</span><Check size={16} /></div>
                  <div className="summary-value">{messages.length - unreadCount}</div>
                  <div className="summary-meta">opened inquiries</div>
                </article>
              </section>

              <section className="messages-toolbar">
                <div className="messages-search">
                  <Search size={18} />
                  <input placeholder="Search name, email or message…" value={messageQuery} onChange={(e) => setMessageQuery(e.target.value)} />
                </div>
                <div className="messages-filters">
                  {['All', 'Product & Retail Support', 'Custom Festive Hampers', 'Corporate Bulk Inquiry', 'Press & Collaborations'].map((f) => (
                    <button key={f} className={`chip ${messageFilter === f ? 'active' : ''}`} onClick={() => setMessageFilter(f)}>{f}</button>
                  ))}
                </div>
                <button className="button button-light small-button" onClick={markAllRead}>Mark all read</button>
              </section>

              <section className="messages-inbox">
                <div className="messages-list-pane">
                  {messagesError && <p className="messages-error">{messagesError}</p>}
                  {loadingMessages && <div className="messages-empty"><p>Loading messages…</p></div>}
                  {!loadingMessages && filteredMessages.length === 0 && (
                    <div className="messages-empty">
                      <Inbox size={40} />
                      <h3>No messages here</h3>
                      <p>Customer inquiries from the contact page will appear here instantly.</p>
                    </div>
                  )}
                  {filteredMessages.map((m) => (
                    <article
                      key={m.id || `${m.email}-${m.time}`}
                      className={`message-list-item ${m.read ? '' : 'unread'} ${selectedMessage?.id === m.id ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedMessage(m); if (!m.read && m.id) toggleMessageRead(m) } }}
                      onClick={() => { setSelectedMessage(m); if (!m.read && m.id) toggleMessageRead(m) }}
                    >
                      <span className={`message-avatar av-${categoryKey(m.subject)}`}>{initials(m.customer)}</span>
                      <div className="message-list-body">
                        <div className="message-list-top">
                          <span className="message-list-name">{m.customer}</span>
                          <span className="message-list-time">{m.time}</span>
                        </div>
                        <span className="message-list-subject">{subjectLabel(m.subject)}</span>
                        <p className="message-list-snippet">{m.detail}</p>
                      </div>
                      {!m.read && <span className="message-unread-dot"></span>}
                    </article>
                  ))}
                </div>
                <div className="message-detail-pane">
                  {selectedMessage ? (
                    <>
                      <div className="message-detail-head">
                        <span className={`message-avatar large av-${categoryKey(selectedMessage.subject)}`}>{initials(selectedMessage.customer)}</span>
                        <div>
                          <h2>{selectedMessage.customer}</h2>
                          <a className="message-detail-mail" href={`mailto:${selectedMessage.email}`}>{selectedMessage.email}</a>
                          {selectedMessage.phone && <span className="message-detail-phone">{selectedMessage.phone}</span>}
                        </div>
                        <span className={`message-status ${selectedMessage.read ? 'read' : 'unread'}`}>{selectedMessage.read ? 'Read' : 'Unread'}</span>
                      </div>
                      <span className="message-detail-subject">{subjectLabel(selectedMessage.subject)}</span>
                      <p className="message-detail-time">{selectedMessage.time} · via contact page</p>
                      <div className="message-detail-body"><p>{selectedMessage.detail}</p></div>
                      <div className="message-detail-actions">
                        <a className="button button-dark" href={`mailto:${selectedMessage.email}?subject=${encodeURIComponent('Re: ' + subjectLabel(selectedMessage.subject))}`}><Mail size={16} /> Reply by email</a>
                        <button className="button button-light" onClick={() => toggleMessageRead(selectedMessage)}>{selectedMessage.read ? 'Mark as unread' : 'Mark as read'}</button>
                        <button className="button message-delete" onClick={() => deleteMessage(selectedMessage)}><Trash2 size={16} /> Delete</button>
                      </div>
                    </>
                  ) : (
                    <div className="messages-empty detail">
                      <Mail size={44} />
                      <h3>Select a message</h3>
                      <p>Choose a conversation from the list to read the full inquiry.</p>
                    </div>
                  )}
                </div>
              </section>
            </section>
          </>
        ) : section === 'orders' ? (
          <section className="admin-panel admin-panel-table">
            <section className="admin-topbar">
              <div>
                <span className="admin-kicker">Order flow {loadingOrders ? '· Loading…' : `· ${orders.length}`}</span>
                <h1>Orders</h1>
              </div>
              <div className="admin-topbar-actions">
                <button className="button button-light" onClick={() => loadOrders()} disabled={loadingOrders}>Refresh</button>
                <button className="button button-dark" onClick={() => setShowOfflineOrder(true)}><Plus size={16} /> Offline order</button>
              </div>
            </section>
            {ordersError && <p className="messages-error">{ordersError}</p>}
            <div className="orders-toolbar">
              <input placeholder="Search order, customer, or email" value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} />
              <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} title="Filter by order status">
                {['All', ...ORDER_STATUSES].map((status) => <option key={status}>{status}</option>)}
              </select>
              <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)} title="Filter by payment status">
                {['All', ...PAYMENT_STATUSES].map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            <div className="admin-table-scroll">
              <table className="orders-table">
                <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Channel</th><th>Status</th><th>Payment</th><th>Coupon</th><th>Total</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={10} className="empty-table-cell">{loadingOrders ? 'Loading orders…' : 'No orders found.'}</td></tr>
                  ) : filteredOrders.map((order) => (
                    <tr key={order.dbId || order.id}>
                      <td className="order-id"><button className="text-link" onClick={() => setSelectedOrder(order)}>{order.id}</button></td>
                      <td><span className="customer-name">{order.customer}</span><span className="customer-mail">{order.email}</span>{order.phone && <span className="customer-mail">{order.phone}</span>}</td>
                      <td className="order-items-cell">{(order.items || []).map((item: any) => <div key={`${item.id}-${item.name}`}>{item.quantity} × {item.name}</div>)}</td>
                      <td><span className={`channel ${order.channel.toLowerCase()}`}>{order.channel}</span></td>
                      <td><select value={order.status} onChange={(e) => updateOrderStatus(order, e.target.value as OrderStatus)}>{ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
                      <td><span className="pay-method">{order.paymentMethod || 'COD'}</span><select value={order.paymentStatus || 'Pending'} onChange={(e) => updatePaymentStatus(order, e.target.value as PaymentStatus)} title="Payment status">{PAYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
                      <td>{order.couponCode ? <><strong>{order.couponCode}</strong><span className="customer-mail">−₹{(order.couponDiscount || 0) + (order.couponShippingDiscount || 0)}</span></> : '—'}</td>
                      <td className="order-total">₹{order.total}</td>
                      <td className="order-date">{order.date}</td>
                      <td><button className="icon-button small" title="Delete order" onClick={() => deleteOrder(order)}><X size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : section === 'products' ? (
          <section className="admin-panel admin-panel-table products-page">
            <section className="admin-topbar">
              <div><span className="admin-kicker">Shop catalogue · {products.filter((product) => product.active !== false).length} visible · {products.filter((product) => product.active === false).length} hidden</span><h1>Products</h1></div>
              <div className="admin-topbar-actions"><button className="button button-light" onClick={() => loadProducts()} disabled={loadingProducts}>Refresh</button><button className="button button-dark" onClick={openCreateProduct}><Plus size={16} /> Add product</button></div>
            </section>
            <section className="catalogue-health" aria-label="Catalogue health overview">
              <div className="catalogue-health-lead"><span className="catalogue-health-eyebrow">Catalogue health</span><strong>{products.length || '—'}</strong><span>total products</span></div>
              <div className="catalogue-health-metric"><span>Published</span><strong>{visibleProductCount}</strong><small>{products.length ? `${Math.round((visibleProductCount / products.length) * 100)}% of catalogue` : 'No products yet'}</small></div>
              <div className="catalogue-health-metric"><span>Available now</span><strong>{availableProductCount}</strong><small>{products.length ? `${Math.round((availableProductCount / products.length) * 100)}% ready to sell` : 'No products yet'}</small></div>
              <div className={`catalogue-health-metric attention ${lowStock ? 'has-attention' : ''}`}><span>Needs attention</span><strong>{lowStock}</strong><small>{lowStock ? 'Low or unavailable stock' : 'Inventory looks healthy'}</small></div>
            </section>
            {productsError && <p className="messages-error">{productsError}</p>}
            {loadingProducts && <p>Loading products…</p>}
            <section className="products-command-bar" aria-label="Product catalogue controls">
              <label className="product-search">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search products</span>
                <input placeholder="Search products, categories, origins…" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} />
                {productQuery && <button type="button" className="clear-product-search" onClick={() => setProductQuery('')} aria-label="Clear product search"><X size={14} /></button>}
              </label>
            <div className="product-visibility-filters" role="group" aria-label="Filter products by shop visibility">
              {(['All', 'Visible', 'Hidden'] as const).map((filter) => (
                <button key={filter} type="button" className={`chip ${productVisibilityFilter === filter ? 'active' : ''}`} aria-pressed={productVisibilityFilter === filter} onClick={() => setProductVisibilityFilter(filter)}>
                  {filter} <span>{filter === 'All' ? products.length : filter === 'Visible' ? visibleProductCount : hiddenProductCount}</span>
                </button>
              ))}
            </div>
            </section>
            <div className="products-list-heading"><span>Catalogue records</span><strong>{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'} shown</strong></div>
            {!loadingProducts && filteredProducts.length === 0 ? <div className="messages-empty"><Package size={40} /><h3>{products.length === 0 ? 'No products yet' : 'No products in this view'}</h3><p>{products.length === 0 ? 'Products from the shop catalogue will appear here.' : 'Choose another visibility filter to see products.'}</p></div> : (
              <div className="products-list">
                {filteredProducts.map((product) => (
                  <article className="product-admin-row" key={product.id}>
                    <span className="product-admin-image">{product.image ? <img src={product.image} alt={product.name} /> : <Image size={22} />}</span>
                    <div className="product-admin-info"><strong>{product.name}</strong><span>{product.category} · ₹{product.varieties?.[0]?.price ?? product.price * 4}/kg</span><span>{product.varieties?.length ? `Varieties: ${product.varieties.map((variety) => variety.name).join(', ')}` : 'Standard variety'} · Packs: {product.packSizes?.length ? product.packSizes.join(', ') : 'Shop defaults'}</span><span>{product.origin || 'India'}{product.detail ? ` · ${product.detail}` : ''}{product.nutrients?.length ? ` · ${product.nutrients.join(', ')}` : ''}</span></div>
                    <div className="product-variant-summary">
                      <button
                        type="button"
                        className="variant-summary-toggle"
                        aria-expanded={expandedVariantProductIds.has(product.id)}
                        onClick={() => setExpandedVariantProductIds((current) => {
                          const next = new Set(current)
                          if (next.has(product.id)) next.delete(product.id)
                          else next.add(product.id)
                          return next
                        })}
                      >
                        <span><Package size={13} /> {product.varieties?.length || 1} {product.varieties?.length === 1 ? 'variety' : 'varieties'}</span>
                        <ChevronRight size={14} />
                      </button>
                      {expandedVariantProductIds.has(product.id) && (
                        <div className="product-variant-list" aria-label={`${product.name} varieties`}>
                          {(product.varieties?.length ? product.varieties : [{ id: 'standard', name: 'Standard', price: product.price * 4, active: true }]).map((variety) => {
                            const unavailable = variety.active === false || (variety.stock !== undefined && variety.stock <= 0)
                            const varietyImage = resolveVarietyImage(product.name, product.image, variety)
                            return <div className={`product-variant-item ${unavailable ? 'is-unavailable' : ''}`} key={variety.id || variety.name}>
                              <span className="product-variant-thumb">{varietyImage ? <img src={varietyImage} alt="" /> : <Image size={12} />}</span>
                              <span><strong>{variety.name}</strong><small>{variety.stock === undefined ? 'Uses product stock' : `${variety.stock} units`} · {unavailable ? 'Unavailable' : 'Available'}</small></span>
                              <b>₹{variety.price}/kg</b>
                            </div>
                          })}
                          <button type="button" className="variant-summary-edit" onClick={() => openEditProduct(product)}>Manage varieties <ArrowRight size={13} /></button>
                        </div>
                      )}
                    </div>
                    <section className="product-availability" aria-label={`${product.name} availability`}>
                      <span className="inventory-block-label">Availability</span>
                      <AvailabilitySwitch product={product} pending={pendingStockIds.has(product.id)} feedback={stockFeedback[product.id]} onToggle={toggleStock} />
                    </section>
                    <section className="product-shop-visibility" aria-label={`${product.name} shop visibility`}>
                      <span className="inventory-block-label">Shop visibility</span>
                      <span className={`product-visibility ${product.active === false ? 'is-hidden' : 'is-visible'}`}>{product.active === false ? 'Hidden from shop' : 'Visible in shop'}</span>
                      <button className="visibility-action" type="button" onClick={() => toggleProductVisibility(product)}>{product.active === false ? <><Eye size={14} /> Show</> : <><EyeOff size={14} /> Hide</>}</button>
                    </section>
                    <div className="product-admin-actions" role="group" aria-label={`${product.name} actions`}><button className="button button-light small-button" onClick={() => openEditProduct(product)}>Edit</button><button className="icon-button small destructive-action" title={`Delete ${product.name}`} aria-label={`Delete ${product.name}`} onClick={() => deleteProduct(product)}><Trash2 size={15} /></button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : section === 'inventory' ? (
          <section className="admin-panel">
            <section className="admin-topbar">
              <div><span className="admin-kicker">Stock control · {lowStock} alerts</span><h1>Inventory</h1></div>
              <div className="admin-topbar-actions"><button className="button button-light" onClick={() => loadProducts()} disabled={loadingProducts}>Refresh</button><Link className="button button-dark" href="/admin/products"><Package size={16} /> Products</Link></div>
            </section>
            {productsError && <p className="messages-error">{productsError}</p>}
            {loadingProducts && <p>Loading inventory…</p>}
            <div className="stock-list">
              {products.map((product) => (
                <div className="stock-row" key={product.id}>
                  <div className="stock-row-left"><span className="stock-image">{product.image ? <img src={product.image} alt={product.name} /> : <Image size={20} />}</span><div className="stock-info"><span className="stock-title">{product.name}</span><span className="stock-meta">{product.stock} units · ₹{product.varieties?.[0]?.price ?? product.price * 4}/kg</span><span className={`stock-status ${product.status.toLowerCase().replace(/\s/g, '-')}`}>{product.status}</span></div></div>
                  <section className="stock-row-availability" aria-label={`${product.name} availability`}>
                    <span className="inventory-block-label">Availability</span>
                    <AvailabilitySwitch product={product} pending={pendingStockIds.has(product.id)} feedback={stockFeedback[product.id]} onToggle={toggleStock} />
                  </section>
                  <div className="stock-right" role="group" aria-label={`${product.name} actions`}><button className="button button-light small-button" onClick={() => openEditProduct(product)}><Settings size={14} /> Edit</button></div>
                </div>
              ))}
              {!loadingProducts && products.length === 0 && <div className="messages-empty"><Box size={40} /><h3>Inventory is empty</h3><p>Add a product to start tracking stock.</p></div>}
            </div>
          </section>
        ) : section === 'analytics' ? (
          <VisitorAnalytics />
        ) : section === 'login-users' ? (
          <LoginUsers />
        ) : section === 'abandoned-carts' ? (
          <AbandonedCarts />
        ) : section === 'notification-automation' ? (
          <NotificationAutomation />
        ) : section === 'coupons-offers' ? (
          <CouponsOffers />
        ) : section === 'website-content' ? (
          <WebsiteContentManager />
        ) : section === 'ai-assistant' ? (
          <AiAssistantAdmin />
        ) : (
          <section className="admin-panel settings-page">
            <section className="admin-topbar settings-topbar">
              <div><span className="admin-kicker"><span className="admin-kicker-line" /> Store control room</span><h1>Settings <em>&amp; stewardship</em></h1><p className="admin-page-description">Shape the face of your store and keep its records close at hand.</p></div>
              <button className="button button-dark" form="store-branding-form" type="submit" disabled={settingsSaving || logoUploading || settingsLoading}>
                {settingsSaving ? 'Saving…' : <><Check size={16} /> Save brand details</>}
              </button>
            </section>

            {settingsError && <p className="messages-error" role="alert">{settingsError}</p>}
            {settingsNotice && <p className="settings-notice" role="status"><CheckCircle size={15} /> {settingsNotice}</p>}

            <div className="settings-control-grid">
              <form id="store-branding-form" className="branding-studio" onSubmit={saveStoreSettings}>
                <header className="settings-section-head">
                  <span className="settings-section-icon"><Store size={18} /></span>
                  <div><span className="panel-eyebrow">Brand atelier</span><h2>Your storefront identity</h2><p>Preview a considered masthead before you save it for the team.</p></div>
                </header>
                <div className="branding-studio-layout">
                  <aside className="storefront-preview" aria-label="Storefront branding preview">
                    <span className="preview-eyebrow">Live storefront preview</span>
                    <div className="preview-masthead">
                      <span className="preview-logo">{brandingDraft.logoUrl ? <img src={brandingDraft.logoUrl} alt="Shop logo preview" /> : <Leaf size={24} />}</span>
                      <span className="preview-brand"><strong>{brandingDraft.shopName || 'Your shop name'}</strong><small>{brandingDraft.tagline || 'Your store tagline'}</small></span>
                    </div>
                    <div className="preview-shelf"><span /><span /><span /></div>
                    <p><Leaf size={13} /> Quietly crafted for everyday rituals.</p>
                  </aside>
                  <div className="branding-fields">
                    <label><span>Shop name</span><input value={brandingDraft.shopName} onChange={(event) => setBrandingDraft((current) => ({ ...current, shopName: event.target.value }))} maxLength={80} placeholder="AJR" required /></label>
                    <label><span>Short tagline</span><input value={brandingDraft.tagline} onChange={(event) => setBrandingDraft((current) => ({ ...current, tagline: event.target.value }))} maxLength={140} placeholder="ALWAYS JUST ROYAL" /></label>
                    <div className="logo-upload-control">
                      <div><span className="inventory-block-label">Shop logo</span><small>PNG, JPG, WEBP or SVG · up to 5 MB</small></div>
                      <label className="button button-light logo-upload-button"><Upload size={15} /> {logoUploading ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadStoreLogo} disabled={logoUploading} /></label>
                    </div>
                    <p className="branding-save-note">Saved identity: <strong>{storeSettings.shopName}</strong>{settingsLoading ? ' · loading saved details…' : ''}</p>
                  </div>
                </div>
              </form>

              <section className="data-vault" aria-labelledby="data-vault-title">
                <header className="settings-section-head">
                  <span className="settings-section-icon data"><ClipboardList size={18} /></span>
                  <div><span className="panel-eyebrow">Data vault</span><h2 id="data-vault-title">Take your records with you</h2><p>Download clean, Excel-ready records from your current workspace.</p></div>
                </header>
                <div className="export-card-stack">
                  <article className="settings-export-card product-export">
                    <span className="export-icon"><Package size={18} /></span><div><strong>Product catalogue</strong><small>{products.length} {products.length === 1 ? 'product' : 'products'} · stock, pricing &amp; visibility</small></div>
                    <button className="icon-button export-download" type="button" onClick={exportProducts} disabled={loadingProducts} aria-label="Download products Excel file"><Download size={16} /></button>
                  </article>
                  <article className="settings-export-card order-export">
                    <span className="export-icon"><ShoppingBag size={18} /></span><div><strong>Order ledger</strong><small>{orders.length} {orders.length === 1 ? 'order' : 'orders'} · customer, payment &amp; fulfilment</small></div>
                    <button className="icon-button export-download" type="button" onClick={exportOrders} disabled={loadingOrders} aria-label="Download orders Excel file"><Download size={16} /></button>
                  </article>
                  <article className="settings-export-card message-export">
                    <span className="export-icon"><MessageCircle size={18} /></span><div><strong>Message archive</strong><small>{messages.length} {messages.length === 1 ? 'message' : 'messages'} · customer enquiries &amp; status</small></div>
                    <button className="icon-button export-download" type="button" onClick={exportMessages} disabled={loadingMessages} aria-label="Download messages Excel file"><Download size={16} /></button>
                  </article>
                </div>
                <p className="export-footnote"><span>Excel-ready .xls</span> Data is prepared in your browser and never sent to another service.</p>
              </section>
            </div>

            <section className="order-email-desk" aria-labelledby="order-email-desk-title">
              <header className="settings-section-head">
                <span className="settings-section-icon dispatch"><Mail size={18} /></span>
                <div><span className="panel-eyebrow">Order email desk</span><h2 id="order-email-desk-title">Send a considered confirmation</h2><p>Choose a saved order to send its complete AJR confirmation to the customer, or send the same template safely to yourself for review.</p></div>
              </header>
              <div className="order-email-desk-controls">
                <label className="order-email-select"><span>Order &amp; recipient</span><select value={emailOrderId} onChange={(event) => setEmailOrderId(event.target.value)} disabled={emailSendBusy || loadingOrders}>
                  <option value="">Select an order to prepare its email</option>
                  {emailableOrders.map((order) => <option key={order.dbId} value={order.dbId}>{order.id} · {order.customer} · {order.email}</option>)}
                </select></label>
                <div className="order-email-actions">
                  <button className="button button-light" type="button" onClick={() => sendOrderEmail('preview')} disabled={!emailOrderId || emailSendBusy}><Eye size={15} /> {emailSendBusy ? 'Sending…' : 'Send me a preview'}</button>
                  <button className="button button-dark" type="button" onClick={() => sendOrderEmail('customer')} disabled={!emailOrderId || emailSendBusy}><Mail size={15} /> {emailSendBusy ? 'Sending…' : 'Send confirmation'}</button>
                </div>
              </div>
              {loadingOrders ? <p className="order-email-note">Loading saved orders…</p> : emailableOrders.length === 0 ? <p className="order-email-note">No eligible saved orders are available yet.</p> : <p className="order-email-note"><ShieldCheck size={14} /> The recipient and contents come from the saved order, never from this form.</p>}
              {emailSendError && <p className="messages-error order-email-feedback" role="alert">{emailSendError}</p>}
              {emailSendNotice && <p className="settings-notice order-email-feedback" role="status"><CheckCircle size={15} /> {emailSendNotice}</p>}
            </section>

            <section className="order-sms-desk" aria-labelledby="order-sms-desk-title">
              <header className="settings-section-head">
                <span className="settings-section-icon dispatch sms"><MessageCircle size={18} /></span>
                <div><span className="panel-eyebrow">Order SMS desk</span><h2 id="order-sms-desk-title">Send a clear delivery update</h2><p>Send the approved AJR order SMS to the mobile number already saved with a customer order.</p></div>
              </header>
              <div className="order-email-desk-controls">
                <label className="order-email-select"><span>Order &amp; mobile recipient</span><select value={smsOrderId} onChange={(event) => setSmsOrderId(event.target.value)} disabled={smsSendBusy || loadingOrders}>
                  <option value="">Select an order to prepare its SMS</option>
                  {smsableOrders.map((order) => <option key={order.dbId} value={order.dbId}>{order.id} Â· {order.customer} Â· â€¢â€¢â€¢â€¢ {String(order.phone || '').replace(/\D/g, '').slice(-4)}</option>)}
                </select></label>
                <div className="order-email-actions">
                  <button className="button button-dark" type="button" onClick={sendOrderSms} disabled={!smsOrderId || smsSendBusy}><MessageCircle size={15} /> {smsSendBusy ? 'Sendingâ€¦' : 'Send SMS confirmation'}</button>
                </div>
              </div>
              <p className="order-sms-template">AJR: Hello <b>{'{customer_name}'}</b>, your order <b>{'{order_number}'}</b> is received. Total: Rs <b>{'{total_amount}'}</b>. Payment: <b>{'{payment_status}'}</b>. Track: <b>{'{tracking_url}'}</b>. Thank you.</p>
              {loadingOrders ? <p className="order-email-note">Loading saved ordersâ€¦</p> : smsableOrders.length === 0 ? <p className="order-email-note">No eligible saved mobile numbers are available yet.</p> : <p className="order-email-note"><ShieldCheck size={14} /> Recipient, DLT template, and message values are resolved securely from the saved order.</p>}
              {smsSendError && <p className="messages-error order-email-feedback" role="alert">{smsSendError}</p>}
              {smsSendNotice && <p className="settings-notice order-email-feedback" role="status"><CheckCircle size={15} /> {smsSendNotice}</p>}
            </section>

            <section className="settings-access-panel">
              <div className="settings-access-intro"><span className="settings-section-icon secure"><ShieldCheck size={18} /></span><div><span className="panel-eyebrow">Workspace access</span><h2>Store stewardship is protected.</h2><p>Only approved administrators can access orders, customer messages, exports, and your saved brand identity.</p></div></div>
              <div className="settings-active-admin"><span>Signed in as</span><strong>{loginEmail || ADMIN_EMAILS[0]}</strong><button className="button button-light" onClick={adminLogout}><X size={14} /> Sign out</button></div>
              <details className="settings-admin-list"><summary>View approved administrators <ChevronRight size={15} /></summary><ul>{ADMIN_EMAILS.map((email) => <li key={email}>{email}</li>)}</ul></details>
            </section>
          </section>
        )}
        {selectedOrder && (
          <div className="admin-modal-backdrop">
            <div className="admin-modal" data-admin-dialog role="dialog" aria-modal="true" aria-label={`Order ${selectedOrder.id}`} tabIndex={-1}>
              <div className="modal-head">
                <div>
                  <span className="panel-eyebrow">Order detail</span>
                  <h2>{selectedOrder.id}</h2>
                </div>
                <button className="icon-button small" aria-label="Close order details" onClick={() => setSelectedOrder(null)}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                <div><strong>Customer:</strong> {selectedOrder.customer} ({selectedOrder.email})</div>
                {selectedOrder.phone && <div><strong>Phone:</strong> {selectedOrder.phone}</div>}
                {selectedOrder.address && <div><strong>Address:</strong> {selectedOrder.address}</div>}
                <div><strong>Channel:</strong> {selectedOrder.channel} · <strong>Date:</strong> {selectedOrder.date}</div>
                <div>
                  <strong>Items:</strong>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    {(selectedOrder.items || []).map((i: any) => (
                      <li key={String(i.id) + i.name}>{i.quantity} × {i.name} — ₹{i.price}</li>
                    ))}
                  </ul>
                </div>
                <div><strong>Original order amount:</strong> ₹{selectedOrder.couponOriginalSubtotal ?? selectedOrder.subtotal ?? selectedOrder.total} · <strong>Shipping:</strong> ₹{selectedOrder.shipping ?? 0}</div>
                {selectedOrder.couponCode && <div><strong>Coupon used:</strong> {selectedOrder.couponCode}{selectedOrder.couponName ? ` · ${selectedOrder.couponName}` : ''} · <strong>Discount:</strong> −₹{selectedOrder.couponDiscount ?? 0}{(selectedOrder.couponShippingDiscount || 0) > 0 ? ` · Shipping waived: −₹${selectedOrder.couponShippingDiscount}` : ''}</div>}
                <div><strong>Final payable amount:</strong> ₹{selectedOrder.total}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>Status:</strong>
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => updateOrderStatus(selectedOrder, e.target.value as OrderStatus)}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px', fontSize: 13 }}
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>Payment:</strong>
                  <span className="pay-method" style={{ fontSize: 13 }}>{selectedOrder.paymentMethod || 'COD'}</span>
                  <select
                    value={selectedOrder.paymentStatus || 'Pending'}
                    onChange={(e) => updatePaymentStatus(selectedOrder, e.target.value as PaymentStatus)}
                    title="Payment status"
                    style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px', fontSize: 13 }}
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button className="button button-light small-button" onClick={() => deleteOrder(selectedOrder)}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showProductForm && (
          <div className="admin-modal-backdrop">
            <div className="admin-modal wide" data-admin-dialog role="dialog" aria-modal="true" aria-label={editingId ? 'Edit product' : 'Add product'} tabIndex={-1}>
              <div className="modal-head">
                <div>
                  <span className="panel-eyebrow">{editingId ? 'Edit product' : 'Create product'}</span>
                  <h2>{editingId ? 'Edit Product' : 'Add Product'}</h2>
                </div>
                <button className="icon-button small" aria-label="Close product form" onClick={() => setShowProductForm(false)}><X size={16} /></button>
              </div>
              <form className="admin-form" onSubmit={saveProduct}>
                <ProductForm draft={productDraft} setDraft={setProductDraft} uploadImage={uploadImage} />
                <div className="modal-actions">
                  <button type="button" className="button button-light" onClick={() => setShowProductForm(false)}>Cancel</button>
                  <button type="submit" className="button button-dark" disabled={savingProduct}>
                    {savingProduct ? 'Saving…' : editingId ? 'Save changes' : 'Save product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showOfflineOrder && (
          <div className="admin-modal-backdrop">
            <div className="admin-modal" data-admin-dialog role="dialog" aria-modal="true" aria-label="Add offline order" tabIndex={-1}>
              <div className="modal-head">
                <div>
                  <span className="panel-eyebrow">A sale from your store</span>
                  <h2>Add Offline Order</h2>
                </div>
                <button className="icon-button small" aria-label="Close offline order form" onClick={() => setShowOfflineOrder(false)}><X size={16} /></button>
              </div>
              <form className="admin-form" onSubmit={addOfflineOrder}>
                <label><span>Customer name *</span><input value={newOrder.customer} onChange={(e) => setNewOrder({ ...newOrder, customer: e.target.value })} placeholder="Walk-in customer name" required /></label>
                <label><span>Phone</span><input value={newOrder.phone} onChange={(e) => setNewOrder({ ...newOrder, phone: e.target.value })} placeholder="+91 ..." /></label>
                <label><span>Email (optional)</span><input type="email" value={newOrder.email} onChange={(e) => setNewOrder({ ...newOrder, email: e.target.value })} placeholder="optional" /></label>
                <label><span>Product sold *</span>
                  <select value={newOrder.productId} onChange={(e) => setNewOrder({ ...newOrder, productId: e.target.value })} required>
                    <option value="">Select a shop product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={String(p.id)}>{p.name} — ₹{p.price}</option>
                    ))}
                  </select>
                </label>
                <label><span>Quantity</span><input type="number" min={1} value={newOrder.quantity} onChange={(e) => setNewOrder({ ...newOrder, quantity: e.target.value })} required /></label>
                <label><span>Payment</span>
                  <select value={newOrder.payment} onChange={(e) => setNewOrder({ ...newOrder, payment: e.target.value as 'Paid' | 'Pending' })}>
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </label>
                <label><span>Note (optional)</span><input value={newOrder.address} onChange={(e) => setNewOrder({ ...newOrder, address: e.target.value })} placeholder="In-store / counter note" /></label>
                <div className="order-total" style={{ fontSize: 16 }}>Total: ₹{offlineTotal}</div>
                {offlineError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{offlineError}</p>}
                <div className="modal-actions">
                  <button type="button" className="button button-light" onClick={() => setShowOfflineOrder(false)}>Cancel</button>
                  <button type="submit" className="button button-dark" disabled={offlineBusy}>{offlineBusy ? 'Saving…' : `Save offline order · ₹${offlineTotal}`}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

const PRODUCT_TYPES = [
  'Almonds', 'Cashews', 'Pistachios', 'Walnuts', 'Figs', 'Raisins', 'Dates',
  'Prunes', 'Seeds', 'Spices', 'Berries', 'Tropical Fruit', 'Stone Fruit', 'Mixes', 'Snacking',
]

function ProductForm({
  draft,
  setDraft,
  uploadImage,
}: {
  draft: ProductDraft
  setDraft: (draft: ProductDraft) => void
  uploadImage: (file: File) => Promise<string | null>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const varietyFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadingVarietyId, setUploadingVarietyId] = useState<string | null>(null)
  const patch = (part: Partial<ProductDraft>) => setDraft({ ...draft, ...part })

  const setVariety = (index: number, part: Partial<VarietyDraft>) =>
    patch({ varieties: draft.varieties.map((v, i) => (i === index ? { ...v, ...part } : v)) })

  return (
    <>
      <label>
        <span>Product name *</span>
        <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Premium Almonds" required />
      </label>

      <label>
        <span>Type / category</span>
        <input list="admin-product-types" value={draft.type} onChange={(e) => patch({ type: e.target.value })} placeholder="e.g. Almonds" />
        <datalist id="admin-product-types">
          {PRODUCT_TYPES.map((t) => <option key={t} value={t} />)}
        </datalist>
      </label>

      <label>
        <span>Price per kg (₹) *</span>
        <input type="number" min={1} value={draft.perKg} onChange={(e) => patch({ perKg: e.target.value })} placeholder="1200" required />
      </label>
      <p className="form-hint">Prices are always per kg — the shop scales them to the gram size the customer picks.</p>

      <div className="variety-block">
        <div className="variety-head">
          <span>Pack sizes in the gram dropdown</span>
          {draft.packSizes.length > 0 && (
            <button
              type="button"
              className="button button-light small-button"
              onClick={() => patch({ packSizes: [] })}
            >
              Clear all
            </button>
          )}
        </div>
        <div className="pack-size-chips">
          {PACK_SIZE_OPTIONS.map((size) => {
            const on = draft.packSizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                className={`pack-size-chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  patch({
                    packSizes: on
                      ? draft.packSizes.filter((s) => s !== size)
                      : PACK_SIZE_OPTIONS.filter((s) => s === size || draft.packSizes.includes(s)),
                  })
                }
              >
                {on ? <Check size={12} /> : null} {size}
              </button>
            )
          })}
        </div>
        <p className="form-hint">
          {draft.packSizes.length === 0
            ? 'Nothing selected — the shop uses its defaults for this category.'
            : `Customers can buy: ${draft.packSizes.join(', ')}.`}
        </p>
      </div>

      <div className="variety-block variety-workshop">
        <div className="variety-head">
          <div><span>Variety workshop</span><p className="form-hint">Every variety can have its own price, photo, stock, and shop availability.</p></div>
          <button
            type="button"
            className="button button-light small-button"
            onClick={() => patch({ varieties: [...draft.varieties, newVarietyDraft(draft.perKg)] })}
          >
            <Plus size={13} /> Add variety
          </button>
        </div>
        {draft.varieties.length === 0 ? (
          <p className="form-hint">No varieties yet — every pack size will use the price above.</p>
        ) : (
          draft.varieties.map((v, i) => {
            const varietyPreview = resolveVarietyImage(draft.name, draft.image, v)
            return <article className={`variety-editor ${v.active ? '' : 'is-paused'}`} key={v.id}>
              <input value={v.name} onChange={(e) => setVariety(i, { name: e.target.value })} placeholder="Variety name" />
              <input
                ref={(node) => { varietyFileRefs.current[v.id] = node }}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploadingVarietyId(v.id)
                  const url = await uploadImage(file)
                  setUploadingVarietyId(null)
                  if (url) setVariety(i, { image: url })
                  if (varietyFileRefs.current[v.id]) varietyFileRefs.current[v.id]!.value = ''
                }}
              />
              <button type="button" className="variety-upload" disabled={uploadingVarietyId === v.id} onClick={() => varietyFileRefs.current[v.id]?.click()}>
                {varietyPreview ? <img src={varietyPreview} alt="" /> : <Image size={13} />} {uploadingVarietyId === v.id ? 'Uploading…' : 'Photo'}
              </button>
              <input type="number" min={1} value={v.price} onChange={(e) => setVariety(i, { price: e.target.value })} placeholder="₹ / kg" />
              <input type="number" min={0} step={1} value={v.stock} onChange={(e) => setVariety(i, { stock: e.target.value })} placeholder="Stock" aria-label={`${v.name || 'Variety'} stock`} />
              <button type="button" className={`mini-availability ${v.active ? 'is-on' : ''}`} role="switch" aria-checked={v.active} title={v.active ? 'Available in shop' : 'Hidden from shop'} onClick={() => setVariety(i, { active: !v.active })}>
                <span aria-hidden="true" /> {v.active ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                className="icon-button small destructive-action"
                title="Remove variety"
                onClick={() => patch({ varieties: draft.varieties.filter((_, idx) => idx !== i) })}
              >
                <Trash2 size={14} />
              </button>
            </article>
          })
        )}
      </div>

      <label>
        <span>Description</span>
        <textarea rows={3} value={draft.detail} onChange={(e) => patch({ detail: e.target.value })} placeholder="Short description shown on the product page" />
      </label>

      <label>
        <span>Product image</span>
        <div className="image-field">
          <input value={draft.image} onChange={(e) => patch({ image: e.target.value })} placeholder="/almonds.webp or https://…" />
          <button type="button" className="button button-light small-button" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setUploading(true)
            const url = await uploadImage(file)
            setUploading(false)
            if (url) patch({ image: url })
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        {draft.image ? <img className="image-preview" src={draft.image} alt="Product preview" /> : null}
      </label>

      <div className="form-grid-2">
        <label>
          <span>Stock</span>
          <input type="number" value={draft.stock} onChange={(e) => patch({ stock: e.target.value })} required />
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(e) => patch({ status: e.target.value })}>
            <option>In stock</option>
            <option>Low stock</option>
            <option>Out of stock</option>
          </select>
        </label>
      </div>

      <div className="form-grid-2">
        <label>
          <span>Origin</span>
          <input value={draft.origin} onChange={(e) => patch({ origin: e.target.value })} placeholder="e.g. California, USA" />
        </label>
        <label>
          <span>Nutrients (comma separated)</span>
          <input value={draft.nutrients} onChange={(e) => patch({ nutrients: e.target.value })} placeholder="Vitamin E, Magnesium" />
        </label>
      </div>

      <label>
        <span>Benefits (comma separated)</span>
        <textarea rows={2} maxLength={4000} value={draft.benefits} onChange={(e) => patch({ benefits: e.target.value })} placeholder="Naturally rich in fiber, Source of plant protein" />
      </label>
      <label>
        <span>Ingredients (comma separated)</span>
        <textarea rows={2} maxLength={4000} value={draft.ingredients} onChange={(e) => patch({ ingredients: e.target.value })} placeholder="Almonds" />
      </label>

      <div className="form-grid-2">
        <label>
          <span>SEO title (up to 70 characters)</span>
          <input maxLength={70} value={draft.seoTitle} onChange={(e) => patch({ seoTitle: e.target.value })} />
        </label>
        <label>
          <span>SEO description (up to 320 characters)</span>
          <textarea rows={2} maxLength={320} value={draft.seoDescription} onChange={(e) => patch({ seoDescription: e.target.value })} />
        </label>
      </div>

      <div className="form-grid-2">
        <label>
          <span>Rating (0–5)</span>
          <input type="number" min={0} max={5} step="0.1" value={draft.rating} onChange={(e) => patch({ rating: e.target.value })} placeholder="4.9" />
        </label>
        <label>
          <span>Review count</span>
          <input type="number" min={0} step={1} value={draft.reviewsCount} onChange={(e) => patch({ reviewsCount: e.target.value })} placeholder="128" />
        </label>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={draft.active} onChange={(e) => patch({ active: e.target.checked })} />
        <span>Show this product in the shop</span>
      </label>
    </>
  )
}

