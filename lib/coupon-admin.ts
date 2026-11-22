import 'server-only'

const text = (value: unknown, length: number) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length)

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const dateValue = (value: unknown) => {
  const raw = text(value, 80)
  if (!raw) return null
  const istDateTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(raw)
  const date = new Date(istDateTime
    ? `${istDateTime[1]}T${istDateTime[2]}:${istDateTime[3] || '00'}+05:30`
    : raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const numberArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  const parsed = value.map(Number)
  if (parsed.length > 500 || parsed.some((entry) => !Number.isSafeInteger(entry) || entry < 1)) {
    throw new Error('Product eligibility contains an invalid product ID.')
  }
  return Array.from(new Set(parsed))
}

const textArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((entry) => text(entry, 80)).filter(Boolean))).slice(0, 100)
}

const uuidArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  const parsed = value.map((entry) => {
    let id = text(entry, 80).toLowerCase()
      .replace(/^(?:uuid:|user id:)\s*/, '')
      .replace(/^[{"'[(]+|[}"')\],;]+$/g, '')
    if (/^[0-9a-f]{32}$/.test(id)) {
      id = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    }
    return id
  })
  if (parsed.length > 500 || parsed.some((entry) =>
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry))) {
    throw new Error('Eligible customer IDs must be Supabase Auth UUIDs (one per line), not emails or names. Clear the field to allow all customers.')
  }
  return Array.from(new Set(parsed))
}

export function normalizeCouponInput(body: any, adminEmail: string) {
  const code = text(body.code, 40).toUpperCase()
  const name = text(body.name, 120)
  const discountType = text(body.discount_type, 30)
  const discountValue = discountType === 'free_shipping' ? 0 : numberOrNull(body.discount_value)
  const maxDiscount = numberOrNull(body.max_discount_amount)
  const minimumPurchase = numberOrNull(body.minimum_purchase) ?? Number.NaN
  const maximumOrderInput = numberOrNull(body.maximum_order_amount)
  const maximumOrder = maximumOrderInput === 0 ? null : maximumOrderInput
  const startsAt = dateValue(body.starts_at)
  const expiresAt = dateValue(body.expires_at)
  const usageLimit = numberOrNull(body.usage_limit)
  const perCustomerLimit = numberOrNull(body.per_customer_limit)

  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error('Coupon codes must be 3–40 letters, numbers, underscores, or hyphens.')
  if (!name) throw new Error('Coupon name is required.')
  if (!['percentage', 'fixed', 'free_shipping'].includes(discountType)) throw new Error('Choose a supported discount type.')
  if (!Number.isFinite(discountValue) || Number(discountValue) < 0 || (discountType === 'percentage' && Number(discountValue) > 100)) {
    throw new Error('Enter a valid discount value. Percentage discounts cannot exceed 100%.')
  }
  if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) throw new Error('Maximum discount must be a non-negative amount.')
  if (!Number.isFinite(minimumPurchase) || minimumPurchase < 0) throw new Error('Minimum purchase must be a non-negative amount.')
  if (maximumOrder !== null && (!Number.isFinite(maximumOrder) || maximumOrder < minimumPurchase)) {
    throw new Error(`Maximum eligible order (${maximumOrder}) must be at least the minimum purchase (${minimumPurchase}), or leave it blank for no maximum.`)
  }
  if (!startsAt || !expiresAt || new Date(expiresAt) <= new Date(startsAt)) throw new Error('Choose a valid start and expiry date. Expiry must be later than the start.')
  for (const [label, value] of [['Total usage limit', usageLimit], ['Per-customer usage limit', perCustomerLimit]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new Error(`${label} must be a positive whole number or left blank.`)
  }

  const newCustomersOnly = body.new_customers_only === true
  const existingCustomersOnly = body.existing_customers_only === true
  if (newCustomersOnly && existingCustomersOnly) throw new Error('A coupon cannot be restricted to both new and existing customers.')
  if (body.first_order_only === true && existingCustomersOnly) throw new Error('A first-order coupon cannot be restricted to existing customers.')
  const isPublic = body.is_public === true
  const showToCustomers = body.show_to_customers === true
  const promote = body.promote === true && isPublic && showToCustomers

  return {
    code,
    name,
    description: text(body.description, 1000),
    discount_type: discountType,
    discount_value: discountValue,
    max_discount_amount: maxDiscount,
    minimum_purchase: minimumPurchase,
    maximum_order_amount: maximumOrder,
    starts_at: startsAt,
    expires_at: expiresAt,
    active: body.active !== false,
    is_public: isPublic,
    show_to_customers: showToCustomers,
    usage_limit: usageLimit,
    per_customer_limit: perCustomerLimit,
    first_order_only: body.first_order_only === true,
    new_customers_only: newCustomersOnly,
    existing_customers_only: existingCustomersOnly,
    eligible_product_ids: numberArray(body.eligible_product_ids),
    excluded_product_ids: numberArray(body.excluded_product_ids),
    eligible_categories: textArray(body.eligible_categories),
    excluded_categories: textArray(body.excluded_categories),
    eligible_customer_ids: uuidArray(body.eligible_customer_ids),
    promote,
    banner_title: text(body.banner_title, 100),
    banner_copy: text(body.banner_copy, 300),
    banner_cta: text(body.banner_cta, 40) || 'Shop now',
    restore_usage_on_cancel: body.restore_usage_on_cancel === true,
    updated_by: text(adminEmail, 254).toLowerCase(),
  }
}

export function couponStatus(coupon: any, now = Date.now()) {
  if (coupon.archived) return 'Archived'
  if (!coupon.active) return 'Inactive'
  if (new Date(coupon.starts_at).getTime() > now) return 'Scheduled'
  if (new Date(coupon.expires_at).getTime() <= now) return 'Expired'
  return 'Active'
}

export async function writeCouponAudit(admin: any, {
  couponId,
  code,
  adminEmail,
  action,
  changes,
}: {
  couponId: string | null
  code: string
  adminEmail: string
  action: string
  changes: unknown
}) {
  const { error } = await admin.from('coupon_audit_history').insert({
    coupon_id: couponId,
    coupon_code: text(code, 40),
    admin_email: text(adminEmail, 254).toLowerCase(),
    action: text(action, 40),
    changes,
  })
  if (error) throw error
}
