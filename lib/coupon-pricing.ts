import 'server-only'

const WEIGHT_MULTIPLIERS: Record<string, number> = {
  '25 g': 0.1,
  '50 g': 0.2,
  '100 g': 0.4,
  '250 g': 1,
  '500 g': 2,
  '1 kg': 4,
}
const KG_FRACTIONS: Record<string, number> = {
  '25 g': 0.025,
  '50 g': 0.05,
  '100 g': 0.1,
  '250 g': 0.25,
  '500 g': 0.5,
  '1 kg': 1,
}
const DEFAULT_WEIGHTS = ['250 g', '500 g', '1 kg']
const SPICE_WEIGHTS = ['50 g', '100 g', '250 g', '500 g']

type CouponCartLine = {
  id: number
  name: string
  type: string
  category: string
  variety: string
  price: number
  quantity: number
  image: string
  selectedWeight: string
}

export class CouponCartValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CouponCartValidationError'
  }
}

export async function priceCouponCart(admin: any, input: unknown): Promise<CouponCartLine[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 60) {
    throw new CouponCartValidationError('Your cart could not be verified. Refresh the page and try again.')
  }

  const parsed = input.map((line: any) => {
    const product = line?.product || line
    const id = Number(product?.id)
    const quantity = Number(line?.quantity)
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new CouponCartValidationError('A cart item is invalid. Refresh your cart and try again.')
    }
    return {
      id,
      quantity,
      weight: String(product?.selectedWeight || product?.selected_weight || '250 g'),
      variety: String(product?.selectedVariety || product?.variety || ''),
    }
  })

  const ids = Array.from(new Set(parsed.map((line) => line.id)))
  const { data: products, error } = await admin.from('products')
    .select('*')
    .in('id', ids)
    .eq('active', true)
  if (error) throw error
  const byId = new Map<number, any>((products || []).map((product: any) => [Number(product.id), product]))

  return parsed.map((line) => {
    const product = byId.get(line.id)
    if (!product) throw new CouponCartValidationError('A product in your cart is no longer available.')
    const weightOptions = Array.isArray(product.pack_sizes) && product.pack_sizes.length
      ? product.pack_sizes.map(String)
      : String(product.type || '').toLowerCase() === 'spices' ? SPICE_WEIGHTS : DEFAULT_WEIGHTS
    if (!Object.prototype.hasOwnProperty.call(WEIGHT_MULTIPLIERS, line.weight) || !weightOptions.includes(line.weight)) {
      throw new CouponCartValidationError('A product option in your cart has changed. Refresh your cart and try again.')
    }

    const varieties = Array.isArray(product.varieties) ? product.varieties : []
    let selectedVariety: any = null
    if (varieties.length) {
      const available = varieties.filter((entry: any) =>
        entry?.active !== false && (entry?.stock === undefined || entry?.stock === null || Number(entry.stock) > 0))
      selectedVariety = available.find((entry: any) => String(entry.name) === line.variety) || (!line.variety ? available[0] : null)
      if (!selectedVariety) throw new CouponCartValidationError('A product variety in your cart is no longer available.')
    }

    const rawPrice = selectedVariety
      ? Math.round(Number(selectedVariety.price) * KG_FRACTIONS[line.weight])
      : Number(product.price) * WEIGHT_MULTIPLIERS[line.weight]
    if (!Number.isFinite(rawPrice) || rawPrice < 0) throw new CouponCartValidationError('A product price could not be verified.')

    return {
      id: line.id,
      name: String(product.name || 'AJR product'),
      type: String(product.type || ''),
      category: String(product.category || product.type || ''),
      variety: selectedVariety ? String(selectedVariety.name) : '',
      price: rawPrice,
      quantity: line.quantity,
      image: String(product.image || ''),
      selectedWeight: line.weight,
    }
  })
}

export function subtotalForCouponCart(items: CouponCartLine[]) {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
}

export async function quoteCoupon(admin: any, code: string, userId: string, input: unknown) {
  const items = await priceCouponCart(admin, input)
  const subtotal = subtotalForCouponCart(items)
  const shipping = subtotal >= 999 ? 0 : 99
  const { data, error } = await admin.rpc('ajr_coupon_quote', {
    p_code: code,
    p_user_id: userId,
    p_items: items,
    p_subtotal: subtotal,
    p_shipping: shipping,
  })
  if (error) throw error
  return { items, quote: data }
}
