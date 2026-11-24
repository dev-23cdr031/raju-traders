import { isIP } from 'node:net'
import { NextRequest, NextResponse } from 'next/server'
import { assistantActorHash, assistantProduct, parseAssistantRequest, rankPublicProducts } from '@/lib/ai-assistant'
import { getUserFromToken, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const messages = {
  en: { products: 'Here are some products from our current catalog.', none: 'No matching products are available right now.', compare: 'Choose at least two available products to compare.', offers: 'Current public offers are shown below; eligibility terms apply.' },
  ta: { products: 'தற்போதைய பட்டியலில் உள்ள சில பொருட்கள் இதோ.', none: 'பொருந்தும் பொருட்கள் தற்போது கிடைக்கவில்லை.', compare: 'ஒப்பிட குறைந்தது இரண்டு கிடைக்கும் பொருட்களைத் தேர்வு செய்யவும்.', offers: 'தற்போதைய பொது சலுகைகள் கீழே உள்ளன; விதிமுறைகள் பொருந்தும்.' },
  tanglish: { products: 'Ithu namma current catalog-la irukkum products.', none: 'Ippo matching products kidaikkala.', compare: 'Compare panna available-a irukkum rendu products select pannunga.', offers: 'Current public offers keezhe irukku; conditions apply.' },
} as const

async function readLimitedBody(request: NextRequest) {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 4096) {
      await reader.cancel()
      throw new Error('Request is too large.')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from('ai_assistant_settings')
      .select('enabled,welcome_message').eq('id', true).single()
    if (error) throw error
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Assistant settings unavailable:', error)
    return NextResponse.json({ message: 'Assistant is unavailable.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (!Number.isFinite(contentLength) || contentLength > 4096) {
    return NextResponse.json({ message: 'Request is too large.' }, { status: 413 })
  }
  let raw: string
  try {
    raw = await readLimitedBody(request)
  } catch (error) {
    console.error('Assistant request body could not be read:', error)
    return NextResponse.json({ message: 'Request is too large or could not be read.' }, { status: 413 })
  }
  let input: ReturnType<typeof parseAssistantRequest>
  try {
    input = parseAssistantRequest(JSON.parse(raw))
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 })
  }

  const forwardedIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || ''
  const ip = process.env.VERCEL ? forwardedIp : (forwardedIp || '127.0.0.1')
  if (!isIP(ip)) return NextResponse.json({ message: 'Assistant rate limiting is unavailable.' }, { status: 503 })
  let actorHash: string
  let userHash: string | null = null
  try {
    const secret = process.env.AI_RATE_LIMIT_SECRET || ''
    actorHash = assistantActorHash(`ip:${ip}`, secret)
    const authorization = request.headers.get('authorization')
    if (authorization) {
      if (!authorization.startsWith('Bearer ') || authorization.length > 4096) {
        return NextResponse.json({ message: 'Invalid authentication.' }, { status: 401 })
      }
      const user = await getUserFromToken(authorization.slice(7))
      if (!user?.id) return NextResponse.json({ message: 'Sign in again to continue.' }, { status: 401 })
      userHash = assistantActorHash(`user:${user.id}`, secret)
    }
  } catch (error) {
    console.error('Assistant rate limiting configuration error:', error)
    return NextResponse.json({ message: 'Assistant is not configured.' }, { status: 503 })
  }

  try {
    const admin = supabaseAdmin()
    const key = process.env.GEMINI_API_KEY || ''
    const shouldCallAi = Boolean(key) && input.intent !== 'offers' && input.intent !== 'compare'
    const { data: reservations, error: reserveError } = await admin.rpc('ajr_reserve_ai_assistant_request', {
      p_actor_hash: actorHash, p_user_hash: userHash, p_conversation_id: input.conversationId, p_intent: input.intent, p_attempt_ai: shouldCallAi,
    })
    if (reserveError) {
      if (reserveError.message.includes('rate limit exceeded')) {
        return NextResponse.json({ message: 'Please wait a moment before trying again.' }, { status: 429 })
      }
      if (reserveError.message.includes('Assistant disabled')) {
        return NextResponse.json({ message: 'Assistant is currently disabled.' }, { status: 503 })
      }
      throw reserveError
    }
    const reservation = reservations?.[0]
    if (!reservation?.request_id || typeof reservation.allow_ai !== 'boolean') throw new Error('Invalid quota reservation.')

    if (input.intent === 'offers') {
      const now = new Date().toISOString()
      const { data: offers, error } = await admin.from('coupons')
        .select('id,code,name,description,discount_type,discount_value,minimum_purchase,maximum_order_amount,expires_at,first_order_only,new_customers_only,existing_customers_only,usage_limit,per_customer_limit,eligible_customer_ids,eligible_product_ids,excluded_product_ids,eligible_categories,excluded_categories')
        .eq('active', true).eq('archived', false).eq('is_public', true).eq('show_to_customers', true)
        .lte('starts_at', now).gt('expires_at', now).limit(30)
      if (error) throw error
      const publicOffers = (offers || []).filter((offer) =>
        !offer.first_order_only && !offer.new_customers_only && !offer.existing_customers_only &&
        offer.usage_limit === null && offer.per_customer_limit === null &&
        Number(offer.minimum_purchase) === 0 && offer.maximum_order_amount === null &&
        [offer.eligible_customer_ids, offer.eligible_product_ids, offer.excluded_product_ids,
          offer.eligible_categories, offer.excluded_categories].every((values) => Array.isArray(values) && values.length === 0))
        .map(({ id, code, name, description, discount_type, discount_value, expires_at }) =>
          ({ id, code, name, description, discount_type, discount_value, expires_at }))
      return NextResponse.json({ message: messages[input.language].offers, products: [], offers: publicOffers, source: 'fallback' }, { headers: { 'Cache-Control': 'no-store' } })
    }

    let query = admin.from('products').select('id,name,category,type,image,price,stock,status,varieties,pack_sizes')
      .eq('active', true).order('id').limit(100)
    if (input.productIds.length) query = query.in('id', input.productIds)
    const { data: rows, error: productError } = await query
    if (productError) throw productError
    const products = (rows || []).flatMap((row) => {
      try {
        const product = assistantProduct(row)
        return product && (input.budget === undefined || product.price <= input.budget) ? [product] : []
      } catch (error) {
        console.error('Assistant skipped an invalid public product:', row.id, error)
        return []
      }
    })
    let selected = products.slice(0, 5)
    let source: 'ai' | 'fallback' = 'fallback'
    let status: 'ai' | 'fallback' | 'failed' = 'fallback'
    if (reservation.allow_ai && products.length) {
      try {
        selected = await rankPublicProducts(key, input.intent, products)
        source = 'ai'
        status = 'ai'
      } catch (error) {
        status = 'failed'
        console.error('Assistant Gemini request failed:', error instanceof Error ? error.message : error)
      }
    }
    const { error: updateError } = await admin.from('ai_assistant_requests')
      .update({ status, product_ids: selected.map((product) => product.id) }).eq('id', reservation.request_id)
    if (updateError) {
      console.error('Assistant request status could not be recorded:', updateError)
      return NextResponse.json({ message: 'Assistant is temporarily unavailable.' }, { status: 503 })
    }
    return NextResponse.json({
      message: input.intent === 'compare' && selected.length < 2 ? messages[input.language].compare
        : selected.length ? messages[input.language].products : messages[input.language].none,
      products: selected, source,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Assistant request failed:', error)
    return NextResponse.json({ message: 'Assistant is temporarily unavailable.' }, { status: 503 })
  }
}
