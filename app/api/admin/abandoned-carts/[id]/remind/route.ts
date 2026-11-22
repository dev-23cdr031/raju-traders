import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes, safeRecoveryBaseUrl, sha256 } from '@/lib/abandoned-carts'
import { CartRecoveryEmailRejectedError, sendCartRecoveryEmail } from '@/lib/cart-recovery-email'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: 'Invalid cart reference.' }, { status: 400 })
  }
  if (!process.env.RESEND_API_KEY || process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') {
    return NextResponse.json({ message: 'Cart reminders are unavailable because Resend is not configured or email notifications are disabled.' }, { status: 503 })
  }
  try {
    safeRecoveryBaseUrl()
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || 'Configure APP_URL before sending reminders.' }, { status: 503 })
  }

  const admin = supabaseAdmin()
  const { data: cart, error } = await admin.from('abandoned_carts')
    .select('id,user_id,cart_items,item_count,customer_name,customer_email,recovery_email_consent,reminder_attempt_at,reminder_sent_at,reminder_result,last_activity_at,closed_at,order_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !cart) return NextResponse.json({ message: 'This cart is no longer available.' }, { status: 404 })
  if (cart.reminder_result === 'sending') {
    return NextResponse.json({ message: 'A prior delivery attempt has an uncertain result. It is blocked to prevent a duplicate reminder.' }, { status: 409 })
  }
  if (cart.closed_at && !cart.order_id) return NextResponse.json({ message: 'This cart is closed and is no longer eligible for recovery.' }, { status: 409 })
  if (cart.order_id) {
    const { data: order, error: orderError } = await admin.from('orders')
      .select('status')
      .eq('id', cart.order_id)
      .maybeSingle()
    if (orderError) {
      console.error('POST /api/admin/abandoned-carts/[id]/remind order lookup failed:', orderError)
      return NextResponse.json({ message: 'Could not verify the linked order. No reminder was sent.' }, { status: 503 })
    }
    if (order && String(order.status || '').toLowerCase() !== 'cancelled') {
      return NextResponse.json({ message: 'This cart is already associated with a persisted order.' }, { status: 409 })
    }
  }
  if (!cart.user_id) return NextResponse.json({ message: 'Anonymous carts have no verified contact address and cannot receive email.' }, { status: 409 })
  if (!cart.recovery_email_consent) return NextResponse.json({ message: 'The customer has not opted in to cart-reminder email.' }, { status: 409 })
  if (!cart.customer_email) return NextResponse.json({ message: 'A verified account email is not available.' }, { status: 409 })
  if (!Array.isArray(cart.cart_items) || cart.item_count < 1) return NextResponse.json({ message: 'This cart has no recoverable items.' }, { status: 409 })
  if (Date.now() - new Date(cart.last_activity_at).getTime() < abandonmentMinutes() * 60_000) {
    return NextResponse.json({ message: 'This cart is still active; wait until the configured abandonment threshold has passed.' }, { status: 409 })
  }
  if (cart.reminder_sent_at) return NextResponse.json({ message: 'A reminder was already sent for this cart.' }, { status: 409 })

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(cart.user_id)
  const verifiedEmail = authData?.user?.email_confirmed_at
    ? String(authData.user.email || '').trim().toLowerCase()
    : ''
  if (authError || !verifiedEmail || verifiedEmail !== String(cart.customer_email).toLowerCase()) {
    return NextResponse.json({ message: 'The customer account no longer has the same verified email. Ask them to renew consent before sending.' }, { status: 409 })
  }

  const attemptedAt = new Date()
  const cooldown = new Date(attemptedAt.getTime() - 15 * 60_000).toISOString()
  if (cart.reminder_attempt_at && new Date(cart.reminder_attempt_at).getTime() > Date.now() - 15 * 60_000) {
    return NextResponse.json({ message: 'A reminder attempt was made recently. Try again after the 15-minute safety interval.' }, { status: 429 })
  }
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const { data: claimed, error: claimError } = await admin.from('abandoned_carts')
    .update({
      reminder_attempt_at: attemptedAt.toISOString(),
      reminder_result: 'sending',
      reminder_error: null,
      recovery_token_hash: tokenHash,
      recovery_token_expires_at: new Date(attemptedAt.getTime() + 14 * 86400_000).toISOString(),
      recovery_redeemed_at: null,
      updated_at: attemptedAt.toISOString(),
    })
    .eq('id', id)
    .eq('recovery_email_consent', true)
    .is('reminder_sent_at', null)
    .or(`and(reminder_attempt_at.is.null,reminder_result.is.null),and(reminder_attempt_at.lt.${cooldown},reminder_result.eq.failed)`)
    .select('id')
    .maybeSingle()
  if (claimError) {
    console.error('POST /api/admin/abandoned-carts/[id]/remind claim failed:', claimError)
    return NextResponse.json({ message: 'Could not safely claim this reminder. Try again shortly.' }, { status: 503 })
  }
  if (!claimed) return NextResponse.json({ message: 'This reminder is no longer eligible or another administrator is handling it.' }, { status: 409 })

  try {
    const sent = await sendCartRecoveryEmail({
      email: verifiedEmail,
      name: cart.customer_name || '',
      itemCount: Number(cart.item_count),
      token,
    })
    const { data: recorded, error: recordError } = await admin.from('abandoned_carts').update({
      reminder_sent_at: new Date().toISOString(),
      reminder_result: 'sent',
      reminder_provider_id: sent.id || null,
      reminder_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('recovery_token_hash', tokenHash).eq('reminder_result', 'sending')
      .select('id')
      .maybeSingle()
    if (recordError || !recorded) {
      console.error('POST /api/admin/abandoned-carts/[id]/remind delivery status could not be recorded:', recordError)
      return NextResponse.json({ message: 'The email provider accepted the reminder, but its delivery status could not be saved. Further attempts are blocked to prevent duplicates.' }, { status: 503 })
    }
    return NextResponse.json({ message: 'One recovery-only reminder was sent to the verified account email.' })
  } catch (sendError: any) {
    const safeMessage = String(sendError?.message || 'Email provider request failed.').slice(0, 300)
    if (sendError instanceof CartRecoveryEmailRejectedError) {
      const { error: failureRecordError } = await admin.from('abandoned_carts').update({
        reminder_result: 'failed',
        reminder_error: safeMessage,
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('recovery_token_hash', tokenHash).eq('reminder_result', 'sending')
      if (failureRecordError) {
        console.error('POST /api/admin/abandoned-carts/[id]/remind rejection status could not be recorded:', failureRecordError)
        return NextResponse.json({ message: 'Resend rejected the email, but the result could not be saved. Further attempts are blocked until the status is reviewed.' }, { status: 503 })
      }
      console.error('POST /api/admin/abandoned-carts/[id]/remind send rejected:', sendError)
      return NextResponse.json({ message: `Resend rejected the reminder. ${safeMessage}` }, { status: 502 })
    }
    console.error('POST /api/admin/abandoned-carts/[id]/remind delivery result uncertain:', sendError)
    return NextResponse.json({ message: 'The delivery result is uncertain. Further attempts are blocked to prevent duplicate reminders.' }, { status: 502 })
  }
}
