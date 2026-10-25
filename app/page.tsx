'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gift,
  Heart,
  Leaf,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  User,
  Zap,
  X,
} from 'lucide-react'
import MyOrders from '@/components/MyOrders'
import { LanguageSwitcher, useLanguage } from '@/components/LanguageProvider'
import NutritionMatch from '@/components/NutritionMatch'
import FarmOrigins from '@/components/FarmOrigins'
import QualityComparison from '@/components/QualityComparison'
import StudioLocation from '@/components/StudioLocation'
import { PACK_SIZE_OPTIONS } from '@/lib/supabase'

const logo = '/ajr-logo.png'

type View = 'home' | 'about' | 'product' | 'contact' | 'cart' | 'wishlist' | 'detail' | 'orders'
type FlightTarget = 'cart' | 'wishlist'
type FlightLaunchResult = 'started' | 'skipped' | 'locked'
type Flight = {
  id: number
  image: string
  x: number
  y: number
  dx: number
  dy: number
  target: FlightTarget
}
export type Variety = { name: string; price: number }

export type Product = {
  id: number
  name: string
  type: string
  price: number
  color: string
  image: string
  // The original catalogue asset remains available when a temporary
  // variety-specific image is applied to a derived selection.
  baseImage?: string
  detail: string
  rating?: number
  reviewsCount?: number
  origin?: string
  nutrients?: string[]
  stock?: number
  status?: string
  selectedWeight?: Weight
  varieties?: Variety[]
  selectedVariety?: string
  // Gram options this product is sold in. Empty = fall back to the category defaults below.
  packSizes?: Weight[]
}

type Weight = '25 g' | '50 g' | '100 g' | '250 g' | '500 g' | '1 kg'
const WEIGHTS: Weight[] = ['250 g', '500 g', '1 kg']
const SPICE_WEIGHTS: Weight[] = ['50 g', '100 g', '250 g', '500 g']
// A product's own pack sizes win; otherwise fall back to what its category sells in.
const weightsForProduct = (product: Product): Weight[] =>
  product.packSizes && product.packSizes.length > 0
    ? product.packSizes
    : product.type === 'Spices'
      ? SPICE_WEIGHTS
      : WEIGHTS
const defaultWeightFor = (product: Product): Weight => weightsForProduct(product)[0]
// Legacy products store the 250 g price; the weight multiplier scales it up.
const weightMultiplier: Record<Weight, number> = { '25 g': 0.1, '50 g': 0.2, '100 g': 0.4, '250 g': 1, '500 g': 2, '1 kg': 4 }
// Variety products store the per-kg price; 25 g = ÷40, 250 g = ÷4, 500 g = ÷2, 1 kg = ×1.
const kgFraction: Record<Weight, number> = { '25 g': 0.025, '50 g': 0.05, '100 g': 0.1, '250 g': 0.25, '500 g': 0.5, '1 kg': 1 }

const formatCurrency = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const selectedVarietyOf = (product: Product): Variety | undefined => {
  if (!product.varieties?.length) return undefined
  return product.varieties.find((v) => v.name === product.selectedVariety) || product.varieties[0]
}

const priceForWeight = (product: Product, weight: Weight): number => {
  const variety = selectedVarietyOf(product)
  if (variety) return Math.round(variety.price * kgFraction[weight])
  return product.price * weightMultiplier[weight]
}

const productAtWeight = (product: Product, weight: Weight): Product => ({
  ...product,
  price: priceForWeight(product, weight),
  selectedWeight: weight,
})

// Product rows keep their normal catalogue image. This small resolver applies
// imagery that belongs to a selected variety without changing its price,
// weight, or the source product data.
const ALMOND_VARIETY_IMAGES: Record<string, string> = {
  'Blanched Almonds': '/blanched-almonds.jpg',
  'Roasted Almonds': '/roasted-almonds.jpg',
}

const CASHEW_VARIETY_IMAGES: Record<string, string> = {
  'Cashew W240': '/cashew-w240.jpeg',
  'Cashew W320': '/cashew-w320.webp',
  'Cashew Jumbo Splits': '/cashew-jumbo-splits.webp',
  'Cashew Splits': '/cashew-splits.jpg',
  'Roasted Cashews': '/roasted-cashews.jpg',
  'Chilli Cashews': '/roasted-cashews.jpg',
  'Pepper Cashews': '/pepper-cashews.webp',
  'Salted Cashews': '/salted-cashews.webp',
  'BBQ Cashews': '/bbq-cashews.png',
  'Chilli Garlic Cashews': '/chilli-garlic-cashews.jpeg',
  'Cheese Cashews': '/cheese-cashews.jpg',
  'Tangy Tomato Cashews': '/tangy-tomato-cashews.jpg',
  'Mint Cashews': '/mint-cashews.jpg',
  'Peri Peri Cashews': '/peri-peri-cashews.jpg',
}

const PISTACHIO_VARIETY_IMAGES: Record<string, string> = {
  'Salted Pistachios': '/salted-pistachios.jpg',
}

const WALNUT_VARIETY_IMAGES: Record<string, string> = {
  'Kashmiri Walnut': '/kashmiri-walnut.jpg',
}

const FIG_VARIETY_IMAGES: Record<string, string> = {
  'Figs Bold': '/figs-bold.webp',
}

const RAISIN_VARIETY_IMAGES: Record<string, string> = {
  'Black Raisins': '/black-raisins.jpg',
}

const DATE_VARIETY_IMAGES: Record<string, string> = {
  'Deseeded Wet Dates': '/deseeded-wet-dates.webp',
  'Mebroom Dates': '/mebroom-dates.jpg',
  'Medjool Dates': '/medjool-dates.jpg',
}

const productWithSelectedVarietyImage = (product: Product): Product => {
  const baseImage = product.baseImage || product.image
  const varietyImage =
    product.name === 'Almonds'
      ? ALMOND_VARIETY_IMAGES[product.selectedVariety || '']
      : product.name === 'Cashews'
        ? CASHEW_VARIETY_IMAGES[product.selectedVariety || '']
        : product.name === 'Pistachios'
          ? PISTACHIO_VARIETY_IMAGES[product.selectedVariety || '']
          : product.name === 'Walnuts'
            ? WALNUT_VARIETY_IMAGES[product.selectedVariety || '']
            : product.name === 'Figs'
              ? FIG_VARIETY_IMAGES[product.selectedVariety || '']
              : product.name === 'Raisins'
                ? RAISIN_VARIETY_IMAGES[product.selectedVariety || '']
                : product.name === 'Dates'
                  ? DATE_VARIETY_IMAGES[product.selectedVariety || '']
                  : undefined

  return {
    ...product,
    baseImage,
    image: varietyImage || baseImage,
  }
}

const colorForType = (type: string): string => {
  const t = type.toLowerCase()
  if (t.includes('seed')) return 'forest'
  if (t.includes('date') || t.includes('fig') || t.includes('prune')) return 'clay'
  if (t.includes('almond') || t.includes('cashew') || t.includes('pistachio') || t.includes('walnut') || t.includes('nut')) return 'sage'
  return 'sun'
}

const varietiesFromRow = (value: unknown): Variety[] => {
  const list = Array.isArray(value) ? value : []
  return list
    .map((v: any) => ({ name: String(v?.name ?? '').trim(), price: Number(v?.price ?? 0) }))
    .filter((v: Variety) => v.name.length > 0 && Number.isFinite(v.price) && v.price > 0)
}

// Only keep gram options the shop knows how to price, smallest pack first.
const packSizesFromRow = (value: unknown): Weight[] => {
  const list = Array.isArray(value) ? value : []
  const wanted = new Set(list.map((v: any) => String(v ?? '').trim()))
  return PACK_SIZE_OPTIONS.filter((size) => wanted.has(size))
}

// Map a Supabase product row onto the shop's Product shape (varieties carry per-kg prices).
const productFromRow = (row: any): Product => {
  const varieties = varietiesFromRow(row?.varieties)
  const packSizes = packSizesFromRow(row?.pack_sizes ?? row?.packSizes)
  const perKg = varieties.length ? varieties[0].price : Number(row?.price ?? 0) * 4
  const type = String(row?.type || row?.category || 'Snacking')
  return {
    id: Number(row?.id ?? 0),
    name: String(row?.name || 'Product'),
    type,
    price: Math.round(perKg / 4),
    color: colorForType(type),
    image: String(row?.image || '/nut-selection.png'),
    detail: String(row?.detail || ''),
    rating: Number(row?.rating ?? 4.9),
    reviewsCount: Number(row?.reviews_count ?? 0),
    origin: String(row?.origin || 'India'),
    nutrients: Array.isArray(row?.nutrients) ? row.nutrients.map((n: any) => String(n)) : [],
    varieties: varieties.length ? varieties : undefined,
    packSizes: packSizes.length ? packSizes : undefined,
  }
}

// Supabase wins for everything the admin can edit (so adds/edits/deletes reach the shop), while
// older seeded rows that still have blank/!default columns keep the richer local copy.
const mergeRowIntoProduct = (base: Product, row: any): Product => {
  const mapped = productFromRow(row)
  // Older Supabase rows for some catalogue items still point at the generic
  // selection image. Keep the locally curated image in that one placeholder
  // case; any real admin-uploaded URL or non-placeholder asset still wins.
  const image =
    mapped.image === '/nut-selection.png' && base.image !== '/nut-selection.png'
      ? base.image
      : mapped.image
  return {
    ...base,
    name: mapped.name || base.name,
    type: mapped.type || base.type,
    image,
    detail: mapped.detail || base.detail,
    nutrients: mapped.nutrients && mapped.nutrients.length ? mapped.nutrients : base.nutrients,
    origin: mapped.origin && mapped.origin !== 'India' ? mapped.origin : base.origin,
    rating: base.rating ?? mapped.rating,
    reviewsCount: base.reviewsCount ?? mapped.reviewsCount,
    varieties: mapped.varieties ?? base.varieties,
    packSizes: mapped.packSizes ?? base.packSizes,
    price: mapped.price || base.price,
    color: base.color,
  }
}

// ---- Pack-size sets from the AJR price list ------------------------------
// Each family of products is sold in its own gram range; these are the dropdown
// options the shop shows once a product references one of them.
const PACK_WHOLE_SPICES: Weight[] = ['25 g', '50 g', '100 g'] // cloves, star anise, cassia, stone flower, birinji leaves, nutmeg, mace, cinnamon
const PACK_PANTRY_SPICES: Weight[] = ['50 g', '100 g', '250 g', '500 g'] // jeera (cumin), fenugreek, fennel seeds, mustard
const PACK_PREMIUM_SPICES: Weight[] = ['25 g', '50 g', '100 g', '250 g'] // pepper grades, cardamom grades
const PACK_SEEDS: Weight[] = ['50 g', '100 g', '250 g']
const PACK_DRIED_FRUIT: Weight[] = ['100 g', '250 g', '500 g']
const PACK_WALNUTS: Weight[] = ['100 g', '250 g', '500 g', '1 kg']

const fallbackProducts: Product[] = [
  {
    id: 1,
    name: 'Almonds',
    type: 'Almonds',
    price: 300,
    color: 'sage',
    image: '/almonds.webp',
    detail: 'Whole California almonds — plain, blanched or dry-roasted — with a clean, buttery crunch.',
    rating: 4.9,
    reviewsCount: 128,
    origin: 'California, USA',
    nutrients: ['Vitamin E', 'Plant Protein', 'Magnesium'],
    varieties: [
      { name: 'Almonds', price: 1200 },
      { name: 'Blanched Almonds', price: 1600 },
      { name: 'Roasted Almonds', price: 1500 },
    ],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 2,
    name: 'Cashews',
    type: 'Cashews',
    price: 350,
    color: 'forest',
    image: '/cashews.jpg',
    detail: 'Creamy whole cashews in W180, W240, W320 and split grades, roasted to order.',
    rating: 5.0,
    reviewsCount: 94,
    origin: 'Mangalore, India',
    nutrients: ['Healthy Fats', 'Zinc', 'Copper'],
    varieties: [
      { name: 'Cashew W180', price: 1400 },
      { name: 'Cashew W240', price: 1100 },
      { name: 'Cashew W320', price: 1000 },
      { name: 'Cashew Jumbo Splits', price: 1100 },
      { name: 'Cashew Splits', price: 1000 },
      { name: 'Roasted Cashews', price: 1400 },
      { name: 'Chilli Cashews', price: 1400 },
      { name: 'Pepper Cashews', price: 1400 },
      { name: 'Salted Cashews', price: 1400 },
      { name: 'BBQ Cashews', price: 1400 },
      { name: 'Chilli Garlic Cashews', price: 1400 },
      { name: 'Cheese Cashews', price: 1400 },
      { name: 'Tangy Tomato Cashews', price: 1400 },
      { name: 'Mint Cashews', price: 1400 },
      { name: 'Peri Peri Cashews', price: 1400 },
    ],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 3,
    name: 'Pistachios',
    type: 'Pistachios',
    price: 450,
    color: 'forest',
    image: '/pistachios.jpg',
    detail: 'Premium pistachios with a vivid green kernel and exceptional crunch — salted or plain.',
    rating: 4.8,
    reviewsCount: 156,
    origin: 'Kerman, Iran',
    nutrients: ['Protein', 'Lutein', 'Potassium'],
    varieties: [
      { name: 'Salted Pistachios', price: 1800 },
      { name: 'Plain Pistachios', price: 3000 },
    ],
  },
  {
    id: 4,
    name: 'Walnuts',
    type: 'Walnuts',
    price: 350,
    color: 'clay',
    image: '/walnuts.jpg',
    detail: 'Hand-broken snow-white walnut halves with zero bitterness and a naturally buttery bite — Kashmiri and Chilean grades.',
    rating: 4.9,
    reviewsCount: 82,
    origin: 'Kashmir, India',
    nutrients: ['Omega-3 (ALA)', 'Polyphenols', 'B-Vitamins'],
    varieties: [
      { name: 'Kashmiri Walnut', price: 1400 },
      { name: 'Chilean Walnut', price: 1900 },
    ],
    packSizes: PACK_WALNUTS,
  },
  {
    id: 5,
    name: 'Dried Blueberries',
    type: 'Berries',
    price: 425,
    color: 'sage',
    image: '/dried-blueberries.jpg',
    detail: 'Sweet-tart whole dried blueberries packed with antioxidants and natural fruit sugars.',
    rating: 4.9,
    reviewsCount: 128,
    origin: 'California, USA',
    nutrients: ['Antioxidants', 'Vitamin C', 'Fiber'],
    varieties: [{ name: 'Dried Blueberries', price: 1700 }],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 6,
    name: 'Dried Cranberries',
    type: 'Berries',
    price: 188,
    color: 'forest',
    image: '/dried-cranberries.jpg',
    detail: 'Plump dried cranberries with a bright, tangy bite — perfect for snacking and bakes.',
    rating: 5.0,
    reviewsCount: 94,
    origin: 'Wisconsin, USA',
    nutrients: ['Vitamin C', 'Fiber', 'Antioxidants'],
    varieties: [{ name: 'Dried Cranberries', price: 750 }],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 7,
    name: 'Dried Kiwi',
    type: 'Tropical Fruit',
    price: 150,
    color: 'forest',
    image: '/dried-kiwi.jpeg',
    detail: 'Tangy-sweet dried kiwi slices, slow-dried to keep their vivid colour and vitamin C.',
    rating: 4.8,
    reviewsCount: 156,
    origin: 'New Zealand',
    nutrients: ['Vitamin C', 'Fiber', 'Potassium'],
    varieties: [{ name: 'Dried Kiwi', price: 600 }],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 8,
    name: 'Dried Apricots',
    type: 'Stone Fruit',
    price: 349,
    color: 'sun',
    image: '/dried-apricots.png',
    detail: 'Soft, naturally sweet sun-dried apricot halves with a rich golden flavour.',
    rating: 4.9,
    reviewsCount: 82,
    origin: 'Ladakh, India',
    nutrients: ['Vitamin A', 'Iron', 'Fiber'],
  },
  {
    id: 9,
    name: 'Figs',
    type: 'Figs',
    price: 250,
    color: 'clay',
    image: '/afghan-figs.webp',
    detail: 'Naturally sun-dried figs with a sweet chew and crunchy seeds — regular and bold grades.',
    rating: 4.9,
    reviewsCount: 110,
    origin: 'Kandahar, Afghanistan',
    nutrients: ['Dietary Fiber', 'Calcium', 'Iron'],
    varieties: [
      { name: 'Figs', price: 1000 },
      { name: 'Figs Bold', price: 1600 },
    ],
  },
  {
    id: 10,
    name: 'Raisins',
    type: 'Raisins',
    price: 125,
    color: 'sun',
    image: '/golden-raisins.jpg',
    detail: 'Plump, naturally sun-dried raisins — golden Narthol and sweet black — in clean, seedless clusters.',
    rating: 4.7,
    reviewsCount: 73,
    origin: 'Nashik, India',
    nutrients: ['Iron', 'Calcium', 'Dietary Fiber'],
    varieties: [
      { name: 'Narthol Raisins', price: 500 },
      { name: 'Black Raisins', price: 600 },
    ],
  },
  {
    id: 12,
    name: 'Dates',
    type: 'Dates',
    price: 50,
    color: 'clay',
    image: '/dates.jpg',
    detail: 'Naturally sweet dates — wet, deseeded, Mebroom and Medjool — soft, caramel-like and full of fiber.',
    rating: 5.0,
    reviewsCount: 64,
    origin: 'Saudi Arabia',
    nutrients: ['Natural Fiber', 'Potassium', 'Antioxidants'],
    varieties: [
      { name: 'Wet Dates', price: 200 },
      { name: 'Deseeded Wet Dates', price: 300 },
      { name: 'Mebroom Dates', price: 950 },
      { name: 'Medjool Dates', price: 1900 },
    ],
  },
  {
    id: 13,
    name: 'Premium Dried Prunes',
    type: 'Prunes',
    price: 329,
    color: 'clay',
    image: '/dried-prunes.jpg',
    detail: 'Soft, naturally sweet dried plums with a deep caramel bite — a rich source of fibre and potassium for everyday gut-friendly snacking.',
    rating: 4.8,
    reviewsCount: 88,
    origin: 'California, USA',
    nutrients: ['Dietary Fiber', 'Potassium', 'Vitamin K'],
  },
  {
    id: 14,
    name: 'Dried Pineapple',
    type: 'Tropical Fruit',
    price: 249,
    color: 'sun',
    image: '/dried-pineapple.jpg',
    detail: 'Golden rings of sun-ripened pineapple, slow-dried to a chewy, tangy-sweet bite with zero added sugar.',
    rating: 4.8,
    reviewsCount: 96,
    origin: 'Kerala, India',
    nutrients: ['Vitamin C', 'Manganese', 'Bromelain'],
  },
  {
    id: 15,
    name: 'Dried Mango',
    type: 'Tropical Fruit',
    price: 175,
    color: 'sun',
    image: '/dried-mango.jpg',
    detail: 'Alphonso mango slices dried at low heat to keep their vivid colour and rich, honeyed tropical flavour.',
    rating: 4.9,
    reviewsCount: 142,
    origin: 'Ratnagiri, India',
    nutrients: ['Vitamin A', 'Vitamin C', 'Dietary Fiber'],
    varieties: [{ name: 'Dried Mango', price: 700 }],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 16,
    name: 'Dried Strawberry',
    type: 'Berries',
    price: 225,
    color: 'clay',
    image: '/dried-strawberry.jpg',
    detail: 'Whole strawberries dried to an intense sweet-tart chew, packed with antioxidants and natural fruit sugars.',
    rating: 4.7,
    reviewsCount: 88,
    origin: 'Maharashtra, India',
    nutrients: ['Vitamin C', 'Antioxidants', 'Folate'],
    varieties: [{ name: 'Dried Strawberry', price: 900 }],
    packSizes: PACK_DRIED_FRUIT,
  },
  {
    id: 17,
    name: 'Dried Cherry',
    type: 'Stone Fruit',
    price: 349,
    color: 'forest',
    image: '/dried-cherry.jpg',
    detail: 'Deep ruby dried cherries with a bold sweet-tart punch, perfect for desserts, granola and cheese boards.',
    rating: 4.8,
    reviewsCount: 74,
    origin: 'Turkey',
    nutrients: ['Anthocyanins', 'Potassium', 'Vitamin A'],
  },
  {
    id: 18,
    name: 'Premium Chia Seeds',
    type: 'Seeds',
    price: 125,
    color: 'forest',
    image: '/chia-seeds.jpg',
    detail: 'Omega-3 rich chia seeds that gel beautifully in water, ideal for puddings, smoothies and everyday fibre.',
    rating: 4.9,
    reviewsCount: 164,
    origin: 'Bolivia',
    nutrients: ['Omega-3 (ALA)', 'Dietary Fiber', 'Calcium'],
    varieties: [{ name: 'Premium Chia Seeds', price: 500 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 19,
    name: 'Golden Flax Seeds',
    type: 'Seeds',
    price: 50,
    color: 'clay',
    image: '/flax-seeds.jpg',
    detail: 'Cold-cleaned flax seeds with a nutty finish, a plant-based powerhouse of ALA omega-3 and lignans.',
    rating: 4.8,
    reviewsCount: 118,
    origin: 'Madhya Pradesh, India',
    nutrients: ['Omega-3 (ALA)', 'Lignans', 'Magnesium'],
    varieties: [{ name: 'Golden Flax Seeds', price: 200 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 20,
    name: 'Green Pumpkin Seeds',
    type: 'Seeds',
    price: 175,
    color: 'forest',
    image: '/dried-pumpkin-seeds.png',
    detail: 'Plump, hulled pumpkin seeds (pepitas) with a buttery crunch and a generous dose of magnesium and zinc.',
    rating: 4.9,
    reviewsCount: 137,
    origin: 'Austria',
    nutrients: ['Magnesium', 'Zinc', 'Plant Protein'],
    varieties: [{ name: 'Green Pumpkin Seeds', price: 700 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 21,
    name: 'Sunflower Seeds',
    type: 'Seeds',
    price: 100,
    color: 'sun',
    image: '/sunflower-seeds.jpg',
    detail: 'Jumbo sunflower kernels, lightly roasted for a mellow nutty flavour and a satisfying everyday crunch.',
    rating: 4.7,
    reviewsCount: 102,
    origin: 'Karnataka, India',
    nutrients: ['Vitamin E', 'Selenium', 'Plant Protein'],
    varieties: [{ name: 'Sunflower Seeds', price: 400 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 22,
    name: 'Watermelon Seeds',
    type: 'Seeds',
    price: 219,
    color: 'sage',
    image: '/watermelon-seeds.jpg',
    detail: 'Hand-sorted watermelon seeds with a delicate, mildly sweet kernel, a traditional source of iron and protein.',
    rating: 4.6,
    reviewsCount: 68,
    origin: 'Rajasthan, India',
    nutrients: ['Iron', 'Protein', 'Magnesium'],
  },
  {
    id: 23,
    name: 'White Sesame Seeds',
    type: 'Seeds',
    price: 100,
    color: 'sun',
    image: '/sesame-white-seeds.jpg',
    detail: 'Hulled white sesame seeds with a clean, delicately nutty taste, rich in calcium and healthy fats.',
    rating: 4.8,
    reviewsCount: 91,
    origin: 'Gujarat, India',
    nutrients: ['Calcium', 'Healthy Fats', 'Copper'],
    varieties: [{ name: 'White Sesame Seeds', price: 400 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 24,
    name: 'Black Sesame Seeds',
    type: 'Seeds',
    price: 90,
    color: 'forest',
    image: '/sesame-black-seeds.jpg',
    detail: 'Bold black sesame seeds with a deep roasted aroma, prized in Asian cooking and traditional wellness.',
    rating: 4.8,
    reviewsCount: 77,
    origin: 'Gujarat, India',
    nutrients: ['Calcium', 'Iron', 'Antioxidants'],
    varieties: [{ name: 'Black Sesame Seeds', price: 360 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 25,
    name: 'Basil Seeds (Sabja)',
    type: 'Seeds',
    price: 113,
    color: 'forest',
    image: '/basil-seeds.jpg',
    detail: 'Sabja basil seeds that swell into a cooling gel in seconds, a natural way to stay hydrated and refreshed.',
    rating: 4.9,
    reviewsCount: 125,
    origin: 'Tamil Nadu, India',
    nutrients: ['Dietary Fiber', 'Omega-3', 'Cooling'],
    varieties: [{ name: 'Sabja Seeds', price: 450 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 26,
    name: 'Poppy Seeds',
    type: 'Seeds',
    price: 239,
    color: 'sun',
    image: '/poppy-seeds.jpg',
    detail: 'Creamy white poppy seeds with a gentle nutty sweetness, a classic finish for curries, bakes and breads.',
    rating: 4.7,
    reviewsCount: 59,
    origin: 'Madhya Pradesh, India',
    nutrients: ['Calcium', 'Magnesium', 'Healthy Fats'],
  },
  {
    id: 44,
    name: 'Melon Seeds',
    type: 'Seeds',
    price: 225,
    color: 'sage',
    image: '/dried-pumpkin-seeds.png',
    detail: 'Creamy muskmelon seed kernels, hand-sorted and hulled, for a mild, milky crunch in snacks and sweets.',
    rating: 4.8,
    reviewsCount: 64,
    origin: 'Rajasthan, India',
    nutrients: ['Plant Protein', 'Magnesium', 'Healthy Fats'],
    varieties: [{ name: 'Melon Seeds', price: 900 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 45,
    name: 'Cucumber Seeds',
    type: 'Seeds',
    price: 125,
    color: 'sage',
    image: '/watermelon-seeds.jpg',
    detail: 'Pale cucumber seed kernels with a soft, nutty bite — a cooling traditional snack in regular and bold grades.',
    rating: 4.7,
    reviewsCount: 46,
    origin: 'Karnataka, India',
    nutrients: ['Plant Protein', 'Iron', 'Healthy Fats'],
    varieties: [
      { name: 'Cucumber Seeds', price: 500 },
      { name: 'Cucumber Seeds Bold', price: 900 },
    ],
    packSizes: PACK_SEEDS,
  },
  {
    id: 46,
    name: 'Halim Seeds',
    type: 'Seeds',
    price: 125,
    color: 'clay',
    image: '/mustard.webp',
    detail: 'Garden cress (halim/aliv) seeds that swell into a gel, traditionally eaten for iron and everyday strength.',
    rating: 4.7,
    reviewsCount: 52,
    origin: 'Rajasthan, India',
    nutrients: ['Iron', 'Dietary Fiber', 'Plant Protein'],
    varieties: [{ name: 'Halim Seeds', price: 500 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 47,
    name: 'Almond Gum (Badam Pisin)',
    type: 'Seeds',
    price: 175,
    color: 'sun',
    image: '/dried-pineapple.jpg',
    detail: 'Amber almond gum crystals that bloom into a cooling jelly — the classic badam pisin for summer drinks.',
    rating: 4.8,
    reviewsCount: 58,
    origin: 'Tamil Nadu, India',
    nutrients: ['Dietary Fiber', 'Cooling', 'Plant Based'],
    varieties: [{ name: 'Almond Gum (Badam Pisin)', price: 700 }],
    packSizes: PACK_SEEDS,
  },
  {
    id: 27,
    name: 'White Pepper',
    type: 'Spices',
    price: 349,
    color: 'sage',
    image: '/white-pepper.jpg',
    detail: 'Clean, aromatic white peppercorns with a bright, gentle heat for creamy sauces, soups and delicate curries.',
    rating: 4.8,
    reviewsCount: 48,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Fresh Aroma', 'Kitchen Essential'],
  },
  {
    id: 28,
    name: 'Black Pepper',
    type: 'Spices',
    price: 200,
    color: 'forest',
    image: '/black-pepper.jpg',
    detail: 'Bold, sun-dried black peppercorns in small, medium and bold grades, selected for deep aroma and warmth.',
    rating: 4.9,
    reviewsCount: 86,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Pungent Aroma', 'Kitchen Essential'],
    varieties: [
      { name: 'Pepper Small', price: 800 },
      { name: 'Pepper Medium', price: 900 },
      { name: 'Pepper Bold', price: 1000 },
    ],
    packSizes: PACK_PREMIUM_SPICES,
  },
  {
    id: 29,
    name: 'Mace',
    type: 'Spices',
    price: 1000,
    color: 'clay',
    image: '/mace.jpg',
    detail: 'Delicate amber mace blades with a warm, floral character for biryanis, pulaos and festive dishes.',
    rating: 4.8,
    reviewsCount: 37,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Warm Aroma', 'Festive Essential'],
    varieties: [{ name: 'Mace', price: 4000 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 30,
    name: 'Nutmeg',
    type: 'Spices',
    price: 375,
    color: 'clay',
    image: '/nutmeg.webp',
    detail: 'Whole nutmeg with a sweet, woody fragrance that adds depth to bakes, desserts and savoury dishes.',
    rating: 4.8,
    reviewsCount: 42,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Sweet Aroma', 'Baking Essential'],
    varieties: [{ name: 'Nutmeg', price: 1500 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 31,
    name: 'Star Anise',
    type: 'Spices',
    price: 300,
    color: 'clay',
    image: '/star-anise.jpg',
    detail: 'Beautiful whole star anise with a naturally sweet licorice note for teas, broths and spice blends.',
    rating: 4.7,
    reviewsCount: 35,
    origin: 'Tamil Nadu, India',
    nutrients: ['Whole Spice', 'Sweet Aroma', 'Tea Essential'],
    varieties: [{ name: 'Star Anise', price: 1200 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 32,
    name: 'Cassia',
    type: 'Spices',
    price: 100,
    color: 'clay',
    image: '/cassia.webp',
    detail: 'Robust cassia bark with a warm, sweet-spiced profile for chai, curries, rice dishes and desserts.',
    rating: 4.7,
    reviewsCount: 44,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Warm Aroma', 'Chai Essential'],
    varieties: [{ name: 'Cassia', price: 400 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 33,
    name: 'Cinnamon',
    type: 'Spices',
    price: 500,
    color: 'sun',
    image: '/cinnamon.jpg',
    detail: 'Fragrant cinnamon quills with a mellow sweetness, ready for chai, baking and slow-cooked recipes.',
    rating: 4.9,
    reviewsCount: 71,
    origin: 'Sri Lanka',
    nutrients: ['Whole Spice', 'Sweet Aroma', 'Pantry Essential'],
    varieties: [{ name: 'Cinnamon', price: 2000 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 34,
    name: 'Cloves',
    type: 'Spices',
    price: 400,
    color: 'clay',
    image: '/cloves.webp',
    detail: 'Plump whole cloves with an intense, warming aroma for masalas, curries, chai and festive bakes.',
    rating: 4.8,
    reviewsCount: 63,
    origin: 'Tamil Nadu, India',
    nutrients: ['Whole Spice', 'Warm Aroma', 'Masala Essential'],
    varieties: [{ name: 'Cloves', price: 1600 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 35,
    name: 'Cardamom',
    type: 'Spices',
    price: 1125,
    color: 'sage',
    image: '/cardamom.webp',
    detail: 'Vibrant green cardamom pods with a sweet, cooling fragrance — 7 mm bold and 8 mm jumbo grades.',
    rating: 4.9,
    reviewsCount: 92,
    origin: 'Kerala, India',
    nutrients: ['Whole Spice', 'Fresh Aroma', 'Chai Essential'],
    varieties: [
      { name: 'Cardamom 7mm (Bold)', price: 4500 },
      { name: 'Cardamom 8mm (Jumbo)', price: 5000 },
    ],
    packSizes: PACK_PREMIUM_SPICES,
  },
  {
    id: 42,
    name: 'Stone Flower (Dagad Phool)',
    type: 'Spices',
    price: 250,
    color: 'clay',
    image: '/cassia.webp',
    detail: 'Kalpasi stone flower with a deep, earthy-woodsy aroma — the secret note in Chettinad and Kolhapuri masalas.',
    rating: 4.7,
    reviewsCount: 29,
    origin: 'Tamil Nadu, India',
    nutrients: ['Whole Spice', 'Earthy Aroma', 'Masala Essential'],
    varieties: [{ name: 'Stone Flower', price: 1000 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 43,
    name: 'Birinji Leaves',
    type: 'Spices',
    price: 100,
    color: 'forest',
    image: '/mace.jpg',
    detail: 'Dried birinji leaves with a warm, herbal fragrance, used whole to perfume biryanis, pulaos and kurmas.',
    rating: 4.7,
    reviewsCount: 26,
    origin: 'Tamil Nadu, India',
    nutrients: ['Whole Spice', 'Herbal Aroma', 'Biryani Essential'],
    varieties: [{ name: 'Birinji Leaves', price: 400 }],
    packSizes: PACK_WHOLE_SPICES,
  },
  {
    id: 36,
    name: 'Carom (Ajwain)',
    type: 'Spices',
    price: 149,
    color: 'clay',
    image: '/carom-ajwain.jpg',
    detail: 'Fragrant whole ajwain with its signature warm, thyme-like aroma for breads, snacks and everyday tempering.',
    rating: 4.8,
    reviewsCount: 39,
    origin: 'Rajasthan, India',
    nutrients: ['Whole Spice', 'Fresh Aroma', 'Pantry Essential'],
  },
  {
    id: 37,
    name: 'Nigella (Kalonji)',
    type: 'Spices',
    price: 169,
    color: 'forest',
    image: '/nigella-kalonji.jpg',
    detail: 'Clean nigella seeds with a lightly peppery, onion-like flavour for pickles, breads and vegetable dishes.',
    rating: 4.8,
    reviewsCount: 34,
    origin: 'Rajasthan, India',
    nutrients: ['Whole Spice', 'Bold Aroma', 'Kitchen Essential'],
  },
  {
    id: 38,
    name: 'Mustard',
    type: 'Spices',
    price: 40,
    color: 'sun',
    image: '/mustard.webp',
    detail: 'Whole mustard seeds with a sharp, earthy character for tempering, pickles, curries and homemade sauces.',
    rating: 4.7,
    reviewsCount: 41,
    origin: 'Gujarat, India',
    nutrients: ['Whole Spice', 'Robust Aroma', 'Tempering Essential'],
    varieties: [{ name: 'Mustard', price: 160 }],
    packSizes: PACK_PANTRY_SPICES,
  },
  {
    id: 39,
    name: 'Fenugreek',
    type: 'Spices',
    price: 75,
    color: 'sun',
    image: '/fenugreek.avif',
    detail: 'Golden fenugreek seeds with a pleasantly bitter, maple-like note for curries, pickles and spice blends.',
    rating: 4.7,
    reviewsCount: 32,
    origin: 'Rajasthan, India',
    nutrients: ['Whole Spice', 'Toasty Aroma', 'Pantry Essential'],
    varieties: [{ name: 'Fenugreek', price: 300 }],
    packSizes: PACK_PANTRY_SPICES,
  },
  {
    id: 40,
    name: 'Fennel Seeds',
    type: 'Spices',
    price: 40,
    color: 'sage',
    image: '/fennel.webp',
    detail: 'Sweet, bright green fennel seeds selected for a refreshing finish in teas, desserts and savoury cooking.',
    rating: 4.8,
    reviewsCount: 55,
    origin: 'Gujarat, India',
    nutrients: ['Whole Spice', 'Sweet Aroma', 'Tea Essential'],
    varieties: [{ name: 'Fennel Seeds', price: 160 }],
    packSizes: PACK_PANTRY_SPICES,
  },
  {
    id: 41,
    name: 'Cumin (Jeera)',
    type: 'Spices',
    price: 100,
    color: 'clay',
    image: '/cumin.webp',
    detail: 'Aromatic whole cumin with a warm, earthy flavour for curries, dals, rice and everyday masala blends.',
    rating: 4.9,
    reviewsCount: 68,
    origin: 'Rajasthan, India',
    nutrients: ['Whole Spice', 'Warm Aroma', 'Masala Essential'],
    varieties: [{ name: 'Cumin (Jeera)', price: 400 }],
    packSizes: PACK_PANTRY_SPICES,
  },
]

const knownFallbackProductNames = new Set(fallbackProducts.map((product) => product.name))
const tamilOrigins: Record<string, string> = {
  'California, USA': 'கலிஃபோர்னியா, அமெரிக்கா', 'Wisconsin, USA': 'விஸ்கான்சின், அமெரிக்கா',
  'New Zealand': 'நியூசிலாந்து', 'Kerman, Iran': 'கெர்மான், ஈரான்', 'Kashmir, India': 'காஷ்மீர், இந்தியா',
  'Ladakh, India': 'லடாக், இந்தியா', 'Kandahar, Afghanistan': 'கந்தஹார், ஆப்கானிஸ்தான்',
  'Nashik, India': 'நாசிக், இந்தியா', 'Saudi Arabia': 'சவுதி அரேபியா', 'Kerala, India': 'கேரளா, இந்தியா',
  'Ratnagiri, India': 'ரத்னகிரி, இந்தியா', 'Maharashtra, India': 'மகாராஷ்டிரா, இந்தியா', Turkey: 'துருக்கி',
  Bolivia: 'பொலிவியா', 'Madhya Pradesh, India': 'மத்தியப் பிரதேசம், இந்தியா', Austria: 'ஆஸ்திரியா',
  'Karnataka, India': 'கர்நாடகா, இந்தியா', 'Rajasthan, India': 'ராஜஸ்தான், இந்தியா',
  'Gujarat, India': 'குஜராத், இந்தியா', 'Tamil Nadu, India': 'தமிழ்நாடு, இந்தியா', 'Sri Lanka': 'இலங்கை',
}
const malayalamOrigins: Record<string, string> = {
  'California, USA': 'കാലിഫോർണിയ, യു.എസ്.എ', 'Wisconsin, USA': 'വിസ്കോൺസിൻ, യു.എസ്.എ',
  'New Zealand': 'ന്യൂസിലാൻഡ്', 'Kerman, Iran': 'കെർമാൻ, ഇറാൻ', 'Kashmir, India': 'കശ്മീർ, ഇന്ത്യ',
  'Ladakh, India': 'ലഡാക്ക്, ഇന്ത്യ', 'Kandahar, Afghanistan': 'കന്ദഹാർ, അഫ്ഗാനിസ്ഥാൻ',
  'Nashik, India': 'നാസിക്, ഇന്ത്യ', 'Saudi Arabia': 'സൗദി അറേബ്യ', 'Kerala, India': 'കേരളം, ഇന്ത്യ',
  'Ratnagiri, India': 'രത്നഗിരി, ഇന്ത്യ', 'Maharashtra, India': 'മഹാരാഷ്ട്ര, ഇന്ത്യ', Turkey: 'തുർക്കി',
  Bolivia: 'ബൊളീവിയ', 'Madhya Pradesh, India': 'മധ്യപ്രദേശ്, ഇന്ത്യ', Austria: 'ഓസ്ട്രിയ',
  'Karnataka, India': 'കർണാടക, ഇന്ത്യ', 'Rajasthan, India': 'രാജസ്ഥാൻ, ഇന്ത്യ',
  'Gujarat, India': 'ഗുജറാത്ത്, ഇന്ത്യ', 'Tamil Nadu, India': 'തമിഴ്നാട്, ഇന്ത്യ', 'Sri Lanka': 'ശ്രീലങ്ക',
  'Mangalore, India': 'മംഗളൂരു, ഇന്ത്യ',
}

const tamilProductDetail = (product: Product) => {
  if (product.name === 'Dried Blueberries') return 'ஆன்டிஆக்ஸிடென்ட்கள் மற்றும் இயற்கைப் பழச் சர்க்கரை நிறைந்த இனிப்பு-புளிப்பு சுவையுள்ள முழு உலர்ந்த ப்ளூபெர்ரிகள்.'
  if (product.type === 'Spices') return 'மணம் மற்றும் இயற்கைச் சுவை காக்க கவனமாகத் தேர்ந்தெடுத்து சுத்தம் செய்யப்பட்ட உயர்தர முழு மசாலாப் பொருள்.'
  if (product.type === 'Seeds') return 'அன்றாட உணவு மற்றும் ஆரோக்கியமான சிற்றுண்டிக்காக சுத்தம் செய்து கவனமாகத் தேர்ந்தெடுக்கப்பட்ட ஊட்டச்சத்து நிறைந்த விதைகள்.'
  if (['Berries', 'Tropical Fruit', 'Stone Fruit', 'Prunes', 'Figs', 'Raisins', 'Dates'].includes(product.type)) return 'இயற்கைச் சுவை, நிறம் மற்றும் மென்மையைப் பாதுகாக்க மெதுவாக உலர்த்தப்பட்ட உயர்தர பழம்.'
  return 'இயற்கையான சுவையும் மொறுமொறுப்பும் காக்க கவனமாகத் தேர்ந்தெடுத்து சிறு தொகுதிகளாகப் பொதியப்பட்ட உயர்தரப் பருப்பு.'
}

const malayalamProductDetail = (product: Product) => {
  if (product.type === 'Spices') return 'സുഗന്ധവും സ്വാഭാവിക രുചിയും നിലനിർത്താൻ ശ്രദ്ധാപൂർവം തിരഞ്ഞെടുത്ത് വൃത്തിയാക്കിയ മികച്ച മുഴുവൻ മസാലകൾ.'
  if (product.type === 'Seeds') return 'ദൈനംദിന ഭക്ഷണത്തിനും ആരോഗ്യകരമായ ലഘുഭക്ഷണത്തിനുമായി തിരഞ്ഞെടുത്ത പോഷകസമൃദ്ധമായ വിത്തുകൾ.'
  if (['Berries', 'Tropical Fruit', 'Stone Fruit', 'Prunes', 'Figs', 'Raisins', 'Dates'].includes(product.type)) return 'സ്വാഭാവിക രുചിയും നിറവും മൃദുത്വവും നിലനിർത്താൻ ശ്രദ്ധാപൂർവം ഉണക്കിയ മികച്ച പഴങ്ങൾ.'
  return 'സ്വാഭാവിക രുചിയും ക്രഞ്ചും കാത്തുസൂക്ഷിക്കാൻ തിരഞ്ഞെടുത്ത് ചെറിയ ബാച്ചുകളായി പായ്ക്ക് ചെയ്ത മികച്ച നട്സ്.'
}

const productDetailForDisplay = (product: Product, language: string, t: (text: string) => string) =>
  language === 'ta' && knownFallbackProductNames.has(product.name)
    ? tamilProductDetail(product)
    : language === 'ml' && knownFallbackProductNames.has(product.name) && t(product.detail) === product.detail
      ? malayalamProductDetail(product)
      : t(product.detail)

const productOriginForDisplay = (product: Product, language: string, t: (text: string) => string) => {
  const origin = product.origin || '100% Organic'
  if (language === 'ta') return tamilOrigins[origin] || t(origin)
  if (language === 'ml') return malayalamOrigins[origin] || t(origin)
  return t(origin)
}

const baseNavItems: Array<{ label: string; view?: View; href?: string; action?: 'logout' }> = [
  { label: 'Home', view: 'home' },
  { label: 'About us', view: 'about' },
  { label: 'Shop', view: 'product' },
  { label: 'Contact', view: 'contact' },
]

// ---- Customer session persistence ----------------------------------------
// Signed-in customers keep their cart + wishlist in Supabase (keyed by user id).
// Anonymous visitors keep them in this browser only, and anything left here is
// merged into the account the moment that visitor signs in, then cleared so it
// can never be shown to somebody else.
const GUEST_CART_KEY = 'ajr-guest-cart'
const GUEST_WISH_KEY = 'ajr-guest-wishlist'

const readJson = (key: string): any => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeJson = (key: string, value: any) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

const dropKey = (key: string) => {
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

// Cart lines are matched by product + pack size + variety, so two variants of
// the same product stay separate lines (and both get ordered/removed correctly).
const variantKeyOf = (product: any) =>
  `${product?.id}|${product?.selectedWeight || '250 g'}|${product?.selectedVariety || ''}`

const mergeCartLines = (server: any[], guest: any[]) => {
  const out = (Array.isArray(server) ? server : []).map((line: any) => ({ ...line }))
  for (const line of Array.isArray(guest) ? guest : []) {
    if (!line?.product || !(Number(line.quantity) > 0)) continue
    const found = out.find((existing: any) => variantKeyOf(existing.product) === variantKeyOf(line.product))
    if (found) found.quantity = Math.min(99, Number(found.quantity) + Number(line.quantity))
    else out.push({ product: line.product, quantity: Number(line.quantity) })
  }
  return out
}

const mergeWishlist = (server: any[], guest: any[]) => {
  const out: any[] = []
  const seen = new Set<string>()
  for (const item of [...(Array.isArray(server) ? server : []), ...(Array.isArray(guest) ? guest : [])]) {
    const key = String((item as any)?.id ?? '')
    if (!item || !key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export default function Page() {
  const { t } = useLanguage()
  const [view, setView] = useState<View>('home')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
  const [wishlist, setWishlist] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product>(fallbackProducts[0])
  const [category, setCategory] = useState('All')
  const [quantity, setQuantity] = useState(1)
  const [sent, setSent] = useState(false)
  const [catalog, setCatalog] = useState<Product[]>(fallbackProducts)
  const [stockMap, setStockMap] = useState<Record<number, { stock: number; status: string }>>({})
  const [flight, setFlight] = useState<Flight | null>(null)
  const [pulsingTarget, setPulsingTarget] = useState<FlightTarget | null>(null)
  const cartTargetRef = useRef<HTMLButtonElement>(null)
  const wishlistTargetRef = useRef<HTMLButtonElement>(null)
  const wishlistRef = useRef<Product[]>([])
  const flightLockRef = useRef<Set<FlightTarget>>(new Set())
  const flightIdRef = useRef(0)
  const pulseTimeoutRef = useRef<number | null>(null)

  // Signed-in customer. null = anonymous visitor.
  const [session, setSession] = useState<{
    id: string
    email: string
    name: string
    phone: string
    token: string
  } | null>(null)
  // Guards: nothing is written back until the first read has finished, otherwise
  // the empty first render would overwrite a stored cart / wishlist.
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  const authHeaders = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })

  useEffect(() => {
    const boot = async () => {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('ajr-access-token') || '' : ''
      let user: any = null

      if (token) {
        try {
          const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
          if (res.ok) user = (await res.json()).user
          else window.localStorage.removeItem('ajr-access-token')
        } catch {
          user = null
        }
      }

      const guestCart = (readJson(GUEST_CART_KEY) || []) as { product: Product; quantity: number }[]
      const guestWish = (readJson(GUEST_WISH_KEY) || []) as Product[]

      if (user) {
        setSession({ ...user, token })

        let serverCart: { product: Product; quantity: number }[] = []
        let serverWish: Product[] = []
        let serverReachable = false
        try {
          const [cartRes, wishRes] = await Promise.all([
            fetch('/api/cart', { headers: authHeaders(token), cache: 'no-store' }),
            fetch('/api/wishlist', { headers: authHeaders(token), cache: 'no-store' }),
          ])
          if (cartRes.ok) serverCart = (await cartRes.json()).items || []
          if (wishRes.ok) serverWish = (await wishRes.json()).items || []
          serverReachable = cartRes.ok && wishRes.ok
        } catch {
          serverReachable = false
        }

        const mergedCart = mergeCartLines(serverCart, guestCart)
        const mergedWish = mergeWishlist(serverWish, guestWish)
        setCart(mergedCart)
        setWishlist(mergedWish)

        // Anything the visitor built while signed out is pushed up once, then the
        // local copy is dropped so it can never surface for another account.
        if (guestCart.length > 0 || guestWish.length > 0) {
          dropKey(GUEST_CART_KEY)
          dropKey(GUEST_WISH_KEY)
          if (serverReachable) {
            fetch('/api/cart', { method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ items: mergedCart }) }).catch(() => {})
            fetch('/api/wishlist', { method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ items: mergedWish }) }).catch(() => {})
          }
        }
      } else {
        setCart(Array.isArray(guestCart) ? guestCart : [])
        setWishlist(Array.isArray(guestWish) ? guestWish : [])
      }

      setSessionLoaded(true)
      setDataLoaded(true)
    }

    boot()
  }, [])

  // Persist the cart whenever it changes (server for members, browser for guests).
  useEffect(() => {
    if (!dataLoaded) return
    const timer = setTimeout(() => {
      if (session) {
        fetch('/api/cart', { method: 'PUT', headers: authHeaders(session.token), body: JSON.stringify({ items: cart }) }).catch(() => {})
      } else {
        writeJson(GUEST_CART_KEY, cart)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [cart, session, dataLoaded])

  // Same for the wishlist.
  useEffect(() => {
    if (!dataLoaded) return
    const timer = setTimeout(() => {
      if (session) {
        fetch('/api/wishlist', { method: 'PUT', headers: authHeaders(session.token), body: JSON.stringify({ items: wishlist }) }).catch(() => {})
      } else {
        writeJson(GUEST_WISH_KEY, wishlist)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [wishlist, session, dataLoaded])

  // The ref makes a rapid second press see the result of the first press before
  // React has had a chance to schedule a render.
  useEffect(() => {
    wishlistRef.current = wishlist
  }, [wishlist])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const rows = Array.isArray(data.products) ? data.products : []
        if (rows.length === 0) return
        const map: Record<number, { stock: number; status: string }> = {}
        rows.forEach((r: any) => {
          map[Number(r.id)] = { stock: Number(r.stock ?? 99), status: String(r.status || 'In stock') }
        })
        const merged = fallbackProducts.map((base) => {
          const found = rows.find(
            (r: any) => Number(r.id) === base.id || String(r.name).toLowerCase() === base.name.toLowerCase()
          )
          if (!found) return base
          return mergeRowIntoProduct(base, found)
        })
        // Products created/edited in the admin dashboard live only in Supabase — surface them here too.
        const extra = rows
          .filter(
            (r: any) =>
              !fallbackProducts.some(
                (base) => Number(base.id) === Number(r.id) || base.name.toLowerCase() === String(r.name).toLowerCase()
              )
          )
          .map((r: any) => productFromRow(r))
        setCatalog([...merged, ...extra])
        setStockMap(map)
      } catch {}
    }
    load()
  }, [])

  const products = catalog
  const isOutOfStock = (p: Product) => {
    const s = stockMap[p.id]
    if (!s) return false
    return s.status === 'Out of stock' || s.stock <= 0
  }

  const filteredProducts = useMemo(
    () => (category === 'All' ? products : products.filter((p) => p.type.includes(category))),
    [category, products]
  )
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const go = (next: View) => {
    setView(next)
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sameVariant = (a: Product, b: Product) =>
    a.id === b.id &&
    (a.selectedWeight || '250 g') === (b.selectedWeight || '250 g') &&
    (a.selectedVariety || '') === (b.selectedVariety || '')

  const pulseTarget = (target: FlightTarget) => {
    if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
    setPulsingTarget(target)
    pulseTimeoutRef.current = window.setTimeout(() => setPulsingTarget(null), 420)
  }

  const finishFlight = (target: FlightTarget) => {
    setFlight(null)
    flightLockRef.current.delete(target)
    pulseTarget(target)
  }

  // Uses real, viewport-relative geometry rather than a fixed header position, so
  // the confirmation remains accurate across the desktop and compact headers.
  const launchFlight = (product: Product, origin: HTMLElement | null | undefined, target: FlightTarget): FlightLaunchResult => {
    const destination = target === 'cart' ? cartTargetRef.current : wishlistTargetRef.current
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (flightLockRef.current.size > 0) {
      return 'locked'
    }
    if (reduceMotion || !origin || !destination) {
      pulseTarget(target)
      return 'skipped'
    }

    const originRect = origin.getBoundingClientRect()
    const targetRect = destination.getBoundingClientRect()
    if (!originRect.width || !originRect.height || !targetRect.width || !targetRect.height) {
      pulseTarget(target)
      return 'skipped'
    }

    const tokenSize = 44
    const startX = originRect.left + originRect.width / 2 - tokenSize / 2
    const startY = originRect.top + originRect.height / 2 - tokenSize / 2
    const endX = targetRect.left + targetRect.width / 2 - tokenSize / 2
    const endY = targetRect.top + targetRect.height / 2 - tokenSize / 2
    flightLockRef.current.add(target)
    setFlight({
      id: ++flightIdRef.current,
      image: productWithSelectedVarietyImage(product).image,
      x: startX,
      y: startY,
      dx: endX - startX,
      dy: endY - startY,
      target,
    })
    return 'started'
  }

  useEffect(() => () => {
    if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
  }, [])

  const addToCart = (product: Product, qty = 1, origin?: HTMLElement | null) => {
    const selectedProduct = productWithSelectedVarietyImage(product)
    setCart((items) => {
      const found = items.find((item) => sameVariant(item.product, selectedProduct))
      return found
        ? items.map((item) => (sameVariant(item.product, selectedProduct) ? { ...item, quantity: item.quantity + qty } : item))
        : [...items, { product: selectedProduct, quantity: qty }]
    })
    return launchFlight(selectedProduct, origin, 'cart')
  }

  const toggleWish = (product: Product, origin?: HTMLElement | null) => {
    const currentItems = wishlistRef.current
    const isAdding = !currentItems.some((item) => item.id === product.id)
    const nextItems = isAdding ? [...currentItems, product] : currentItems.filter((item) => item.id !== product.id)
    wishlistRef.current = nextItems
    setWishlist(nextItems)
    // Removing a saved item is intentionally quiet; only additions fly to the heart.
    if (isAdding) launchFlight(product, origin, 'wishlist')
  }

  // Signed-in members get the account nav; visitors keep Login / Signup.
  const navItems: typeof baseNavItems = !sessionLoaded
    ? baseNavItems
    : session
    ? [
        ...baseNavItems,
        { label: 'My Orders', view: 'orders' },
        { label: 'Logout', action: 'logout' },
      ]
    : [...baseNavItems, { label: 'Login', href: '/login' }, { label: 'Signup', href: '/signup' }]

  // Ends the session on this device and drops every locally cached copy of the
  // customer's data. The server-side cart / wishlist / orders stay attached to
  // the account and come back on the next sign-in.
  const logout = async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      await supabase.auth.signOut()
    } catch {}
    try {
      window.localStorage.removeItem('ajr-access-token')
      window.localStorage.removeItem('adminAccessEmail')
      window.localStorage.removeItem('ajr-user-email')
    } catch {}
    dropKey(GUEST_CART_KEY)
    dropKey(GUEST_WISH_KEY)
    setSession(null)
    setCart([])
    setWishlist([])
    if (view === 'orders' || view === 'cart') setView('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Announcement Bar */}
      <div className="top-ticker">
        <div className="ticker-left">
          <span className="live-dot" />
          <span>{t('Fresh Harvest Batch Arrived Today')}</span>
        </div>
        <div className="ticker-right">
          <span>
            <Truck size={13} /> {t('Free Express Delivery on orders over ₹999')}
          </span>
          <span>
            <ShieldCheck size={13} /> {t('100% Pure & Organic Certified')}
          </span>
        </div>
      </div>

      <header className="site-header">
        <button
          className="mobile-menu"
          aria-label={t('Open menu')}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
        <button className="brand" onClick={() => go('home')}>
          <img src={logo} alt="AJR — Always Just Royal" width={1254} height={1254} />
        </button>
        <nav className={mobileOpen ? 'nav nav-open' : 'nav'}>
          {navItems.map((item) =>
            item.action === 'logout' ? (
              <button key={item.label} className="nav-logout" onClick={logout}>
                <LogOut size={15} aria-hidden="true" /> {t(item.label)}
              </button>
            ) : item.view ? (
              <button
                key={item.label}
                className={view === item.view ? 'active' : ''}
                onClick={() => go(item.view!)}
              >
                {t(item.label)}
              </button>
            ) : (
              <Link key={item.label} className="nav-link" href={item.href!}>
                {t(item.label)}
              </Link>
            )
          )}
          <div className="mobile-nav-language">
            <LanguageSwitcher className="mobile-nav-language-switcher" />
          </div>
        </nav>
        <div className="header-utilities">
          <LanguageSwitcher className="shop-language-switcher" />
          <div className="header-actions">
            {session ? (
              <>
                <button
                  aria-label={t('My Orders')}
                  title={t('My Orders')}
                  onClick={() => go('orders')}
                  className={view === 'orders' ? 'account-btn account-btn--active' : 'account-btn'}
                >
                  <Package size={19} />
                </button>
                <button aria-label={t('Log out')} title={t('Log out')} onClick={logout} className="account-btn">
                  <LogOut size={19} />
                </button>
              </>
            ) : sessionLoaded ? (
              <button
                aria-label={t('Login')}
                title={t('Login')}
                onClick={() => {
                  window.location.href = '/login'
                }}
                className="account-btn"
              >
                <User size={19} />
              </button>
            ) : null}
            <button
              aria-label={t('Wishlist')}
              onClick={() => go('wishlist')}
              className={pulsingTarget === 'wishlist' ? 'icon-badge fly-target-pulse' : 'icon-badge'}
              ref={wishlistTargetRef}
            >
              <Heart size={19} />
              {wishlist.length > 0 && <b>{wishlist.length}</b>}
            </button>
            <button
              aria-label={t('Cart')}
              onClick={() => go('cart')}
              className={pulsingTarget === 'cart' ? 'icon-badge cart-header-button fly-target-pulse' : 'icon-badge cart-header-button'}
              ref={cartTargetRef}
            >
              <ShoppingBag size={19} />
              {cartCount > 0 && <b className="cart-count-badge">{cartCount}</b>}
            </button>
          </div>
        </div>
      </header>

      {view === 'home' && (
        <Home
          go={go}
          setSelected={setSelected}
          addToCart={addToCart}
          toggleWish={toggleWish}
          wishlist={wishlist}
          products={products}
        />
      )}
      {view === 'about' && <About go={go} />}
      {view === 'product' && (
        <Shop
          products={filteredProducts}
          allTypes={Array.from(new Set(products.map((p) => p.type)))}
          category={category}
          setCategory={setCategory}
          setSelected={setSelected}
          go={go}
          addToCart={addToCart}
          toggleWish={toggleWish}
          wishlist={wishlist}
          isOutOfStock={isOutOfStock}
        />
      )}
      {view === 'detail' && (
        <Detail
          product={selected}
          quantity={quantity}
          setQuantity={setQuantity}
          addToCart={addToCart}
          toggleWish={toggleWish}
          wished={wishlist.some((p) => p.id === selected.id)}
          go={go}
          outOfStock={isOutOfStock(selected)}
        />
      )}
      {view === 'contact' && <Contact sent={sent} setSent={setSent} />}
      {view === 'cart' && (
        <Cart cart={cart} setCart={setCart} subtotal={subtotal} go={go} session={session} />
      )}
      {view === 'wishlist' && (
        <Wishlist
          wishlist={wishlist}
          toggleWish={toggleWish}
          setSelected={setSelected}
          addToCart={addToCart}
          go={go}
        />
      )}
      {view === 'orders' && (
        <MyOrders session={session} sessionLoaded={sessionLoaded} go={go} />
      )}
      <Footer go={go} />
      {flight && (
        <img
          key={flight.id}
          className="fly-product-token"
          src={flight.image}
          alt=""
          aria-hidden="true"
          onAnimationEnd={() => finishFlight(flight.target)}
          style={{
            left: flight.x,
            top: flight.y,
            '--flight-x': `${flight.dx}px`,
            '--flight-y': `${flight.dy}px`,
          } as CSSProperties}
        />
      )}
    </div>
  )
}

const testimonials = [
  {
    quote: 'The Medjool dates are the softest I have ever had. We keep a bowl on the table and it empties itself within minutes!',
    name: 'Priyanka B.',
    role: 'Verified Buyer · Bengaluru',
    stars: 5,
  },
  {
    quote: 'I ordered the trail mix for my office drawer. It has genuinely changed my afternoons — fresh, crunchy, never stale.',
    name: 'Ranjani P.',
    role: 'Verified Buyer · Mumbai',
    stars: 5,
  },
  {
    quote: 'Gifted AJR royal wooden boxes for Diwali and the packaging alone got endless compliments. Truly premium quality.',
    name: 'Ranjith',
    role: 'Verified Buyer · Delhi',
    stars: 5,
  },
  {
    quote: 'The Kashmiri mammoth walnuts are whole, creamy and completely zero bitter taste. Superior to any brand in the market.',
    name: 'Dr. Vikram S.',
    role: 'Nutritionist · Hyderabad',
    stars: 5,
  },
].slice(0, 3)

const processSteps = [
  {
    step: '01',
    title: 'Peak Season Harvesting',
    text: 'We partner with accredited orchards in Kashmir, California, and Iran that harvest at ideal maturity for richest natural flavor.',
  },
  {
    step: '02',
    title: 'Strict Size & Quality Grading',
    text: 'Every batch is sorted by hand and optical scanners. Only whole, generous kernels make it into our signature pouches.',
  },
  {
    step: '03',
    title: 'Small-Batch Nitrogen Flush',
    text: 'Packed in small batches within hours of roasting to lock in natural moisture, crunch, and aroma without preservatives.',
  },
]

const recipes = [
  {
    title: 'Saffron & Almond Golden Elixir',
    desc: 'Warm almond milk infused with Kashmiri saffron strands, cardamom, and crushed AJR Royal Almonds for bedtime calm.',
    time: '10 mins prep',
    image: '/nut-selection.png',
  },
  {
    title: 'Honey Date & Walnut Energy Bites',
    desc: 'No-bake protein balls made with Medjool Date Reserve, raw walnuts, chia seeds, and a drizzle of wild forest honey.',
    time: '15 mins prep',
    image: '/dates-apricots.png',
  },
  {
    title: 'Herb-Roasted Cashew Snack Bowl',
    desc: 'Jumbo golden cashews tossed with rosemary, pink Himalayan salt, and cold-pressed extra virgin olive oil.',
    time: '8 mins prep',
    image: '/pistachio-premium.png',
  },
]

const initialFaqs = [
  {
    q: 'Are AJR dry fruits and nuts 100% natural and organic?',
    a: 'Yes. We work directly with certified farms and growers. All our dry fruits and nuts are 100% natural, non-GMO, zero artificial preservatives, and chemical-free.',
  },
  {
    q: 'How fresh is the stock when it arrives at my doorstep?',
    a: 'Everything is packed in small batches weekly in vacuum-sealed nitrogen-flushed packaging. Orders ship within 24 hours of packing so freshness is guaranteed.',
  },
  {
    q: 'Can I customize gift boxes for weddings or corporate events?',
    a: 'Absolutely! Our Interactive Custom Box Builder lets you pick dry fruit combinations, custom box finishes, and laser-engraved personal notes for any occasion.',
  },
  {
    q: 'What is your shipping policy and delivery timeline?',
    a: 'Shipping is completely FREE on orders over ₹999 (flat ₹99 otherwise). Orders placed before 1:00 PM IST ship same day, with delivery within 2–4 business days across India.',
  },
]

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            el.classList.add('revealed')
            io.disconnect()
          }
        },
        { threshold: 0.01 }
      )
      io.observe(el)
      return () => {
        io.disconnect()
      }
    }

    const timer = window.setTimeout(() => el.classList.add('revealed'), 150)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function Counter({ to, suffix = '', label }: { to: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const duration = 1600
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return (
    <div className="stat">
      <span className="stat-number" ref={ref}>
        {value.toLocaleString()}
        {suffix}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function LetterReveal({ text }: { text: string }) {
  const { language } = useLanguage()
  const ref = useRef<HTMLSpanElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setIsVisible(true)
        observer.disconnect()
      },
      { threshold: 0.18 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={ref} className={isVisible ? 'letter-reveal is-visible' : 'letter-reveal'} aria-label={text}>
      {language === 'ta' || language === 'hi' || language === 'ml' || language === 'te' ? (
        <span className="letter-reveal-script" aria-hidden="true">{text}</span>
      ) : Array.from(text).map((character, index) => (
        <span
          className="letter-reveal-char"
          style={{ animationDelay: `${index * 24}ms` }}
          key={`${character}-${index}`}
          aria-hidden="true"
        >
          {character === ' ' ? '\u00a0' : character}
        </span>
      ))}
    </span>
  )
}

function FaqItem({ faq, index, initiallyOpen }: { faq: (typeof initialFaqs)[number]; index: number; initiallyOpen: boolean }) {
  const hasAppliedInitialState = useRef(false)

  return (
    <details
      className="faq-item"
      ref={(node) => {
        if (!node || hasAppliedInitialState.current) return
        node.open = initiallyOpen
        hasAppliedInitialState.current = true
      }}
      style={{ '--faq-stagger': `${index * 85}ms` } as React.CSSProperties}
    >
      <summary>
        <span className="faq-question-wrap">
          <span className="faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="faq-question">{faq.q}</span>
        </span>
        <span className="faq-chevron" aria-hidden="true"><ChevronDown size={17} /></span>
      </summary>
      <div className="faq-answer"><p>{faq.a}</p></div>
    </details>
  )
}

function Home({ go, setSelected, addToCart, toggleWish, wishlist, products: list }: any) {
  const { t } = useLanguage()
  const products = Array.isArray(list) && list.length > 0 ? list : fallbackProducts
  const [faqSearch, setFaqSearch] = useState('')
  const [faqHasBeenSearched, setFaqHasBeenSearched] = useState(false)
  const [activeCampaignSlide, setActiveCampaignSlide] = useState(0)
  const [campaignControlsFocused, setCampaignControlsFocused] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const campaignSlides = [
    {
      src: '/ajr-everyday-goodness-snacking.png',
      alt: 'AJR Healthy Snacking for a Happier You campaign banner with a woman enjoying nuts.',
    },
    {
      src: '/ajr-everyday-goodness-ladoo-banner.png',
      alt: 'AJR Tradition Meets Innovation campaign banner featuring dry fruit ladoos.',
    },
    {
      src: '/ajr-everyday-goodness-fitness-banner.png',
      alt: 'AJR Fuel Stronger Days campaign banner featuring premium dry fruits and nuts.',
    },
    {
      src: '/ajr-everyday-goodness-blanched-almonds.png',
      alt: 'AJR Blanched Almonds campaign banner.',
    },
  ]

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setPrefersReducedMotion(motionQuery.matches)

    updateMotionPreference()
    motionQuery.addEventListener('change', updateMotionPreference)
    return () => motionQuery.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion || campaignControlsFocused) return

    const timer = window.setInterval(() => {
      setActiveCampaignSlide((current) => (current + 1) % campaignSlides.length)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [campaignControlsFocused, prefersReducedMotion, campaignSlides.length])

  const localizedFaqs = initialFaqs.map((faq) => ({ q: t(faq.q), a: t(faq.a) }))
  const filteredFaqs = localizedFaqs.filter(
    (f) =>
      f.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      f.a.toLowerCase().includes(faqSearch.toLowerCase())
  )

  return (
    <>
      <main className="home-tight">
        {/* Storefront hero */}
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow hero-rise">
              {t('Harvest · 100% Organic')}
            </p>
            <h1 className="hero-rise d1">
              <span className="sr-only">{t('Goodness worth sharing.')}</span>
              <span className="letter-heading" aria-hidden="true">
                <LetterReveal text={t('Goodness')} />
                <br />
                <em><LetterReveal text={t('worth sharing.')} /></em>
              </span>
            </h1>
            <p className="hero-text hero-rise d2">
              {t('Handpicked California almonds, jumbo golden cashews, Medjool dates and Kashmiri walnuts — curated for daily wellness and royal gifting.')}
            </p>
            <div className="hero-actions hero-rise d3">
              <button
                className="button button-dark"
                onClick={() => go('product')}
              >
                {t('Explore Collection')} <ArrowRight size={17} />
              </button>
              <button
                className="button button-ghost"
                onClick={() => go('about')}
              >
                {t('Our Farm Story')}
              </button>
            </div>

          </div>
        </section>

        {/* Marquee Banner */}
        <section className="marquee" aria-hidden="true">
          <div className="marquee-track">
            <span>{t('Rooted in nature')}</span>
            <span>✦</span>
            <span>{t('Handpicked Grade A Kernels')}</span>
            <span>✦</span>
            <span>{t('Zero Preservatives')}</span>
            <span>✦</span>
            <span>{t('Small Batch Roasted')}</span>
            <span>✦</span>
            <span>{t('Rooted in nature')}</span>
            <span>✦</span>
            <span>{t('Handpicked Grade A Kernels')}</span>
            <span>✦</span>
            <span>{t('Zero Preservatives')}</span>
            <span>✦</span>
            <span>{t('Small Batch Roasted')}</span>
            <span>✦</span>
          </div>
        </section>

        {/* Brand Promise Section */}
        <Reveal>
          <section className="intro section">
            <div>
                <p className="eyebrow">{t('The AJR Philosophy')}</p>
              <h2>
                  <span className="sr-only">{t('Good food is always worth sharing.')}</span>
                <span className="letter-heading" aria-hidden="true">
                  <LetterReveal text={t('Good food is')} />
                  <br />
                  <em><LetterReveal text={t('always')} /></em>{' '}<LetterReveal text={t('worth sharing.')} />
                </span>
              </h2>
            </div>
            <div className="intro-copy">
              <p>
                {t('We source generous, delicious dry fruits and nuts that bring authentic nourishment to your daily routine. Every handful starts with careful selection at peak harvest, honest ingredients, and zero artificial processing.')}
              </p>
              <button className="text-link" onClick={() => go('about')}>
                {t('Read Our Story')} <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </Reveal>

        {/* AJR Everyday Goodness Campaign Slider */}
        <section className="campaign-slider" aria-labelledby="campaign-slider-title">
          <div className="campaign-slider-heading">
            <p className="eyebrow">{t('Campaign gallery')}</p>
            <h2 id="campaign-slider-title">{t('AJR Everyday Goodness')}</h2>
          </div>

          <div
            className="campaign-slider-stage"
            role="region"
            aria-roledescription="carousel"
            aria-label={t('AJR Everyday Goodness campaign artwork')}
          >
            <div className="campaign-slider-viewport">
              <div
                className="campaign-slider-track"
                style={{ transform: `translateX(-${activeCampaignSlide * 100}%)` }}
              >
                {campaignSlides.map((slide, index) => (
                  <div
                    className="campaign-slide"
                    key={slide.src}
                    aria-hidden={index !== activeCampaignSlide}
                  >
                    <img
                      className="campaign-slide-backdrop"
                      src={slide.src}
                      alt=""
                      aria-hidden="true"
                    />
                    <div className="campaign-slide-art-frame">
                      <img
                        className="campaign-slide-artwork"
                        src={slide.src}
                        alt={slide.alt}
                        width={1680}
                        height={945}
                        loading={index === 0 ? 'eager' : 'lazy'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="campaign-slider-controls"
              onFocusCapture={() => setCampaignControlsFocused(true)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setCampaignControlsFocused(false)
                }
              }}
            >
              <button
                type="button"
                className="campaign-arrow"
                onClick={() => setActiveCampaignSlide((current) => (current - 1 + campaignSlides.length) % campaignSlides.length)}
                aria-label="Show previous campaign image"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <div className="campaign-slider-dots" aria-label="Choose campaign image">
                {campaignSlides.map((slide, index) => (
                  <button
                    type="button"
                    key={slide.src}
                    className={index === activeCampaignSlide ? 'campaign-dot is-active' : 'campaign-dot'}
                    onClick={() => setActiveCampaignSlide(index)}
                    aria-label={`Show campaign image ${index + 1} of ${campaignSlides.length}`}
                    aria-current={index === activeCampaignSlide ? 'true' : undefined}
                  />
                ))}
              </div>
              <button
                type="button"
                className="campaign-arrow"
                onClick={() => setActiveCampaignSlide((current) => (current + 1) % campaignSlides.length)}
                aria-label="Show next campaign image"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* Product Catalog Showcase */}
        <Reveal>
          <section className="product-feature section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t('Handpicked Bestsellers')}</p>
                <h2>
                  <span className="sr-only">{t('Meet your new everyday ritual')}</span>
                  <span className="letter-heading" aria-hidden="true">
                    <LetterReveal text={t('Meet your new everyday ritual')} />
                  </span>
                </h2>
              </div>
              <button className="text-link" onClick={() => go('product')}>
                {t('View Full Pantry')} <ArrowRight size={16} />
              </button>
            </div>
            <div className="product-grid">
              {products.slice(0, 6).map((p, i) => (
                <Reveal key={p.id} delay={i * 90}>
                  <ProductCard
                    product={p}
                    onSelect={(next) => {
                      setSelected(next)
                      go('detail')
                    }}
                    addToCart={addToCart}
                    toggleWish={toggleWish}
                    wished={wishlist.some((w: Product) => w.id === p.id)}
                  />
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Interactive Nutrition Match Component */}
        <Reveal>
          <NutritionMatch
            products={products}
            onSelectProduct={(p) => {
              setSelected(p)
              go('detail')
            }}
            go={go}
          />
        </Reveal>

        {/* Live Counters */}
        <Reveal>
          <section className="stats-bar">
            <Counter to={28} suffix="k+" label={t('Happy Households Served')} />
            <Counter to={14} label={t('Accredited Partner Farms')} />
            <Counter to={100} suffix="%" label={t('Pure Natural Sourcing')} />
            <Counter to={52} suffix="k" label={t('Handfuls Shared Daily')} />
          </section>
        </Reveal>

        {/* Festive & Royal Gifting Section */}
        <Reveal>
          <section className="festive-banner">
            <div className="festive-copy">
              <p className="eyebrow text-lime-300">
                <Gift size={15} /> {t('Royal Celebrations & Hampers')}
              </p>
              <h2>
                {t('Gifting made')}<br />
                <em>unforgettable.</em>
              </h2>
              <p>
                {t('Elevate weddings, festive celebrations, and corporate milestones with AJR handcrafted wooden presentation boxes, embossed gold foils, and custom handwritten cards.')}
              </p>

              <div className="festive-pills">
                <span className="festive-pill">✦ {t('Laser Engraved Wood')}</span>
                <span className="festive-pill">✦ {t('Airtight Glass Jars')}</span>
                <span className="festive-pill">✦ {t('Custom Bulk Pricing')}</span>
              </div>

              <button
                className="button button-light"
                onClick={() => go('product')}
              >
                {t('Explore Gift Hampers')} <ArrowRight size={17} />
              </button>
            </div>
            <div className="festive-visual">
              <div className="festive-img-card">
                <img
                  src="/nut-selection.png"
                  alt="Royal Festive Gift Box"
                />
              </div>
            </div>
          </section>
        </Reveal>

        {/* Quality Steps */}
        <Reveal>
          <section className="process-section section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t('From Grove to Table')}</p>
                <h2>
                  {t('How every pack')}<br />
                  <em>{t('finds you.')}</em>
                </h2>
              </div>
              <p className="section-intro">
                {t('Three rigorous steps between harvest and your table — zero shortcuts, nothing rushed.')}
              </p>
            </div>
            <div className="process-grid">
              {processSteps.map((s, i) => (
                <Reveal key={s.step} delay={i * 120}>
                  <div className="process-card">
                    <span className="process-step">{s.step}</span>
                    <h3>{t(s.title)}</h3>
                    <p>{t(s.text)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Culinary Journal & Recipe Pairings */}
        <Reveal>
          <section className="journal section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t('Culinary Inspiration')}</p>
                <h2>{t('Simple ways to enjoy everyday superfoods')}</h2>
              </div>
            </div>
            <div className="product-grid">
              {recipes.map((r) => (
                <div key={r.title} className="recipe-card">
                  <div className="recipe-img">
                    <img src={r.image} alt={t(r.title)} />
                    <span className="recipe-time-tag">
                      <Clock size={12} /> {t(r.time)}
                    </span>
                  </div>
                  <div className="recipe-body">
                    <h3>{t(r.title)}</h3>
                    <p>{t(r.desc)}</p>
                    <button
                      className="text-link"
                      onClick={() => go('product')}
                    >
                      {t('Shop Ingredients')} <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Wall of Love Testimonials */}
        <Reveal>
          <section className="testimonials section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t('Customer Voices')}</p>
                <h2>
                  {t('Loved by')}<br />
                  <em>{t('good company.')}</em>
                </h2>
              </div>
              <span className="rating-chip">
                <Star size={14} className="inline mr-1 fill-current" /> {t('4.95 / 5 Average Rating (1,400+ Reviews)')}
              </span>
            </div>
            <div className="testimonial-grid">
              {testimonials.map((testimonial, i) => (
                <Reveal key={testimonial.name} delay={i * 100}>
                  <figure className="testimonial">
                    <span className="testimonial-stars">★★★★★</span>
                    <blockquote>“{t(testimonial.quote)}”</blockquote>
                    <figcaption>
                      <strong>{testimonial.name}</strong>
                      <span>{t(testimonial.role)}</span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Searchable FAQ Section */}
        <Reveal className="faq-reveal">
          <section className="faq-section section">
            <div className="faq-layout">
              <div className="faq-garden-panel">
                <p className="faq-support-label"><span aria-hidden="true">●</span> {t('AJR support library')}</p>
                <h2>
                  {t('Questions,')}<br />
                  <em>{t('answered.')}</em>
                </h2>
                <p className="section-intro">
                  {t('Everything you might wonder before your first handful arrives.')}
                </p>
                <div className="faq-garden-note">
                  <span className="faq-note-mark" aria-hidden="true">✦</span>
                  <p>{t('Need a hand choosing, gifting, or ordering in bulk?')}</p>
                  <button className="faq-panel-link" onClick={() => go('contact')}>
                    {t('Write to us')} <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="faq-answer-desk">
                <div className="faq-desk-head">
                  <p>{t('Find your answer')}</p>
                  <span aria-live="polite" aria-atomic="true">
                    {faqSearch
                      ? `${filteredFaqs.length} ${t(filteredFaqs.length === 1 ? 'answer found' : 'answers found')}`
                      : `${localizedFaqs.length} ${t('common questions')}`}
                  </span>
                </div>
                <div className="faq-search-box">
                  <Search size={18} aria-hidden="true" />
                  <label className="sr-only" htmlFor="faq-search">{t('Search AJR frequently asked questions')}</label>
                  <input
                    id="faq-search"
                    type="text"
                    placeholder={t('Search questions (e.g. freshness, organic, bulk)...')}
                    value={faqSearch}
                    onChange={(e) => {
                      setFaqSearch(e.target.value)
                      setFaqHasBeenSearched(true)
                    }}
                  />
                  {faqSearch && (
                    <button className="faq-clear-search" type="button" onClick={() => setFaqSearch('')} aria-label={t('Clear FAQ search')}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="faq-list">
                  {filteredFaqs.length > 0 ? (
                    filteredFaqs.map((f, i) => (
                      <FaqItem
                        key={f.q}
                        faq={f}
                        index={i}
                        initiallyOpen={!faqHasBeenSearched && i === 0}
                      />
                    ))
                  ) : (
                    <div className="faq-empty-state" role="status">
                      <span aria-hidden="true">⌕</span>
                      <p>{t('No answers match that search just yet.')}</p>
                      <button className="faq-empty-link" type="button" onClick={() => go('contact')}>{t('Ask the AJR team')} <ArrowRight size={15} aria-hidden="true" /></button>
                    </div>
                  )}
                </div>
                {filteredFaqs.length > 0 && (
                  <div className="faq-contact-row">
                    <span className="faq-contact-sprout" aria-hidden="true">✦</span>
                    <p><strong>{t('Still curious?')}</strong> {t('Our people love a thoughtful question.')}</p>
                    <button type="button" onClick={() => go('contact')}>{t('Talk to us')} <ArrowRight size={15} aria-hidden="true" /></button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </Reveal>

        {/* Newsletter CTA */}
        <Reveal>
          <section className="home-cta">
            <div className="manifesto-inner">
              <p className="eyebrow">{t('Stay Connected')}</p>
              <h2>
                <span className="sr-only">{t('First taste of something good.')}</span>
                <span className="letter-heading" aria-hidden="true">
                  <LetterReveal text={t('First taste of')} />
                  <br />
                  <em><LetterReveal text={t('something good.')} /></em>
                </span>
              </h2>
              <p>
                {t('Subscribe to receive private harvest releases, seasonal box discounts, and natural health guides delivered to your inbox.')}
              </p>
              <div className="cta-newsletter">
                <input
                  placeholder={t('Enter your email address')}
                  aria-label={t('Email address')}
                />
                <button
                  className="button button-light"
                  onClick={() => go('contact')}
                >
                  {t('Subscribe')} <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </section>
        </Reveal>
      </main>
    </>
  )
}

function ProductCard({
  product,
  onSelect,
  addToCart,
  toggleWish,
  wished,
  outOfStock,
}: {
  product: Product
  onSelect: (product: Product) => void
  addToCart: (p: Product, qty?: number, origin?: HTMLElement | null) => FlightLaunchResult
  toggleWish: (p: Product, origin?: HTMLElement | null) => void
  wished: boolean
  outOfStock?: boolean
}) {
  const { t } = useLanguage()
  const [weight, setWeight] = useState<Weight>(product.selectedWeight || defaultWeightFor(product))
  const [variety, setVariety] = useState<string>(product.selectedVariety || product.varieties?.[0]?.name || '')
  const withVariety = product.varieties?.length ? { ...product, selectedVariety: variety } : product
  const selectedProduct = productAtWeight(productWithSelectedVarietyImage(withVariety), weight)
  return (
    <article className="product-card product-card--catalogue" style={outOfStock ? { opacity: 0.75 } : undefined}>
      <button type="button" className="product-card-link" onClick={() => onSelect(selectedProduct)} aria-label={`${t('View details')}: ${t(product.name)}`} />
      <div className={`product-photo ${product.color}`}>
        <img src={selectedProduct.image} alt={t(product.name)} />
        <button
          type="button"
          className={wished ? 'wish wished' : 'wish'}
          onClick={(event) => {
            event.stopPropagation()
            toggleWish(product, event.currentTarget)
          }}
          aria-label={wished ? `${t('Remove item')}: ${t(product.name)}` : `${t('Add to wishlist')}: ${t(product.name)}`}
          aria-pressed={wished}
        >
          <Heart size={18} fill={wished ? 'currentColor' : 'none'} />
        </button>
        <span className="product-tag">{t(product.type)}</span>
        {outOfStock && <span className="stock-note">{t('Out of stock')}</span>}
      </div>
      <div className="product-card-copy">
        <div className="product-card-title-row">
          <div className="product-name-pair">
            <h3 className="product-name">{t(product.name)}</h3>
          </div>
          <span className="product-view-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
        </div>
        <div className="product-card-meta">
          <span className="product-rating"><Star size={13} fill="currentColor" aria-hidden="true" /> {product.rating || 4.9} <span>({product.reviewsCount || 80})</span></span>
          <span className="product-weight">{weight}</span>
        </div>
        {product.varieties && product.varieties.length > 1 ? (
          <label className="pack-select-label">
            <span>{t('Variety')}</span>
            <select
              value={variety}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setVariety(event.target.value)}
              aria-label={`${t('Variety')}: ${t(product.name)}`}
            >
              {product.varieties.map((option) => <option key={option.name} value={option.name}>{t(option.name)}</option>)}
            </select>
          </label>
        ) : <div className="pack-select-placeholder" aria-hidden="true" />}
        <label className="pack-select-label">
          <span>{t('Pack size')}</span>
          <select
            value={weight}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setWeight(event.target.value as Weight)}
            aria-label={`${t('Pack size')}: ${t(product.name)}`}
          >
            {weightsForProduct(product).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="product-card-footer">
          <div className="product-price"><span>{t('From')}</span><strong>{formatCurrency(selectedProduct.price)}</strong></div>
        <button
          type="button"
          className="quick-add"
          disabled={outOfStock}
          title={outOfStock ? t('Out of stock') : t('Add to bag')}
          onClick={(event) => {
            event.stopPropagation()
            if (!outOfStock) addToCart(selectedProduct, 1, event.currentTarget)
          }}
        >
          {outOfStock ? t('Out of stock') : <>{t('Add')} <Plus size={15} aria-hidden="true" /></>}
        </button>
        </div>
      </div>
    </article>
  )
}

function About({ go }: { go: (v: View) => void }) {
  const { t } = useLanguage()
  return (
    <main className="about-page">
      {/* Hero Header */}
      <section className="page-hero about-hero">
        <div className="about-hero-atmosphere" aria-hidden="true">
          <span className="about-hero-orbit about-hero-orbit-one" />
          <span className="about-hero-orbit about-hero-orbit-two" />
          <span className="about-hero-sprout" />
        </div>
        <span className="about-hero-index" aria-hidden="true">{t('01 / HERITAGE')}</span>
        <p className="eyebrow">
          <Leaf size={14} /> {t('Our Heritage & Sourcing Philosophy')}
        </p>
        <h1>
          <LetterReveal text={t('Rooted in nature.')} /><br />
          <em><LetterReveal text={t('Crafted for living.')} /></em>
        </h1>
        <p>
          We are on a mission to redefine everyday snacking — bringing unbleached, single-origin dry fruits and nuts straight from accredited family orchards to your home.
        </p>
      </section>

      {/* Origin Story Split */}
      <section className="about-split section about-story">
        <Reveal className="about-story-media-reveal">
          <div className="about-image">
            <img
              src="/founding-story-nuts-and-dried-fruits.png"
              alt="A premium spread of nuts and dried fruits"
            />
          </div>
        </Reveal>
        <div className="about-copy">
          <p className="eyebrow">{t('The AJR Founding Story')}</p>
          <h2>{t('There is magic in an honest handful.')}</h2>
          <p>
            AJR began at a family table in Virudhunagar, Tamil Nadu. We noticed that most store-bought dry fruits were dry, over-bleached with sulfur, or sat in open warehouses for over a year before reaching customers.
          </p>
          <p>
            We set out to change that by establishing direct fair-trade relationships with orchards in Kashmir, California, Mangalore, and Kerman. By packing in small weekly batches with zero chemical glazes, we preserve the natural essential oils and authentic crunch that nature intended.
          </p>
          <button className="button button-dark" onClick={() => go('product')}>
            {t('Explore Our Collection')} <ArrowRight size={17} />
          </button>
        </div>
      </section>

      {/* Interactive Global Farm Origins Section */}
      <Reveal>
        <FarmOrigins go={go} />
      </Reveal>

      {/* Quality Comparison Table Section */}
      <Reveal>
        <QualityComparison />
      </Reveal>

      {/* Quote Banner */}
      <Reveal className="about-quote-reveal">
        <section className="about-quote">
          <p>{t('“The finest things in life are often the simplest: good ingredients, good company, and time to enjoy both.”')}</p>
          <span>{t('— The AJR Family Table')}</span>
        </section>
      </Reveal>

      {/* Core Principles */}
      <section className="values section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t('Uncompromising Standards')}</p>
            <h2>{t('6 Purity Commitments')}</h2>
          </div>
          <p className="section-intro">{t('From harvest selection to eco packaging, we keep our standards non-negotiable.')}</p>
        </div>
        <div className="value-grid">
          <Value
            delay={0}
            icon={<Leaf />}
            title={t('100% Unbleached')}
            text={t('Zero chlorine, no sulfur dioxide, and no artificial color processing. Just natural shade.')}
          />
          <Value
            delay={90}
            icon={<Sparkles />}
            title={t('Nitrogen-Flush Packed')}
            text={t('Sealed in small batches weekly to lock in crispness and protect natural Vitamin E & ALA.')}
          />
          <Value
            delay={180}
            icon={<ShieldCheck />}
            title={t('Direct Farmer Trade')}
            text={t('Fair trade contracts that pay 25% above market rates directly to single-origin growers.')}
          />
          <Value
            delay={270}
            icon={<Award />}
            title={t('Optically Size Graded')}
            text={t('Only hand-selected Jumbo W240 cashews & Mammoth Kashmiri walnuts make the cut.')}
          />
          <Value
            delay={360}
            icon={<Heart />}
            title={t('Zero Oil Glazes')}
            text={t('No cheap palm oil coats, no glucose weight additives. Pure dry roasted goodness.')}
          />
          <Value
            delay={450}
            icon={<Gift />}
            title={t('Eco Jute & Glass')}
            text={t('Sustainable, zero-plastic packaging options designed for reuse and lower carbon footprint.')}
          />
        </div>
      </section>

      {/* Heritage Timeline Section */}
      <Reveal>
        <section className="timeline-section">
          <div className="section-head text-center">
            <div>
              <p className="eyebrow justify-center">{t('Our Sourcing Journey')}</p>
              <h2>
                {t('Milestones of')} <em>{t('Goodness')}</em>
              </h2>
            </div>
          </div>
          <div className="timeline-grid">
            <div className="timeline-card">
              <span className="timeline-year">2021</span>
              <h4>{t('The Family Table')}</h4>
              <p>Founded in Virudhunagar, Tamil Nadu with a simple commitment to source clean, unbleached California almonds and dates for friends &amp; family.</p>
            </div>
            <div className="timeline-card">
              <span className="timeline-year">2022</span>
              <h4>{t('Kashmir & Iran Direct')}</h4>
              <p>Partnered with Shopian walnut growers and Kerman pistachio orchards for direct single-origin harvest imports.</p>
            </div>
            <div className="timeline-card">
              <span className="timeline-year">2023</span>
              <h4>{t('Zero-Plastic Initiative')}</h4>
              <p>Eliminated single-use plastics by introducing woven jute pouches, reusable glass jars, and laser-engraved wooden boxes.</p>
            </div>
            <div className="timeline-card">
              <span className="timeline-year">2026</span>
              <h4>{t('28,000+ Happy Homes')}</h4>
              <p>Now delivering fresh harvest dry fruits and custom festive hampers to over 28,000 households across India.</p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Founders Section */}
      <Reveal>
        <section className="founders-grid">
          <div className="founders-img-card">
            <img src="/dates-apricots.png" alt="AJR Master Tasters & Farm Sourcing Team" />
          </div>
          <div>
            <p className="eyebrow">{t('Master Taster Guarantee')}</p>
            <h2 className="text-4xl font-serif mb-4">{t('“If it isn\'t crisp, sweet, and pure, it never leaves our door.”')}</h2>
            <p className="text-muted-foreground mb-4">
              Every single batch of almonds, cashews, dates, and walnuts is sampled by our master quality tasters before being approved for nitrogen packaging.
            </p>
            <p className="text-muted-foreground mb-6">
              We stand behind every pouch with our 100% Taste &amp; Freshness Money-Back Guarantee.
            </p>
            <button className="button button-dark" onClick={() => go('product')}>
              {t('Shop Fresh Harvest Now')} <ArrowRight size={17} />
            </button>
          </div>
        </section>
      </Reveal>

      {/* CTA Section */}
      <section className="about-cta">
        <p className="eyebrow">{t('Bring Goodness Home')}</p>
        <h2>
          <LetterReveal text={t('Your next favorite')} /><br />
          <em><LetterReveal text={t('is waiting.')} /></em>
        </h2>
        <button className="button button-light" onClick={() => go('product')}>
          {t('Explore Pantry')} <ArrowRight size={17} />
        </button>
      </section>
    </main>
  )
}

function Value({ icon, title, text, delay = 0 }: any) {
  return (
    <Reveal className="about-value-reveal" delay={delay}>
      <article className="value">
        <div className="value-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{text}</p>
      </article>
    </Reveal>
  )
}

function Shop({
  products: list,
  allTypes,
  category,
  setCategory,
  setSelected,
  go,
  addToCart,
  toggleWish,
  wishlist,
  isOutOfStock,
}: any) {
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'bestselling' | 'price-low' | 'price-high' | 'name'>('bestselling')
  const types: string[] = Array.isArray(allTypes) ? allTypes : []
  const preferredOrder = ['Almonds', 'Cashews', 'Pistachios', 'Walnuts', 'Figs', 'Raisins', 'Dates', 'Prunes', 'Seeds', 'Spices', 'Berries', 'Tropical Fruit', 'Stone Fruit']
  const filterChips: string[] = [
    'All',
    ...preferredOrder.filter((t) => types.includes(t)),
    ...types.filter((t) => !preferredOrder.includes(t)),
  ]

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    const matches = query
      ? list.filter((product: Product) =>
          [
            product.name,
            product.type,
            product.origin,
            product.detail,
            ...(product.nutrients || []),
            t(product.name),
            t(product.type),
            t(product.origin || ''),
            t(product.detail),
            ...(product.nutrients || []).map((nutrient) => t(nutrient)),
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(query)
        )
      : [...list]

    return matches.sort((a: Product, b: Product) => {
      if (sortBy === 'price-low') return a.price - b.price
      if (sortBy === 'price-high') return b.price - a.price
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return 0
    })
  }, [list, searchQuery, sortBy, t])

  const resetFilters = () => {
    setSearchQuery('')
    setSortBy('bestselling')
    setCategory('All')
  }

  const resultLabel = `${visibleProducts.length} ${t(visibleProducts.length === 1 ? 'harvest found' : 'harvests found')}`

  return (
    <main className="shop-page">
      <section className="shop-heading shop-hero">
        <div className="shop-hero-glow" aria-hidden="true">
          <span className="shop-hero-orb shop-hero-orb-one" />
          <span className="shop-hero-orb shop-hero-orb-two" />
          <span className="shop-hero-sprig shop-hero-sprig-one" />
          <span className="shop-hero-sprig shop-hero-sprig-two" />
        </div>
        <div className="shop-heading-copy">
          <p className="shop-harvest-badge"><Sparkles size={13} aria-hidden="true" /> {t('Fresh from the harvest')}</p>
          <p className="eyebrow">{t('The AJR Pantry / Full Collection')}</p>
          <h1>
            {t('Find your')} <em>{t('everyday')}</em>
            <br />
            {t('superfoods.')}
          </h1>
        </div>
        <div className="shop-heading-note">
          <span className="shop-note-leaf"><Leaf size={18} aria-hidden="true" /></span>
          <p>{t('100% natural, Grade A almonds, cashews, walnuts, dates, and festive hampers packed for peak freshness.')}</p>
          <span>{t('Directly sourced · Packed in small batches')}</span>
        </div>
      </section>

      <section className="shop-discovery" aria-label={t('Find products')}>
        <div className="shop-search-panel">
          <div className="shop-search-heading">
            <p className="eyebrow">{t('Discover your pantry')}</p>
            <p>{t('Search by ingredient, origin, category, or a craving.')}</p>
          </div>
          <label className="shop-search-box">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">{t('Search the collection')}</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('Try “Kashmir”, “protein”, or “berries”')}
              aria-label={t('Search the collection')}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label={t('Clear product search')}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        <div className="shop-filter-rail" role="region" aria-label={t('Filter by product category')}>
          <div className="shop-filter-label"><Leaf size={14} aria-hidden="true" /> {t('Browse the harvest')}</div>
          <div className="filters">
            {filterChips.map((c) => (
              <button
                className={category === c ? 'selected' : ''}
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
              >
                {t(c)}
              </button>
            ))}
          </div>
        </div>

        <div className="shop-results-bar">
          <p role="status" aria-live="polite">
            <strong>{resultLabel}</strong>
            <span>{category === 'All' ? t('across the AJR collection') : `${t('in')} ${t(category)}`}</span>
          </p>
          <label className="shop-sort-control">
            <span>{t('Sort collection')}</span>
            <div>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label={t('Sort products')}>
                <option value="bestselling">{t('Bestselling')}</option>
                <option value="price-low">{t('Price: low to high')}</option>
                <option value="price-high">{t('Price: high to low')}</option>
                <option value="name">{t('Name: A–Z')}</option>
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
          </label>
        </div>

        {visibleProducts.length > 0 ? (
          <section className="shop-grid section" aria-label={t('Product results')}>
            {visibleProducts.map((p: Product, index: number) => (
              <div className="shop-card-entry" key={p.id} style={{ animationDelay: `${Math.min(index, 9) * 55}ms` }}>
                <ProductCard
                  product={p}
                  onSelect={(next) => {
                    setSelected(next)
                    go('detail')
                  }}
                  addToCart={addToCart}
                  toggleWish={toggleWish}
                  wished={wishlist.some((w: Product) => w.id === p.id)}
                  outOfStock={isOutOfStock ? isOutOfStock(p) : false}
                />
              </div>
            ))}
          </section>
        ) : (
          <section className="shop-empty-state" aria-live="polite">
            <span className="shop-empty-icon"><Search size={24} aria-hidden="true" /></span>
            <p className="eyebrow">{t('No exact harvest match')}</p>
            <h2>{t('Nothing is hiding here.')}</h2>
            <p>{t('Try a different ingredient or return to the full collection to discover more.')}</p>
            <button type="button" className="button button-dark" onClick={resetFilters}>{t('Reset all filters')} <ArrowRight size={16} aria-hidden="true" /></button>
          </section>
        )}
      </section>
    </main>
  )
}

function Detail({ product, quantity, setQuantity, addToCart, toggleWish, wished, go, outOfStock }: any) {
  const { language, t } = useLanguage()
  const [weight, setWeight] = useState<Weight>(product.selectedWeight || defaultWeightFor(product))
  const [variety, setVariety] = useState<string>(product.selectedVariety || product.varieties?.[0]?.name || '')

  useEffect(() => {
    setWeight(product.selectedWeight || defaultWeightFor(product))
    setVariety(product.selectedVariety || product.varieties?.[0]?.name || '')
  }, [product.id, product.selectedWeight, product.selectedVariety])

  const withVariety = product.varieties?.length ? { ...product, selectedVariety: variety } : product
  const weightedProduct = productAtWeight(productWithSelectedVarietyImage(withVariety), weight)
  return (
    <main className="detail-page">
      <button className="back-link" onClick={() => go('product')}>
        <ChevronLeft size={16} /> {t('Back to collection')}
      </button>
      <section className="detail-grid">
        <div className={`detail-image ${product.color}`}>
          <img src={weightedProduct.image} alt={t(product.name)} />
          <span className="detail-label">{t('AJR / NATURAL HARVEST')}</span>
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{t(product.type)} · {productOriginForDisplay(product, language, t)}</p>
          <div className="detail-product-name">
            <h1>{t(product.name)}</h1>
          </div>
          <div className="rating">
            ★★★★★ <span>{product.rating || 4.9} / 5 · {product.reviewsCount || 80} {t('verified reviews')}</span>
          </div>
          <p className="detail-description">{productDetailForDisplay(product, language, t)}</p>
          
          {product.nutrients && (
            <div className="flex gap-2 my-4 flex-wrap">
              {product.nutrients.map((n: string) => (
                <span key={n} className="bg-emerald-100 text-emerald-900 font-medium text-xs px-3 py-1 rounded-full">
                  ✓ {t(n)}
                </span>
              ))}
            </div>
          )}

          <div className="detail-divider" />
          <div className="detail-price-row">
            <p className="weighted-price">{formatCurrency(weightedProduct.price)}</p>
            <span>{t('Price for')} {product.varieties?.length ? `${t(variety)} · ` : ''}{weight}</span>
          </div>
          {product.varieties && product.varieties.length > 1 && (
            <label className="pack-select-label detail-pack-selector">
              <span>{t('Variety')}</span>
              <select value={variety} onChange={(event) => setVariety(event.target.value)} aria-label={`${t('Variety')}: ${t(product.name)}`}>
                {product.varieties.map((option: Variety) => <option key={option.name} value={option.name}>{t(option.name)}</option>)}
              </select>
            </label>
          )}
          <label className="pack-select-label detail-pack-selector">
              <span>{t('Pack size')}</span>
            <select value={weight} onChange={(event) => setWeight(event.target.value as Weight)} aria-label={`${t('Pack size')}: ${t(product.name)}`}>
              {weightsForProduct(product).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <p className="price">{formatCurrency(product.price)}</p>
          <p className="shipping">
            <Check size={15} /> {t('Free express shipping on orders over ₹999')}
          </p>
          <div className="quantity-row">
            <div className="quantity">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                <Minus size={15} />
              </button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)}>
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button button-dark grow"
              disabled={outOfStock}
              onClick={(event) => {
                if (outOfStock) return
                const flightStatus = addToCart(weightedProduct, quantity, event.currentTarget)
                // A repeated press while a confirmation is still in flight is
                // intentionally ignored for navigation. It can never pull the
                // customer away from the product before the first flight lands.
                if (flightStatus === 'locked') return
                // Keep the successful flight visible before switching views. The
                // cart state itself is still updated synchronously above.
                window.setTimeout(() => go('cart'), flightStatus === 'started' ? 575 : 0)
              }}
            >
              {outOfStock ? t('Out of stock') : <>{t('Add to bag')} <ShoppingBag size={17} /></>}
            </button>
            <button
              className={wished ? 'detail-wish wished' : 'detail-wish'}
              onClick={(event) => toggleWish(product, event.currentTarget)}
              aria-label={t('Wishlist')}
            >
              <Heart fill={wished ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="accordions">
            <details open>
              <summary>
                {t('Storage & Shelf Life')} <Plus size={16} />
              </summary>
              <p>{t('Store in a cool, dry place in an airtight container. Refrigeration after opening extends crunch up to 9 months.')}</p>
            </details>
            <details>
              <summary>
                {t('Nutritional Breakdown')} <Plus size={16} />
              </summary>
              <p>Rich in healthy monounsaturated fats, dietary fiber, plant protein, and essential micronutrients.</p>
            </details>
          </div>
        </div>
      </section>
    </main>
  )
}

function Contact({ sent, setSent }: any) {
  const { t } = useLanguage()
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [activeFormTab, setActiveFormTab] = useState<'retail' | 'gifting' | 'corporate' | 'press'>('retail')
  const [formNotes, setFormNotes] = useState('')

  const handleFillCorporateForm = (data: { tier: string; qty: number; total: number }) => {
    setActiveFormTab('corporate')
    setFormNotes(
      t('Interested in {qty} units of {tier}. Estimated total: ₹{total}. Please send official deck & sample box.')
        .replace('{qty}', String(data.qty))
        .replace('{tier}', t(data.tier))
        .replace('{total}', data.total.toLocaleString())
    )
    window.scrollTo({ top: document.querySelector('.contact-form-section')?.getBoundingClientRect().top ? window.scrollY + (document.querySelector('.contact-form-section')?.getBoundingClientRect().top || 0) - 100 : 0, behavior: 'smooth' })
  }

  return (
    <main className="contact-page">
      {/* Contact Hero Header */}
      <section className="contact-hero">
        <div className="contact-hero-atmosphere" aria-hidden="true">
          <span className="contact-orbit contact-orbit-one" />
          <span className="contact-orbit contact-orbit-two" />
          <span className="contact-stem contact-stem-one" />
          <span className="contact-stem contact-stem-two" />
          <span className="contact-desk-mark">AJR<br />CONCIERGE</span>
        </div>
        <p className="eyebrow">
          <MessageCircle size={14} /> {t('Concierge & Customer Care')}
        </p>
        <h1>
          {t('We would love')}<br />
          <em>{t('to hear from you.')}</em>
        </h1>
        <p>
          Whether you have a product question, need custom festival hampers, or want to discuss bulk corporate gifting, our human team replies promptly.
        </p>
        <div className="contact-chips">
          <a className="chip" href="mailto:hello@ajrnature.com">
            <Mail size={15} /> hello@ajrnature.com
          </a>
          <a className="chip" href="tel:+919876543210">
            <Phone size={15} /> +91 98765 43210
          </a>
          <a
            className="chip"
            href="https://wa.me/919876543210"
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={15} /> {t('WhatsApp Concierge (Fastest)')}
          </a>
        </div>
        <p className="contact-hero-assurance"><span aria-hidden="true">✦</span> A personal reply, never an automated queue.</p>
      </section>

      {/* Quick Channels Cards */}
      <section className="quick-grid section">
        <div className="quick-card">
          <span className="quick-icon">
            <MessageCircle size={22} />
          </span>
          <h3>{t('WhatsApp Support')}</h3>
          <p>{t('Instant support for order tracking, gift guidance & quick recommendations.')}</p>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full w-fit mb-2">
            ⚡ Avg Reply: ~5 Mins
          </span>
          <a
            className="text-link"
            href="https://wa.me/919876543210"
            target="_blank"
            rel="noreferrer"
          >
            {t('Open WhatsApp')} <ArrowRight size={16} />
          </a>
        </div>

        <div className="quick-card">
          <span className="quick-icon">
            <Mail size={22} />
          </span>
          <h3>{t('Email Desk')}</h3>
          <p>{t('For custom hampers, corporate gifting decks, and retail wholesale inquiries.')}</p>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full w-fit mb-2">
            ✉ Avg Reply: &lt; 2 Hours
          </span>
          <a className="text-link" href="mailto:hello@ajrnature.com">
            {t('Write Email')} <ArrowRight size={16} />
          </a>
        </div>

        <div className="quick-card">
          <span className="quick-icon">
            <Phone size={22} />
          </span>
          <h3>{t('Studio Call Desk')}</h3>
          <p>{t('Prefer a human voice? Call our Virudhunagar flagship studio directly.')}</p>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full w-fit mb-2">
            📞 Mon–Sat 9:30am–6:30pm IST
          </span>
          <a className="text-link" href="tel:+919876543210">
            {t('Call +91 98765 43210')} <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* Interactive Studio Visit & Location Guide Component */}
      <Reveal>
        <StudioLocation />
      </Reveal>

      {/* Tabbed Interactive Contact Form Section */}
      <Reveal>
        <section className="contact-grid section contact-form-section live-enquiry-section">
          <div className="contact-info live-enquiry-intro">
            <div className="live-enquiry-content">
              <div className="live-enquiry-status" role="status">
                <span className="live-status-dot" aria-hidden="true" />
                {t('Enquiry desk online')}
              </div>
              <p className="eyebrow"><MessageCircle size={14} /> {t('AJR Live Enquiry Desk')}</p>
              <h2>{t('Tell us what')}<br /><em>{t('you need.')}</em></h2>
              <p className="live-enquiry-copy">
                {t('Product help, gifting plans, bulk orders, and partnerships — send one enquiry and our team receives it instantly.')}
              </p>
              <div className="live-enquiry-steps" aria-label="How the enquiry desk works">
                <div><span>01</span><p>{t('Choose your enquiry type.')}</p></div>
                <div><span>02</span><p>{t('Share the details that matter.')}</p></div>
                <div><span>03</span><p>{t('Receive a personal reply within business hours.')}</p></div>
              </div>
              <p className="live-enquiry-note"><ShieldCheck size={15} /> {t('Private, secure, and read by a real AJR team member.')}</p>
            </div>
            <div>
              <p className="eyebrow">{t('Direct Contact Information')}</p>
              <h3>hello@ajrnature.com</h3>
              <p>Mon–Sat, 9:30am–6:30pm IST</p>
            </div>
            <div>
              <p className="eyebrow">{t('Wholesale & Bulk Orders')}</p>
              <h3>trade@ajrnature.com</h3>
              <p>Custom corporate gifts and retail partnerships.</p>
            </div>
            <div>
              <p className="eyebrow">{t('Flagship Studio')}</p>
              <h3>AJR Essence of Nature</h3>
              <p>
                <MapPin size={13} /> 14, TC Godown Street, Vadiyan St, Virudhunagar, Tamil Nadu 626001
              </p>
            </div>

            <div className="bg-emerald-900 text-cream p-6 rounded-2xl border border-emerald-700 mt-4">
              <h4 className="font-serif text-xl mb-2 text-lime">{t('Human Support Promise')}</h4>
              <p className="text-xs text-emerald-200 leading-relaxed">
                {t('When you contact AJR, a real team member reads and replies to your message. No bots, no mystery queues.')}
              </p>
            </div>
          </div>

          <div className="contact-form-wrapper">
            <div className="live-enquiry-panel-head">
              <div>
                <span>{t('LIVE ENQUIRY')}</span>
                <h3>{t('How can we help?')}</h3>
              </div>
              <p><span className="live-status-dot" aria-hidden="true" /> {t('Sent directly to our team')}</p>
            </div>
            {/* Form Category Selector */}
            <div className="contact-tab-switcher">
              <button
                type="button"
                className={`contact-tab-btn ${activeFormTab === 'retail' ? 'active' : ''}`}
                onClick={() => setActiveFormTab('retail')}
              >
                {t('Product & Retail Support')}
              </button>
              <button
                type="button"
                className={`contact-tab-btn ${activeFormTab === 'gifting' ? 'active' : ''}`}
                onClick={() => setActiveFormTab('gifting')}
              >
                {t('Custom Festive Hampers')}
              </button>
              <button
                type="button"
                className={`contact-tab-btn ${activeFormTab === 'corporate' ? 'active' : ''}`}
                onClick={() => setActiveFormTab('corporate')}
              >
                {t('Corporate Bulk Inquiry')}
              </button>
              <button
                type="button"
                className={`contact-tab-btn ${activeFormTab === 'press' ? 'active' : ''}`}
                onClick={() => setActiveFormTab('press')}
              >
                {t('Press & Collaborations')}
              </button>
            </div>

            <form
              className="contact-form"
              onSubmit={async (e) => {
                e.preventDefault()
                setSendError('')
                setSending(true)
                try {
                  const form = e.currentTarget
                  const fd = new FormData(form)
                  const get = (k: string) => String(fd.get(k) || '').trim()
                  const res = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      customer: get('name'),
                      phone: get('phone'),
                      email: get('email'),
                      subject: activeFormTab,
                      detail: get('notes') || formNotes,
                    }),
                  })
                  if (!res.ok) throw new Error('Send failed')
                  setSent(true)
                } catch {
                  setSendError('Could not send. Run supabase/schema.sql first, then retry.')
                } finally {
                  setSending(false)
                }
              }}
            >
              {sent ? (
                <div className="success">
                  <div>
                    <Check />
                  </div>
                  <h2>Message Received!</h2>
                  <p>Thank you for reaching out. A real person is reviewing your inquiry — we will be in touch within 1 working day.</p>
                  <button
                    type="button"
                    className="text-link mt-4"
                    onClick={() => setSent(false)}
                  >
                    Send another message <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-4">
                    <label className="flex-1">
                      {t('Your Name')}
                      <input name="name" required placeholder={t('Full name')} />
                    </label>
                    <label className="flex-1">
                      {t('Phone / WhatsApp')}
                      <input name="phone" required type="tel" placeholder="+91 98XXX XXXXX" />
                    </label>
                  </div>

                  <label>
                    {t('Email address')}
                    <input name="email" required type="email" placeholder="you@example.com" />
                  </label>

                  {activeFormTab === 'corporate' && (
                    <div className="flex gap-4 my-2">
                      <label className="flex-1">
                        {t('Company / Organization Name')}
                        <input required placeholder="Acme Inc." />
                      </label>
                      <label className="flex-1">
                        {t('Estimated Quantity')}
                        <input placeholder="e.g. 50 hampers" />
                      </label>
                    </div>
                  )}

                  {activeFormTab === 'gifting' && (
                    <div className="flex gap-4 my-2">
                      <label className="flex-1">
                        {t('Event / Festival Date')}
                        <input type="date" />
                      </label>
                      <label className="flex-1">
                        {t('Packaging Style Preference')}
                        <select defaultValue="Wood Box">
                          <option>{t('Royal Wooden Chest')}</option>
                          <option>{t('Festive Gold Foil Box')}</option>
                          <option>{t('Eco Jute Pouch')}</option>
                        </select>
                      </label>
                    </div>
                  )}

                  <label>
                    {t('Message / Special Requests')}
                    <textarea
                      name="notes"
                      required
                      rows={5}
                      placeholder={t('Tell us how we can help...')}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                    />
                  </label>

                  {sendError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{sendError}</p>}
                  <button className="button button-dark full" type="submit" disabled={sending}>
                    {sending ? 'Sending…' : <>Send Inquiry <ArrowRight size={17} /></>}
                  </button>
                  <p className="form-note">
                    <Check size={14} /> {t('100% Confidential. Replies within 2 hours during business hours.')}
                  </p>
                </>
              )}
            </form>
          </div>
        </section>
      </Reveal>
    </main>
  )
}

function Cart({ cart, setCart, subtotal, go, session }: any) {
  const { t } = useLanguage()
  const [showCheckout, setShowCheckout] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')
  const [placedOrder, setPlacedOrder] = useState<any>(null)
  // One key per checkout attempt: double-clicking Place Order can never insert
  // a second order (the API returns the first one instead).
  const idempotencyKey = useRef('')

  const shipping = subtotal >= 999 || subtotal === 0 ? 0 : 99
  const total = subtotal + shipping

  // Prefill from the signed-in account without clobbering anything already typed.
  useEffect(() => {
    if (!session) return
    setName((current) => current || session.name || '')
    setEmail((current) => current || session.email || '')
    setPhone((current) => current || session.phone || '')
  }, [session])

  const placeOrder = async (e: any) => {
    e.preventDefault()
    setError('')
    if (cart.length === 0) return
    if (!session) {
      setError('Please log in to place your order.')
      return
    }
    if (placing) return
    if (!idempotencyKey.current) {
      try {
        idempotencyKey.current = crypto.randomUUID()
      } catch {
        idempotencyKey.current = `ajr-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
    }
    setPlacing(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          customer_name: name,
          email,
          phone,
          address,
          payment_method: paymentMethod,
          payment_status: 'Pending',
          idempotency_key: idempotencyKey.current,
          items: cart.map((i: any) => ({
            id: i.product.id,
            name: i.product.name,
            type: i.product.type,
            variety: i.product.selectedVariety || '',
            price: i.product.price,
            quantity: i.quantity,
            image: i.product.image,
            selectedWeight: i.product.selectedWeight || '250 g',
          })),
          subtotal,
          shipping,
          total,
          channel: 'Online',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to place order.')
      const order = data.order

      // The cart is ONLY touched after the order row exists, and only the lines
      // that actually made it into the order are taken out of the bag.
      const orderedKeys = new Set<string>(
        ((order?.items || []) as any[]).map(
          (item) => `${item.id}|${item.selectedWeight || '250 g'}|${item.variety || ''}`
        )
      )
      setCart((lines: any[]) =>
        lines.filter(
          (line: any) =>
            !orderedKeys.has(
              `${line.product.id}|${line.product.selectedWeight || '250 g'}|${line.product.selectedVariety || ''}`
            )
        )
      )

      idempotencyKey.current = ''
      setPlacedOrder(order)
      setShowCheckout(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to place order.')
    } finally {
      setPlacing(false)
    }
  }

  if (placedOrder) {
    return (
      <main className="cart-page section">
        <div className="empty">
          <span className="wishlist-icon"><Check size={34} /></span>
          <h2>{t('Order placed! Thank you,')} {placedOrder.customer_name}.</h2>
          <p>{t('Your order')} <strong>{placedOrder.order_number}</strong> {t('for')} ₹{placedOrder.total} {t('is confirmed. We have sent details to')} {placedOrder.email}.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button className="button button-dark" onClick={() => { setPlacedOrder(null); go('orders') }}>
              {t('View My Orders')} <ArrowRight size={17} />
            </button>
            <button className="button button-light" onClick={() => { setPlacedOrder(null); go('product') }}>
              {t('Continue Shopping')}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="cart-page section">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">{t('Your Bag')}</p>
          <h1>
            {t('Good things,')}<br />
            <em>{t('coming your way.')}</em>
          </h1>
        </div>
        <span>
          {cart.length} {t(cart.length === 1 ? 'item' : 'items')}
        </span>
      </div>
      {cart.length === 0 ? (
        <div className="empty">
          <ShoppingBag size={34} />
          <h2>{t('Your bag is waiting.')}</h2>
          <p>{t('Fill it with fresh dry fruits, nuts and healthy superfood snacks.')}</p>
          <button className="button button-dark" onClick={() => go('product')}>
            {t('Explore Collection')} <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map((item: any) => (
              <div className="cart-item" key={`${item.product.id}-${item.product.selectedWeight || '250 g'}-${item.product.selectedVariety || ''}`}>
                <img src={item.product.image} alt={t(item.product.name)} />
                <div className="cart-item-info">
                  <h3>{t(item.product.name)}</h3>
                  <p>{t(item.product.type)}{item.product.selectedVariety ? ` · ${t(item.product.selectedVariety)}` : ''} · {item.product.selectedWeight || '250 g'}</p>
                  <div className="item-bottom">
                    <div className="quantity small">
                      <button
                        onClick={() =>
                          setCart(
                            cart.map((i: any) =>
                              i.product.id === item.product.id &&
                              i.product.selectedWeight === item.product.selectedWeight &&
                              (i.product.selectedVariety || '') === (item.product.selectedVariety || '')
                                ? { ...i, quantity: Math.max(1, i.quantity - 1) }
                                : i
                            )
                          )
                        }
                      >
                        <Minus size={13} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() =>
                          setCart(
                            cart.map((i: any) =>
                              i.product.id === item.product.id &&
                              i.product.selectedWeight === item.product.selectedWeight &&
                              (i.product.selectedVariety || '') === (item.product.selectedVariety || '')
                                ? { ...i, quantity: i.quantity + 1 }
                                : i
                            )
                          )
                        }
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <button
                      className="remove"
                      onClick={() =>
                        setCart(
                          cart.filter(
                            (i: any) =>
                              i.product.id !== item.product.id ||
                              i.product.selectedWeight !== item.product.selectedWeight ||
                              (i.product.selectedVariety || '') !== (item.product.selectedVariety || '')
                          )
                        )
                      }
                    >
                      {t('Remove')}
                    </button>
                  </div>
                </div>
                <strong>₹{item.product.price * item.quantity}</strong>
              </div>
            ))}
          </div>
          <aside className="summary">
            <h3>{t('Order Summary')}</h3>
            <div>
              <span>{t('Subtotal')}</span>
              <strong>₹{subtotal}</strong>
            </div>
            <div>
              <span>{t('Shipping')}</span>
              <span>{shipping === 0 ? t('FREE') : `₹${shipping}`}</span>
            </div>
            <div className="summary-total">
              <span>{t('Total')}</span>
              <strong>₹{total}</strong>
            </div>
            {!showCheckout ? (
              session ? (
                <button className="button button-dark full" onClick={() => setShowCheckout(true)}>
                  {t('Proceed to Checkout')} <ArrowRight size={17} />
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
                    {t('Sign in so we can attach this order to your account.')}
                  </p>
                  <button
                    className="button button-dark full"
                    onClick={() => {
                      window.location.href = '/login'
                    }}
                  >
                    {t('Login to checkout')} <ArrowRight size={17} />
                  </button>
                  <button
                    className="button button-light full"
                    onClick={() => {
                      window.location.href = '/signup'
                    }}
                  >
                    {t('Create an account')}
                  </button>
                </div>
              )
            ) : (
              <form onSubmit={placeOrder} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  {t('Full name')}
                  <input required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Your name" suppressHydrationWarning style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontWeight: 400 }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  {t('Email')}
                  <input required type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="you@example.com" suppressHydrationWarning style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontWeight: 400 }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  {t('Phone')}
                  <input required value={phone} onChange={(e: any) => setPhone(e.target.value)} placeholder="+91 98XXX XXXXX" suppressHydrationWarning style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontWeight: 400 }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  {t('Delivery address')}
                  <textarea required value={address} onChange={(e: any) => setAddress(e.target.value)} placeholder={t('Door no, street, city, pincode')} rows={3} suppressHydrationWarning style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontWeight: 400, fontFamily: 'inherit' }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  {t('Payment method')}
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    suppressHydrationWarning
                    style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontWeight: 400, background: '#fff' }}
                  >
                    <option value="COD">{t('Cash on delivery')}</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">{t('Card')}</option>
                    <option value="Netbanking">{t('Netbanking')}</option>
                  </select>
                </label>
                {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
                <button type="submit" className="button button-dark full" disabled={placing}>
                  {placing ? t('Placing order…') : `${t('Place Order')} — ₹${total}`} <ArrowRight size={17} />
                </button>
                <button type="button" className="button button-light full" onClick={() => setShowCheckout(false)}>
                  {t('Back to Bag')}
                </button>
              </form>
            )}
            <p className="secure">
              <Check size={14} /> {t('Encrypted & Secure Checkout')}
            </p>
          </aside>
        </div>
      )}
    </main>
  )
}

function Wishlist({ wishlist, toggleWish, setSelected, addToCart, go }: any) {
  const { language, t } = useLanguage()
  return (
    <main className="wishlist-page section">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">{t('Saved Items')}</p>
          <h1>
            {language === 'en' ? (
              <>Your <em>wishlist.</em></>
            ) : (
              <em>{t('Your wishlist.')}</em>
            )}
          </h1>
        </div>
        <span>{wishlist.length} {t('saved')}</span>
      </div>
      {wishlist.length === 0 ? (
        <div className="empty">
          <Heart size={34} />
          <h2>{t('Nothing saved yet.')}</h2>
          <p>{t('Save your favorite items here to order later.')}</p>
          <button className="button button-dark" onClick={() => go('product')}>
            {t('Browse Products')} <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {wishlist.map((p: Product) => (
            <ProductCard
              key={p.id}
              product={p}
              onSelect={(next) => {
                setSelected(next)
                go('detail')
              }}
              addToCart={addToCart}
              toggleWish={toggleWish}
              wished
            />
          ))}
        </div>
      )}
    </main>
  )
}

function Footer({ go }: { go: (v: View) => void }) {
  const { t } = useLanguage()
  return (
    <footer aria-label="AJR site footer">
      <div className="footer-top">
        <div className="footer-intro">
          <button className="footer-brand" onClick={() => go('home')}>
            <img src={logo} alt="AJR — Always Just Royal" width={1254} height={1254} />
          </button>
          <p>
            {t('Essence of nature.')}
            <br />
            {t('Pure dry fruits, nuts, and handcrafted hampers made for everyday living.')}
          </p>
        </div>
        <div className="footer-links">
          <div>
            <p className="eyebrow">{t('Explore')}</p>
            <button onClick={() => go('about')}>{t('Our Story')}</button>
            <button onClick={() => go('product')}>{t('Shop All')}</button>
          </div>
          <div>
            <p className="eyebrow">{t('Connect')}</p>
            <button onClick={() => go('contact')}>{t('Contact Us')}</button>
          </div>
          <div>
            <p className="eyebrow">{t('Newsletter')}</p>
            <p>{t('Join the table for private harvest releases.')}</p>
            <div className="newsletter">
              <input placeholder={t('Your email address')} aria-label={t('Email address')} />
              <button aria-label={t('Subscribe')}>
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{t('© 2026 AJR Essence of Nature. All rights reserved.')}</span>
        <span>{t('Crafted with intention & care')}</span>
        <span>{t('Privacy · Terms')}</span>
      </div>
    </footer>
  )
}
