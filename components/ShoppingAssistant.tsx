'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowRight, Check, ChevronDown, Gift, History, MessageCircle, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, X } from 'lucide-react'
import { assistantRequestHeaders, assistantRouteAllowed, assistantSettings, createAssistantRequestScope, isCurrentOrderRequest, isPersistableAssistantMessage, requestAssistantCartAdd } from '@/lib/shopping-assistant-client'
import { classifyLocalChat } from '@/lib/shopping-assistant-chat'
import { supabase } from '@/lib/supabase'

type Intent = 'recommend' | 'gift' | 'offers' | 'compare'
type Language = 'en' | 'ta' | 'tanglish'
type Product = {
  id: number
  name: string
  type: string
  image: string
  price: number
  status?: string
  stock?: number
  packSizes: string[]
  varieties: Array<{ name: string; price: number; stock?: number; active?: boolean }>
}
type ServerProduct = {
  id: number
  name: string
  category: string
  image: string
  price: number
  weight: string
  variety: string
}
type Message = {
  id: string
  role: 'assistant' | 'customer'
  text: string
  createdAt: string
  products?: ServerProduct[]
  offers?: PublicOffer[]
  source?: 'ai' | 'fallback'
  pending?: boolean
  transient?: boolean
}
type PublicOffer = {
  id: string
  title: string
  description: string
  code: string
  expiresAt: string
  discountType: string
  discountValue: number | null
  minimumPurchase: number | null
  firstOrderOnly: boolean
  newCustomersOnly: boolean
  existingCustomersOnly: boolean
}
type PublicFaq = { id: string | number; question: string; answer: string }
type Conversation = { id: string; updatedAt: string; messages: Message[] }

const STORAGE_KEY = 'ajr-shopping-assistant:v1'
const ALLOWED_PACKS = ['25 g', '50 g', '100 g', '250 g', '500 g', '1 kg']
const CURRENCY = (amount: number) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const makeId = () => globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16)
  })
const localTimestamp = () => new Date().toISOString()
const readAccessToken = () => {
  try { return window.localStorage.getItem('ajr-access-token') || '' } catch { return '' }
}
const historyMessages = (items: unknown): Message[] => Array.isArray(items)
  ? items.filter(isPersistableAssistantMessage)
    .map((message: any) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : localTimestamp(),
      ...(message.source === 'ai' || message.source === 'fallback' ? { source: message.source } : {}),
    }))
  : []

const mapProduct = (row: any): Product | null => {
  const id = Number(row?.id)
  const name = String(row?.name ?? '').trim()
  if (!Number.isSafeInteger(id) || id < 1 || !name) return null
  const rawPacks = Array.isArray(row?.pack_sizes) ? row.pack_sizes : Array.isArray(row?.packSizes) ? row.packSizes : []
  const packSizes = ALLOWED_PACKS.filter((pack) => rawPacks.map((value: unknown) => String(value).trim()).includes(pack))
  const rawVarieties = Array.isArray(row?.varieties) ? row.varieties : []
  const varieties = rawVarieties.map((item: any) => ({
    name: String(item?.name ?? '').trim(),
    price: Number(item?.price ?? 0),
    stock: item?.stock == null ? undefined : Number(item.stock),
    active: item?.active !== false,
  })).filter((item: Product['varieties'][number]) => item.name && Number.isFinite(item.price) && item.price > 0)
  return {
    id,
    name,
    type: String(row?.type || row?.category || 'Product'),
    image: String(row?.image || '/nut-selection.png'),
    price: Number(row?.price ?? 0),
    status: String(row?.status || ''),
    stock: Number.isFinite(Number(row?.stock)) ? Number(row.stock) : undefined,
    packSizes,
    varieties,
  }
}

const words: Record<Language, Record<string, string>> = {
  en: {
    title: 'The AJR guide', subtitle: 'A little help for a thoughtful choice.',
    greeting: 'Hello! I can help you explore AJR’s public catalogue.',
    privacy: 'Private by design', disclosure: 'Typed messages and search stay on this device and typed messages are not saved to history. Some guides send only a fixed action, language, optional budget, selected product IDs and a random conversation ID to our server. Gemini uses public catalogue names and categories only; no free-text or order details are sent.',
    recommend: 'Find my match', gift: 'Gift guide', offers: 'Explore offers', compare: 'Compare products',
    budget: 'Budget (₹)', search: 'Search the catalogue on this device', searchPlaceholder: 'Try almonds, dates, spices…',
    results: 'Catalogue matches', noResults: 'No matching products found in the public catalogue.',
    compareHint: 'Select two products from local search to compare.', runCompare: 'Compare selected',
    empty: 'Choose a guide above, or search the catalogue locally.', localOnly: 'Local-only search',
    view: 'View product', choose: 'Choose options', pack: 'Pack size', variety: 'Variety',
    review: 'Review add', confirm: 'Confirm and add', cancel: 'Cancel', added: 'Added to your existing cart.',
    thinking: 'Finding a thoughtful match…', unavailable: 'The shopping guide is temporarily unavailable. Please try again or talk to our team.',
    orders: 'My orders', orderSignin: 'Sign in to see your orders. Order details are never shared with Gemini.',
    noOffers: 'There are no public offers available right now.',
    orderLoading: 'Loading your account orders…', noOrders: 'No orders were returned for your account.',
    orderError: 'We could not load your orders. Please contact our team for help.',
    human: 'Talk to AJR', new: 'New conversation', history: 'Recent conversations',
    quickAnswers: 'Quick answers',
    close: 'Close assistant', minimize: 'Minimize assistant', open: 'Open shopping assistant',
    language: 'Response language', unread: 'New assistant reply', sourceAI: 'AI-assisted', sourceFallback: 'Catalogue guide',
    selectPrompt: 'Please choose at least two products from local search first.', orderDate: 'Placed',
    signIn: 'Sign in', emptySearch: 'Search is local to this device; it is not sent to Gemini.',
    chatLabel: 'Ask a question locally', chatPlaceholder: 'Ask about shopping or the site…', send: 'Send',
    chatNote: 'Messages stay on this device and are not saved in history.',
    chatGreeting: 'Hello! I can help with published FAQs and products. What would you like to know?',
    chatThanks: 'You’re welcome!',
    chatProducts: 'Here are matching products from the public catalogue. Open a product for current details.',
    chatOrders: 'Use My orders below to view your account orders after signing in.',
    chatSupport: 'Use Talk to AJR below to contact the team.',
    chatCatalog: 'Use the catalogue search below or choose Find my match to explore products.',
    chatCompare: 'Search the catalogue, select two products, then choose Compare selected.',
    chatUnknown: 'I can only match some questions locally, so I don’t know the answer. Please use Talk to AJR below for help.',
  },
  ta: {
    title: 'AJR வழிகாட்டி', subtitle: 'சரியான தேர்வுக்கு சிறிய உதவி.',
    greeting: 'வணக்கம்! AJR தயாரிப்பு பட்டியலை ஆராய உதவுகிறேன்.',
    privacy: 'தனியுரிமை முதன்மை', disclosure: 'செய்திகளும் தேடலும் இந்தச் சாதனத்தில் மட்டும் இருக்கும்; தட்டச்சு செய்த செய்திகள் வரலாற்றில் சேமிக்கப்படாது. சில வழிகாட்டிகள் நிலையான செயல், மொழி, விருப்ப பட்ஜெட், தயாரிப்பு எண்கள் மற்றும் சீரற்ற உரையாடல் எண்ணை மட்டும் நம் சேவையகத்திற்கு அனுப்பும். செய்திகள் அல்லது ஆர்டர் விவரங்கள் Gemini-க்கு அனுப்பப்படாது.',
    recommend: 'எனக்கான தேர்வு', gift: 'பரிசு வழிகாட்டி', offers: 'சலுகைகள்', compare: 'தயாரிப்புகளை ஒப்பிடு',
    budget: 'பட்ஜெட் (₹)', search: 'இந்த சாதனத்தில் பட்டியலைத் தேடு', searchPlaceholder: 'பாதாம், பேரீச்சம்…',
    results: 'பட்டியல் முடிவுகள்', noResults: 'பொது பட்டியலில் பொருத்தமான தயாரிப்பு இல்லை.',
    compareHint: 'உள்ளூர்த் தேடலில் இருந்து இரண்டு தயாரிப்புகளைத் தேர்ந்தெடுக்கவும்.', runCompare: 'தேர்ந்தவற்றை ஒப்பிடு',
    empty: 'மேலே ஒரு வழிகாட்டியைத் தேர்ந்தெடுக்கவும் அல்லது பட்டியலை உள்ளூரில் தேடவும்.', localOnly: 'இந்த சாதனத்தில் மட்டும் தேடல்',
    view: 'தயாரிப்பைப் பார்', choose: 'விருப்பங்களைத் தேர்வு', pack: 'பொதி அளவு', variety: 'வகை',
    review: 'சேர்ப்பதைப் பார்', confirm: 'உறுதிசெய்து சேர்', cancel: 'ரத்து', added: 'உங்கள் தற்போதைய கார்ட்டில் சேர்க்கப்பட்டது.',
    thinking: 'சரியான தேர்வைத் தேடுகிறது…', unavailable: 'வழிகாட்டி தற்காலிகமாக கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது எங்கள் குழுவை அணுகவும்.',
    orders: 'என் ஆர்டர்கள்', orderSignin: 'உங்கள் ஆர்டர்களைப் பார்க்க உள்நுழையவும். ஆர்டர் விவரங்கள் Gemini-க்கு பகிரப்படாது.',
    noOffers: 'தற்போது பொது சலுகைகள் இல்லை.',
    orderLoading: 'உங்கள் கணக்கு ஆர்டர்கள் ஏற்றப்படுகின்றன…', noOrders: 'உங்கள் கணக்கில் ஆர்டர் இல்லை.',
    orderError: 'ஆர்டர்களை ஏற்ற முடியவில்லை. உதவிக்கு எங்கள் குழுவை அணுகவும்.',
    human: 'AJR-ஐ அணுகு', new: 'புதிய உரையாடல்', history: 'சமீப உரையாடல்கள்',
    quickAnswers: 'விரைவு பதில்கள்',
    close: 'உதவியாளரை மூடு', minimize: 'குறைத்துக் காட்டு', open: 'ஷாப்பிங் உதவியாளரைத் திற',
    language: 'பதில் மொழி', unread: 'புதிய உதவியாளர் பதில்', sourceAI: 'AI உதவி', sourceFallback: 'பட்டியல் வழிகாட்டி',
    selectPrompt: 'முதலில் உள்ளூர்த் தேடலில் இருந்து இரண்டு தயாரிப்புகளைத் தேர்ந்தெடுக்கவும்.', orderDate: 'தேதி',
    signIn: 'உள்நுழை', emptySearch: 'தேடல் இந்த சாதனத்தில் மட்டும்; Gemini-க்கு அனுப்பப்படாது.',
    chatLabel: 'உள்ளூரில் கேள்வி கேளுங்கள்', chatPlaceholder: 'தயாரிப்பு அல்லது தளத்தைப் பற்றி கேளுங்கள்…', send: 'அனுப்பு',
    chatNote: 'செய்திகள் இந்தச் சாதனத்தில் மட்டும்; வரலாற்றில் சேமிக்கப்படாது.',
    chatGreeting: 'வணக்கம்! வெளியிடப்பட்ட கேள்விகள் மற்றும் தயாரிப்புகளுடன் உதவுகிறேன். என்ன தெரிந்துகொள்ள விரும்புகிறீர்கள்?',
    chatThanks: 'மகிழ்ச்சி!',
    chatProducts: 'பொது பட்டியலில் பொருத்தமான தயாரிப்புகள் இங்கே. தற்போதைய விவரங்களுக்கு தயாரிப்பைத் திறக்கவும்.',
    chatOrders: 'உள்நுழைந்த பின் உங்கள் ஆர்டர்களைப் பார்க்க கீழே உள்ள என் ஆர்டர்கள் பொத்தானைப் பயன்படுத்தவும்.',
    chatSupport: 'குழுவைத் தொடர்புகொள்ள கீழே உள்ள AJR-ஐ அணுகு பொத்தானைப் பயன்படுத்தவும்.',
    chatCatalog: 'தயாரிப்புகளைப் பார்க்க கீழே உள்ள தேடல் அல்லது எனக்கான தேர்வைப் பயன்படுத்தவும்.',
    chatCompare: 'பட்டியலில் தேடி இரண்டு தயாரிப்புகளைத் தேர்ந்தெடுத்து ஒப்பிடவும்.',
    chatUnknown: 'சில கேள்விகளுக்கு மட்டுமே உள்ளூரில் பதிலளிக்க முடியும்; இதற்கான பதில் தெரியவில்லை. உதவிக்கு கீழே உள்ள AJR-ஐ அணுகவும்.',
  },
  tanglish: {
    title: 'AJR guide', subtitle: 'Nalla choice edukka konjam help.',
    greeting: 'Vanakkam! AJR public catalogue-la explore panna help panren.',
    privacy: 'Privacy first', disclosure: 'Typed messages and search indha device-la mattum irukkum; typed messages history-la save aagadhu. Sila guides fixed action, language, optional budget, product IDs, random conversation ID mattum namma server-kku anuppum. Free-text or order details Gemini-kku anuppa maatom.',
    recommend: 'Enakku match', gift: 'Gift guide', offers: 'Offers paaru', compare: 'Compare products',
    budget: 'Budget (₹)', search: 'Indha device-la catalogue search', searchPlaceholder: 'Almonds, dates…',
    results: 'Catalogue results', noResults: 'Public catalogue-la match kidaikkala.',
    compareHint: 'Local search-la irundhu rendu products select pannunga.', runCompare: 'Selected compare',
    empty: 'Mela oru guide select pannunga, illa catalogue local-a search pannunga.', localOnly: 'Local-only search',
    view: 'Product paaru', choose: 'Options choose', pack: 'Pack size', variety: 'Variety',
    review: 'Add review', confirm: 'Confirm panni add', cancel: 'Cancel', added: 'Existing cart-la add panniyachu.',
    thinking: 'Nalla match thedudhu…', unavailable: 'Shopping guide ippo available illa. Konjam neram kazhichu try pannunga, illa team-a contact pannunga.',
    orders: 'En orders', orderSignin: 'Orders paakka sign in pannunga. Order details Gemini-kku share aagadhu.',
    noOffers: 'Ippo public offers available illa.',
    orderLoading: 'Ungal account orders load aagudhu…', noOrders: 'Ungal account-la orders illa.',
    orderError: 'Orders load aagala. Help-ku team-a contact pannunga.',
    human: 'AJR team-kitta pesu', new: 'Pudhu conversation', history: 'Recent conversations',
    quickAnswers: 'Quick answers',
    close: 'Assistant close', minimize: 'Assistant minimize', open: 'Shopping assistant open',
    language: 'Reply language', unread: 'Pudhu assistant reply', sourceAI: 'AI-assisted', sourceFallback: 'Catalogue guide',
    selectPrompt: 'Mudhal-la local search-la irundhu rendu products select pannunga.', orderDate: 'Date',
    signIn: 'Sign in', emptySearch: 'Search indha device-la mattum; Gemini-kku anuppa maatom.',
    chatLabel: 'Local-a kelvi kelunga', chatPlaceholder: 'Shopping or site pathi kelunga…', send: 'Send',
    chatNote: 'Messages indha device-la mattum; history-la save aagadhu.',
    chatGreeting: 'Vanakkam! Published FAQs and products pathi help panren. Enna therinjukkanum?',
    chatThanks: 'Sandhosham!',
    chatProducts: 'Public catalogue-la match aana products inge irukku. Current details-kku product-a open pannunga.',
    chatOrders: 'Sign in pannitu keezhe My orders use panni orders paarunga.',
    chatSupport: 'Team-a contact panna keezhe Talk to AJR use pannunga.',
    chatCatalog: 'Products paakka keezhe catalogue search illa Enakku match use pannunga.',
    chatCompare: 'Catalogue-la search panni rendu products select panni compare pannunga.',
    chatUnknown: 'Sila questions-ku mattum local-a answer panna mudiyum; idhuku enakku answer theriyala. Help-ku keezhe Talk to AJR use pannunga.',
  },
}

function ProductCard({
  product,
  language,
  onView,
  onReview,
  pending,
  onConfirm,
  onCancel,
  added,
  canAdd,
  adding,
  addError,
}: {
  product: ServerProduct
  language: Language
  onView: () => void
  onReview: () => void
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
  added: boolean
  canAdd: boolean
  adding: boolean
  addError: string
}) {
  const t = words[language]
  return (
    <article className="ajr-assistant-product">
      <img src={product.image} alt="" loading="lazy" />
      <div className="ajr-assistant-product-copy">
        <p className="ajr-assistant-product-type">{product.category}</p>
        <h3>{product.name}</h3>
        <p className="ajr-assistant-product-price">{CURRENCY(product.price)} <span>/ {product.weight}</span></p>
        {product.variety && <p className="ajr-assistant-product-variant">{product.variety}</p>}
        {pending ? (
          <div className="ajr-assistant-confirm">
            <p>{product.name} · {product.weight}{product.variety ? ` · ${product.variety}` : ''} · {CURRENCY(product.price)}</p>
            <button type="button" className="ajr-assistant-primary" onClick={onConfirm} disabled={adding}><Check size={15} />{t.confirm}</button>
            <button type="button" className="ajr-assistant-text-button" onClick={onCancel} disabled={adding}>{t.cancel}</button>
            {addError && <p role="alert">{addError}</p>}
          </div>
        ) : added ? (
          <p className="ajr-assistant-added" role="status"><Check size={14} />{t.added}</p>
        ) : (
          <div className="ajr-assistant-product-actions">
            <button type="button" className="ajr-assistant-text-button" onClick={onView}>{t.view} <ArrowRight size={14} /></button>
            {canAdd && <button type="button" className="ajr-assistant-primary" onClick={onReview}><ShoppingBag size={14} />{t.review}</button>}
          </div>
        )}
      </div>
    </article>
  )
}

export default function ShoppingAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [unread, setUnread] = useState(false)
  const [storeView, setStoreView] = useState('home')
  const [language, setLanguage] = useState<Language>('en')
  const [budgetText, setBudgetText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [chatText, setChatText] = useState('')
  const [chatProductIds, setChatProductIds] = useState<number[]>([])
  const [catalog, setCatalog] = useState<Product[]>([])
  const [faqs, setFaqs] = useState<PublicFaq[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [orders, setOrders] = useState<any[] | null>(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderError, setOrderError] = useState(false)
  const [pendingProduct, setPendingProduct] = useState<number | null>(null)
  const [addedProduct, setAddedProduct] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settings, setSettings] = useState({ enabled: false, welcome: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const addingRef = useRef(false)
  const orderScope = useRef(createAssistantRequestScope())
  const intentScope = useRef(createAssistantRequestScope())
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastMessageCount = useRef(0)
  const t = words[language]
  const customerRoute = assistantRouteAllowed(pathname || '')
  const visibleForStore = settings.enabled && customerRoute && (pathname !== '/' || (storeView !== 'cart' && storeView !== 'orders'))

  const makeGreeting = useCallback((lang: Language): Message => ({
    id: makeId(),
    role: 'assistant',
    text: words[lang].greeting,
    createdAt: localTimestamp(),
  }), [])

  useEffect(() => {
    let active = true
    setSettings({ enabled: false, welcome: '' })
    if (!customerRoute) return () => { active = false }
    fetch('/api/ai-assistant', { cache: 'no-store' })
      .then(async (response) => response.ok ? assistantSettings(await response.json()) : { enabled: false, welcome: '' })
      .then((value) => { if (active) setSettings(value) })
      .catch(() => { if (active) setSettings({ enabled: false, welcome: '' }) })
    return () => { active = false }
  }, [pathname, customerRoute])

  useEffect(() => {
    if (!settings.enabled || !customerRoute) return
    let active = true
    fetch('/api/products', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Public catalogue unavailable')
        const data = await response.json()
        return Array.isArray(data.products) ? data.products.map(mapProduct).filter(Boolean) as Product[] : []
      })
      .then((products) => { if (active) setCatalog(products) })
      .catch(() => { if (active) setCatalogError(true) })
      .finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [settings.enabled, customerRoute])

  useEffect(() => {
    if (!settings.enabled || !customerRoute) return
    let active = true
    fetch('/api/ai-assistant/faqs')
      .then(async (response) => {
        if (!response.ok) throw new Error('Public FAQs unavailable')
        const data = await response.json()
        return Array.isArray(data.faqs)
          ? data.faqs.filter((faq: any) => faq && (typeof faq.id === 'number' || typeof faq.id === 'string') &&
            typeof faq.question === 'string' && faq.question.trim() &&
            typeof faq.answer === 'string' && faq.answer.trim())
            .map((faq: any) => ({ id: faq.id, question: faq.question.trim(), answer: faq.answer.trim() }))
          : []
      })
      .then((items) => { if (active) setFaqs(items) })
      .catch(() => { if (active) setFaqs([]) })
    return () => { active = false }
  }, [settings.enabled, customerRoute])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
      const savedConversations = Array.isArray(saved?.conversations)
        ? saved.conversations.filter((item: any) => item && typeof item.id === 'string' && Array.isArray(item.messages))
          .slice(0, 8)
          .map((item: any) => ({ id: item.id, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : localTimestamp(), messages: historyMessages(item.messages) }))
        : []
      const current = savedConversations.find((item: Conversation) => item.id === saved?.currentId)
      const id = current?.id || makeId()
      setConversations(savedConversations)
      setConversationId(id)
      setMessages(current?.messages || [makeGreeting('en')])
    } catch {
      const id = makeId()
      setConversationId(id)
      setMessages([makeGreeting('en')])
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || !conversationId) return
    const updated = { id: conversationId, updatedAt: localTimestamp(), messages: historyMessages(messages) }
    const next = [updated, ...conversations.filter((item) => item.id !== conversationId)].slice(0, 8)
    setConversations(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentId: conversationId, conversations: next }))
    } catch {}
  // Persist only when the current conversation changes; conversations are derived from it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages, hydrated])

  useEffect(() => {
    const onStoreView = (event: Event) => {
      const custom = event as CustomEvent<{ view?: string }>
      const next = String(custom.detail?.view || 'home')
      setStoreView(next)
      if (next === 'cart' || next === 'orders') setOpen(false)
    }
    window.addEventListener('ajr-store-view-change', onStoreView)
    return () => window.removeEventListener('ajr-store-view-change', onStoreView)
  }, [])

  useEffect(() => {
    const clearOrders = () => {
      orderScope.current.invalidate()
      setOrders(null)
      setOrderError(false)
      setOrderBusy(false)
      setChatText('')
      setChatProductIds([])
      setMessages((current) => current.filter((message) => !message.transient))
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => clearOrders())
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'ajr-access-token') clearOrders()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('storage', onStorage)
      orderScope.current.invalidate()
      intentScope.current.invalidate()
    }
  }, [])

  useEffect(() => {
    if (!open || minimized) return
    const node = panelRef.current
    if (!node) return
    const focusable = node.querySelector<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')
    focusable?.focus()
  }, [open, minimized])

  useEffect(() => {
    if (!open || minimized || (messages.length <= 1 && !searchText.trim() && !pendingProduct && !orders && !orderBusy && !orderError)) return
    const body = bodyRef.current
    if (!body) return
    const panel = panelRef.current
    const scroller = getComputedStyle(body).overflowY === 'visible' && panel ? panel : body
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [open, minimized, messages, searchText, pendingProduct, catalogLoading, orders, orderBusy, orderError])

  useEffect(() => {
    if (!open && messages.length > lastMessageCount.current) setUnread(true)
    lastMessageCount.current = messages.length
  }, [messages, open])

  useEffect(() => {
    if (!open || minimized) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setMinimized(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, minimized])

  const appendMessage = (message: Message) => setMessages((current) => [...current, message])
  const productById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog])
  const filteredCatalog = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase()
    if (!query) return catalog.filter((product) => chatProductIds.includes(product.id))
    return catalog.filter((product) => `${product.name} ${product.type}`.toLocaleLowerCase().includes(query)).slice(0, 8)
  }, [catalog, searchText, chatProductIds])
  const recommendations = useMemo(() => {
    return messages[messages.length - 1]?.products || []
  }, [messages])
  const latestMessage = messages[messages.length - 1]

  const sendIntent = async (intent: Intent, productIds?: number[], fromChat = false) => {
    if (busy) return
    if (intent === 'compare' && (!productIds || productIds.length < 2)) {
      appendMessage({ id: makeId(), role: 'assistant', text: t.selectPrompt, createdAt: localTimestamp(), transient: fromChat })
      return
    }
    const budget = budgetText.trim() ? Number(budgetText) : undefined
    if (budgetText.trim() && (!Number.isFinite(budget) || Number(budget) <= 0)) {
      appendMessage({ id: makeId(), role: 'assistant', text: 'Enter a valid budget greater than zero, or leave it blank.', createdAt: localTimestamp(), transient: fromChat })
      return
    }
    setBusy(true)
    const request = intentScope.current.begin()
    const placeholderId = makeId()
    orderScope.current.invalidate()
    setOrderBusy(false)
    setOrderError(false)
    setOrders(null)
    setSearchText('')
    setChatProductIds([])
    const customerLabel = intent === 'recommend' ? t.recommend : intent === 'gift' ? t.gift : intent === 'offers' ? t.offers : t.compare
    if (!fromChat) appendMessage({ id: makeId(), role: 'customer', text: customerLabel, createdAt: localTimestamp() })
    appendMessage({ id: placeholderId, role: 'assistant', text: t.thinking, createdAt: localTimestamp(), pending: true, transient: fromChat })
    try {
      const body: { intent: Intent; language: Language; budget?: number; productIds?: number[]; conversationId: string } = {
        intent,
        language,
        conversationId,
      }
      if (budget !== undefined) body.budget = budget
      if (intent === 'compare') body.productIds = productIds
      const token = readAccessToken()
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: assistantRequestHeaders(token),
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) throw new Error('Your session has expired. Please sign in again to continue.')
      if (!response.ok) throw new Error(data?.message || t.unavailable)
      const returnedProducts: ServerProduct[] = Array.isArray(data.products)
        ? data.products.flatMap((item: any) => {
            const id = Number(item?.id)
            const name = String(item?.name ?? '').trim()
            const price = Number(item?.price)
            const weight = String(item?.weight ?? '')
            if (!Number.isSafeInteger(id) || !productById.has(id) || !name || !Number.isFinite(price) || !ALLOWED_PACKS.includes(weight)) return []
            return [{
              id,
              name,
              category: String(item?.category ?? ''),
              image: String(item?.image ?? ''),
              price,
              weight,
              variety: String(item?.variety ?? ''),
            }]
          })
        : []
      const offers: PublicOffer[] = intent === 'offers' && Array.isArray(data.offers)
        ? data.offers.map((offer: any, index: number) => ({
            id: String(offer?.id ?? offer?.code ?? index),
            title: String(offer?.title ?? offer?.name ?? offer?.offer_name ?? ''),
            description: String(offer?.description ?? offer?.summary ?? ''),
            code: String(offer?.code ?? ''),
            expiresAt: String(offer?.expires_at ?? offer?.valid_until ?? ''),
            discountType: String(offer?.discount_type ?? ''),
            discountValue: typeof offer?.discount_value === 'number' && Number.isFinite(offer.discount_value) ? offer.discount_value : null,
            minimumPurchase: typeof offer?.minimum_purchase === 'number' && Number.isFinite(offer.minimum_purchase) ? offer.minimum_purchase : null,
            firstOrderOnly: offer?.first_order_only === true,
            newCustomersOnly: offer?.new_customers_only === true,
            existingCustomersOnly: offer?.existing_customers_only === true,
          })).filter((offer: PublicOffer) => offer.title || offer.description || offer.code)
        : []
      const responseMessage = intent === 'offers' && offers.length === 0
        ? t.noOffers
        : typeof data.message === 'string' && data.message.trim() ? data.message.trim() : t.unavailable
      setMessages((current) => intentScope.current.isCurrent(request) ? current.map((message) =>
        message.id === placeholderId ? {
          id: makeId(),
          role: 'assistant',
          text: responseMessage,
          createdAt: localTimestamp(),
          products: returnedProducts,
          offers,
          source: data.source === 'fallback' ? 'fallback' : 'ai',
          transient: fromChat,
        } : message
      ) : current)
    } catch (error: any) {
      setMessages((current) => intentScope.current.isCurrent(request) ? current.map((message) =>
        message.id === placeholderId
          ? { id: makeId(), role: 'assistant', text: error?.message || t.unavailable, createdAt: localTimestamp(), source: 'fallback', transient: fromChat }
          : message
      ) : current)
    } finally {
      if (intentScope.current.isCurrent(request)) {
        setBusy(false)
        setSelectedIds([])
      }
    }
  }

  const fetchOrders = async () => {
    if (orderBusy) return
    const token = readAccessToken()
    if (!token) {
      setOrders([])
      appendMessage({ id: makeId(), role: 'assistant', text: t.orderSignin, createdAt: localTimestamp() })
      return
    }
    setOrderBusy(true)
    const request = orderScope.current.begin()
    const isCurrent = () => isCurrentOrderRequest(orderScope.current, request, token, readAccessToken)
    setOrderError(false)
    setOrders(null)
    try {
      const response = await fetch('/api/my/orders', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error('Could not load orders')
      setOrders((current) => isCurrent() ? (Array.isArray(data.orders) ? data.orders : []) : current)
    } catch {
      setOrderError((current) => isCurrent() ? true : current)
    } finally {
      if (orderScope.current.isCurrent(request)) {
        if (!isCurrent()) {
          orderScope.current.invalidate()
          setOrders(null)
          setOrderError(false)
        }
        setOrderBusy(false)
      }
    }
  }

  const startNewConversation = () => {
    const id = makeId()
    intentScope.current.invalidate()
    orderScope.current.invalidate()
    setBusy(false)
    setOrderBusy(false)
    setOrderError(false)
    setConversationId(id)
    setMessages([makeGreeting(language)])
    setOrders(null)
    setSearchText('')
    setChatText('')
    setChatProductIds([])
    setSelectedIds([])
    setPendingProduct(null)
    setAddedProduct(null)
    setHistoryOpen(false)
  }

  const openConversation = (conversation: Conversation) => {
    intentScope.current.invalidate()
    orderScope.current.invalidate()
    setBusy(false)
    setOrderBusy(false)
    setOrderError(false)
    setOrders(null)
    setConversationId(conversation.id)
    setMessages(conversation.messages)
    setChatText('')
    setChatProductIds([])
    setSearchText('')
    setSelectedIds([])
    setHistoryOpen(false)
  }
  const answerFaq = (faq: PublicFaq) => {
    appendMessage({ id: makeId(), role: 'customer', text: faq.question, createdAt: localTimestamp() })
    appendMessage({ id: makeId(), role: 'assistant', text: faq.answer, createdAt: localTimestamp(), source: 'fallback' })
  }

  const sendChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = chatText.trim()
    if (!text || busy) return
    const result = classifyLocalChat(text, faqs, catalog)
    setChatText('')
    setSearchText('')
    setChatProductIds([])
    setSelectedIds([])
    setPendingProduct(null)
    orderScope.current.invalidate()
    setOrders(null)
    setOrderBusy(false)
    setOrderError(false)
    appendMessage({ id: makeId(), role: 'customer', text, createdAt: localTimestamp(), transient: true })
    if (result.kind === 'intent') {
      void sendIntent(result.intent, undefined, true)
      return
    }
    if (result.kind === 'products') setChatProductIds(result.productIds)
    const reply = result.kind === 'faq' ? result.answer
      : result.kind === 'greeting' ? t.chatGreeting
      : result.kind === 'thanks' ? t.chatThanks
      : result.kind === 'products' ? t.chatProducts
      : result.kind === 'orders' ? t.chatOrders
      : result.kind === 'support' ? t.chatSupport
      : result.kind === 'catalog' ? t.chatCatalog
      : result.kind === 'compare' ? t.chatCompare
      : t.chatUnknown
    appendMessage({ id: makeId(), role: 'assistant', text: reply, createdAt: localTimestamp(), transient: true })
  }

  const openProduct = (productId: number) => {
    if (pathname === '/') window.dispatchEvent(new CustomEvent('ajr-assistant-view-product', { detail: { productId } }))
    else window.location.assign(`/?product=${encodeURIComponent(productId)}`)
    setOpen(false)
    setMinimized(false)
  }
  const confirmAdd = async (product: ServerProduct) => {
    if (addingRef.current || pathname !== '/') return
    addingRef.current = true
    setAdding(true)
    setAddError('')
    const result = await requestAssistantCartAdd(window, { productId: product.id, pack: product.weight, variety: product.variety, price: product.price })
    addingRef.current = false
    setAdding(false)
    if (!result.ok) {
      setAddError(result.message)
      return
    }
    setPendingProduct(null)
    setAddedProduct(product.id)
    window.setTimeout(() => setAddedProduct((current) => current === product.id ? null : current), 4500)
  }
  const toggleProduct = (productId: number) => setSelectedIds((current) =>
    current.includes(productId) ? current.filter((id) => id !== productId) : current.length < 2 ? [...current, productId] : [current[1], productId]
  )

  if (!visibleForStore) return null

  return (
    <div className="ajr-assistant-root">
      {!open && (
        <button
          type="button"
          className="ajr-assistant-launcher"
          aria-label={t.open}
          aria-haspopup="dialog"
          aria-expanded={false}
          onClick={() => { setOpen(true); setMinimized(false); setUnread(false) }}
        >
          <span className="ajr-assistant-launcher-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span className="ajr-assistant-launcher-label">{t.title}</span>
          {unread && <span className="ajr-assistant-unread" aria-label={t.unread} />}
        </button>
      )}
      {open && (
        <section
          ref={panelRef}
          className={`ajr-assistant-panel${minimized ? ' is-minimized' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="ajr-assistant-title"
        >
          <header className="ajr-assistant-header">
            <div className="ajr-assistant-brand">
              <img src="/ajr-logo.png" alt="" />
              <div><p>AJR · CUSTOMER CARE</p><h2 id="ajr-assistant-title">{t.title}</h2></div>
            </div>
            <div className="ajr-assistant-head-actions">
              <button type="button" aria-label={t.new} title={t.new} onClick={startNewConversation}><Plus size={17} /></button>
              <button type="button" aria-label={minimized ? 'Expand assistant' : t.minimize} title={minimized ? 'Expand' : t.minimize} onClick={() => setMinimized((value) => !value)}>
                {minimized ? <ChevronDown size={17} /> : <Minus size={17} />}
              </button>
              <button type="button" aria-label={t.close} title={t.close} onClick={() => { setOpen(false); setMinimized(false) }}><X size={18} /></button>
            </div>
          </header>
          {!minimized && (
            <>
              <div className="ajr-assistant-toolbar">
                <label><span>{t.language}</span>
                  <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                    <option value="en">English</option><option value="ta">தமிழ்</option><option value="tanglish">Tanglish</option>
                  </select>
                </label>
                <button type="button" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}><History size={15} />{t.history}</button>
              </div>
              {historyOpen && (
                <div className="ajr-assistant-history" aria-label={t.history}>
                  {conversations.length > 0 ? conversations.filter((item) => item.id !== conversationId).map((item) => (
                    <button type="button" key={item.id} onClick={() => openConversation(item)}>
                      <span>{item.messages.find((message) => message.role === 'customer')?.text || words[language].greeting}</span>
                      <time>{new Date(item.updatedAt).toLocaleDateString()}</time>
                    </button>
                  )) : <p>{t.empty}</p>}
                </div>
              )}
              <div ref={bodyRef} className="ajr-assistant-body" aria-live="polite">
                <div className="ajr-assistant-privacy">
                  <ShieldCheck size={17} aria-hidden="true" />
                  <div><strong>{t.privacy}</strong><p>{t.disclosure}</p></div>
                </div>
                {settings.welcome && <p className="ajr-assistant-welcome">{settings.welcome}</p>}
                {faqs.length > 0 && (
                  <details className="ajr-assistant-faqs">
                    <summary>{t.quickAnswers}<ChevronDown size={14} aria-hidden="true" /></summary>
                    <div>
                      {faqs.map((faq) => (
                        <button type="button" key={faq.id} onClick={() => answerFaq(faq)}>{faq.question}</button>
                      ))}
                    </div>
                  </details>
                )}
                {messages.map((message) => (
                  <div className={`ajr-assistant-message is-${message.role}`} key={message.id}>
                    <p>{message.text}</p>
                    <div className="ajr-assistant-message-meta">
                      <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(language === 'ta' ? 'ta-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' })}</time>
                      {message.source && <span>{message.source === 'fallback' ? t.sourceFallback : t.sourceAI}</span>}
                    </div>
                  </div>
                ))}
                {latestMessage?.offers && latestMessage.offers.length > 0 && (
                  <div className="ajr-assistant-offers" aria-label={t.offers}>
                    {latestMessage.offers.map((offer) => (
                      <article className="ajr-assistant-offer" key={offer.id}>
                        {offer.title && <h3>{offer.title}</h3>}
                        {offer.description && <p>{offer.description}</p>}
                        {offer.code && <p className="ajr-assistant-offer-code"><span>Offer code</span><strong>{offer.code}</strong></p>}
                        {offer.discountType === 'percentage' && offer.discountValue !== null && <p><span>Discount</span> {offer.discountValue}%</p>}
                        {offer.discountType === 'fixed' && offer.discountValue !== null && <p><span>Discount</span> {CURRENCY(offer.discountValue)}</p>}
                        {offer.discountType === 'free_shipping' && <p><span>Offer</span> Free shipping</p>}
                        {offer.minimumPurchase !== null && offer.minimumPurchase > 0 && <p><span>Minimum purchase</span> {CURRENCY(offer.minimumPurchase)}</p>}
                        {offer.expiresAt && <p><span>Expires</span> {offer.expiresAt}</p>}
                        {(offer.firstOrderOnly || offer.newCustomersOnly || offer.existingCustomersOnly) && (
                          <p className="ajr-assistant-offer-terms">
                            {[offer.firstOrderOnly && 'First order only', offer.newCustomersOnly && 'New customers only', offer.existingCustomersOnly && 'Existing customers only'].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </article>
                    ))}
                    <p className="ajr-assistant-offer-disclaimer">Offer information is public. Eligibility is determined at checkout and is not confirmed here.</p>
                  </div>
                )}
                {recommendations.length > 0 && (
                  <div className="ajr-assistant-products" aria-label={t.results}>
                    {recommendations.map((product) => {
                      return <ProductCard
                        key={`${conversationId}-${product.id}`}
                        product={product}
                        language={language}
                        onView={() => openProduct(product.id)}
                        onReview={() => { setAddError(''); setPendingProduct(product.id) }}
                        pending={pendingProduct === product.id}
                        onConfirm={() => confirmAdd(product)}
                        onCancel={() => setPendingProduct(null)}
                        added={addedProduct === product.id}
                        canAdd={pathname === '/'}
                        adding={adding}
                        addError={addError}
                      />
                    })}
                  </div>
                )}
                {orders && (
                  <div className="ajr-assistant-orders">
                    <strong>{t.orders}</strong>
                    {orders.length ? orders.slice(0, 4).map((order: any, index) => (
                      <div className="ajr-assistant-order" key={String(order?.id || order?.order_number || index)}>
                        <span>#{String(order?.order_number || order?.id || '')}</span>
                        <span>{String(order?.status || '')} · {String(order?.payment_status || '')}</span>
                        <time>{order?.created_at ? new Date(order.created_at).toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-IN') : ''}</time>
                      </div>
                    )) : <p>{t.noOrders}</p>}
                  </div>
                )}
                {orderBusy && <p className="ajr-assistant-inline-status">{t.orderLoading}</p>}
                {orderError && <p className="ajr-assistant-inline-status" role="alert">{t.orderError}</p>}
                {catalogError && <p className="ajr-assistant-inline-status">{t.unavailable}</p>}
                {busy && <p className="ajr-assistant-inline-status"><span className="ajr-assistant-spinner" />{t.thinking}</p>}
                {(searchText.trim() || chatProductIds.length > 0) && (
                  <div className="ajr-assistant-local-results">
                    <div className="ajr-assistant-local-heading"><strong>{t.results}</strong><span>{t.localOnly}</span></div>
                    {catalogLoading ? <p>{t.thinking}</p> : filteredCatalog.length ? filteredCatalog.map((product) => (
                      <div className="ajr-assistant-local-product" key={product.id}>
                        <img src={product.image} alt="" loading="lazy" />
                        <button type="button" onClick={() => openProduct(product.id)}><strong>{product.name}</strong><span>{product.type} · {t.view}</span></button>
                        <label className="ajr-assistant-compare-choice">
                          <input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} aria-label={`Select ${product.name} for compare`} />
                        </label>
                      </div>
                    )) : <p>{t.noResults}</p>}
                    {selectedIds.length > 0 && <button type="button" className="ajr-assistant-primary ajr-assistant-compare-button" onClick={() => sendIntent('compare', selectedIds)} disabled={busy}><Sparkles size={14} />{t.runCompare} ({selectedIds.length}/2)</button>}
                  </div>
                )}
                {catalogLoading && messages.length === 1 && <p className="ajr-assistant-inline-status">{t.thinking}</p>}
                {!busy && messages.length === 1 && !searchText.trim() && <p className="ajr-assistant-empty-hint">{t.empty}</p>}
              </div>
              <div className="ajr-assistant-composer">
                <form className="ajr-assistant-chat-form" onSubmit={sendChat}>
                  <input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={500}
                    placeholder={t.chatPlaceholder} aria-label={t.chatLabel} aria-describedby="ajr-assistant-chat-note" />
                  <button type="submit" disabled={busy || !chatText.trim()}>{t.send}</button>
                </form>
                <p id="ajr-assistant-chat-note" className="ajr-assistant-local-note">{t.chatNote}</p>
                <div className="ajr-assistant-budget">
                  <label htmlFor="ajr-assistant-budget">{t.budget}</label>
                  <span><span aria-hidden="true">₹</span><input id="ajr-assistant-budget" inputMode="numeric" type="number" min="1" value={budgetText} onChange={(event) => setBudgetText(event.target.value)} placeholder="Optional" /></span>
                </div>
                <div className="ajr-assistant-actions">
                  <button type="button" onClick={() => sendIntent('recommend')} disabled={busy}><Sparkles size={15} />{t.recommend}</button>
                  <button type="button" onClick={() => sendIntent('gift')} disabled={busy}><Gift size={15} />{t.gift}</button>
                  <button type="button" onClick={() => sendIntent('offers')} disabled={busy}><ShoppingBag size={15} />{t.offers}</button>
                </div>
                <div className="ajr-assistant-search">
                  <Search size={16} aria-hidden="true" />
                  <input ref={searchRef} value={searchText} onChange={(event) => { setChatProductIds([]); setSearchText(event.target.value) }} placeholder={t.searchPlaceholder} aria-label={t.search} />
                  {searchText && <button type="button" aria-label="Clear local search" onClick={() => setSearchText('')}><X size={15} /></button>}
                </div>
                <p className="ajr-assistant-local-note">{t.emptySearch}</p>
                <div className="ajr-assistant-footer-actions">
                  <button type="button" onClick={fetchOrders} disabled={orderBusy}><Package size={15} aria-hidden="true" />{t.orders}</button>
                  <button type="button" onClick={() => {
                    if (pathname === '/') window.dispatchEvent(new CustomEvent('ajr-store-view-change', { detail: { view: 'contact' } }))
                    else window.location.assign('/?contact=1')
                    setOpen(false)
                  }}><MessageCircle size={15} />{t.human}</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
