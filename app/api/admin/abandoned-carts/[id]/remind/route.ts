import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isConfirmedCartOrder, normalizeTrackedLines, orderOverlapsCart, safeRecoveryBaseUrl, sha256 } from '@/lib/abandoned-carts'
import { CartRecoveryEligibilityError, CartRecoveryEmailRejectedError, CartRecoveryPreparationError, sendCartRecoveryEmail } from '@/lib/cart-recovery-email'
import { cartRecoveryConfigurationIssues, MarketingEmailPausedError } from '@/lib/marketing-email'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: 'Invalid cart reference.' }, { status: 400 })
  }
  const configurationIssues = cartRecoveryConfigurationIssues()
  if (configurationIssues.length) {
    return NextResponse.json({ message: `Cart reminders are unavailable. ${configurationIssues.join(' ')}` }, { status: 503 })
  }
  try {
    safeRecoveryBaseUrl()
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || 'Configure APP_URL before sending reminders.' }, { status: 503 })
  }

  const admin = supabaseAdmin()
  const { data: cart, error } = await admin.from('abandoned_carts')
    .select('id,user_id,cart_items,item_count,customer_name,customer_email,recovery_email_consent,reminder_attempt_at,reminder_sent_at,reminder_result,reminder_provider_id,recovery_token_hash,cart_started_at,last_activity_at,closed_at,order_id')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('Manual cart reminder lookup failed:', error)
    return NextResponse.json({ message: 'Could not load this cart. No reminder was sent.' }, { status: 503 })
  }
  if (!cart) return NextResponse.json({ message: 'This cart is no longer available.' }, { status: 404 })
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString()
  const recoverableClaim = cart.reminder_result === 'sending' && cart.reminder_attempt_at &&
    new Date(cart.reminder_attempt_at).getTime() <= new Date(staleBefore).getTime() &&
    !cart.recovery_token_hash && !cart.reminder_provider_id
  if (cart.reminder_result === 'sending' && !recoverableClaim)
    return NextResponse.json({ message: 'A reminder is processing or its delivery result is uncertain. Review its status before retrying.' }, { status: 409 })
  if (cart.closed_at) return NextResponse.json({ message: 'This cart is closed and is no longer eligible for recovery.' }, { status: 409 })
  if (cart.order_id) return NextResponse.json({ message: 'This cart is associated with an order and cannot receive a reminder.' }, { status: 409 })
  if (!cart.user_id) return NextResponse.json({ message: 'Anonymous carts have no verified contact address and cannot receive email.' }, { status: 409 })
  const { data: initialPreference, error: initialPreferenceError } = await admin.from('cart_reminder_preferences')
    .select('opted_in,opted_out_at,suppressed_at').eq('user_id', cart.user_id).maybeSingle()
  if (initialPreferenceError) {
    console.error('Manual cart reminder preference lookup failed:', initialPreferenceError)
    return NextResponse.json({ message: 'Could not verify the customer email preference. No reminder was sent.' }, { status: 503 })
  }
  if (initialPreference?.suppressed_at) return NextResponse.json({ message: 'Email delivery is suppressed for this customer.' }, { status: 409 })
  if (initialPreference && !initialPreference.opted_in && initialPreference.opted_out_at) {
    return NextResponse.json({ message: 'The customer explicitly opted out of cart reminders.' }, { status: 409 })
  }
  if (!cart.recovery_email_consent || (initialPreference && !initialPreference.opted_in)) {
    return NextResponse.json({ message: 'No cart-reminder permission is recorded for this cart.' }, { status: 409 })
  }
  if (!cart.customer_email) return NextResponse.json({ message: 'A verified account email is not available.' }, { status: 409 })
  if (!Array.isArray(cart.cart_items) || cart.item_count < 1) return NextResponse.json({ message: 'This cart has no recoverable items.' }, { status: 409 })
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
  if (!recoverableClaim && cart.reminder_attempt_at && new Date(cart.reminder_attempt_at).getTime() > Date.now() - 15 * 60_000) {
    return NextResponse.json({ message: 'A reminder attempt was made recently. Try again after the 15-minute safety interval.' }, { status: 429 })
  }
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const { data: claimed, error: claimError } = await admin.from('abandoned_carts')
    .update({
      reminder_attempt_at: attemptedAt.toISOString(),
      reminder_result: 'sending',
      reminder_origin: 'manual',
      reminder_error: null,
      recovery_token_hash: tokenHash,
      recovery_token_expires_at: new Date(attemptedAt.getTime() + 14 * 86400_000).toISOString(),
      recovery_redeemed_at: null,
      updated_at: attemptedAt.toISOString(),
    })
    .eq('id', id)
    .eq('user_id', cart.user_id)
    .eq('customer_email', cart.customer_email)
    .eq('recovery_email_consent', true)
    .is('reminder_sent_at', null)
    .is('closed_at', null)
    .is('order_id', null)
    .eq('last_activity_at', cart.last_activity_at)
    .or(`and(reminder_attempt_at.is.null,reminder_result.is.null),and(reminder_attempt_at.lt.${cooldown},reminder_result.eq.failed),and(reminder_result.eq.sending,reminder_attempt_at.lte.${staleBefore},recovery_token_hash.is.null,reminder_provider_id.is.null)`)
    .select('id')
    .maybeSingle()
  if (claimError) {
    console.error('POST /api/admin/abandoned-carts/[id]/remind claim failed:', claimError)
    const reasons = [
      'Another reminder for this customer is being processed.',
      'The earlier delivery may have reached the provider and must be reviewed.',
      'The maximum number of reminder attempts has been reached.',
      'The customer has opted out or is suppressed.',
      'Another cart reminder was sent or is processing within the last 24 hours.',
      'A product reminder was sent or is processing within the last 24 hours.',
      'An earlier reminder has an uncertain delivery outcome and must be reviewed.',
      'Another cart reminder was sent within the last 24 hours.',
      'A product reminder was sent within the last 24 hours.',
    ]
    if (reasons.includes(claimError.message)) return NextResponse.json({ message: claimError.message }, { status: 409 })
    return NextResponse.json({ message: 'Could not safely claim this reminder. Try again shortly.' }, { status: 503 })
  }
  if (!claimed) {
    const { data: latest, error: latestError } = await admin.from('abandoned_carts')
      .select('last_activity_at,closed_at,order_id,recovery_email_consent,reminder_sent_at,reminder_result')
      .eq('id', id).maybeSingle()
    if (latestError) {
      console.error('Manual cart reminder status lookup failed:', latestError)
      return NextResponse.json({ message: 'Could not recheck this cart. No reminder was sent.' }, { status: 503 })
    }
    const reason = !latest ? 'This cart is no longer available.'
      : latest.closed_at || latest.order_id ? 'This cart was closed or purchased.'
        : !latest.recovery_email_consent ? 'The customer has opted out of cart reminders.'
          : latest.reminder_sent_at ? 'A reminder was already sent for this cart.'
            : latest.last_activity_at !== cart.last_activity_at ? 'The customer changed the cart. Refresh the dashboard before retrying.'
              : latest.reminder_result === 'sending' ? 'Another reminder attempt is processing or needs review.'
                : 'The reminder state changed. Refresh the dashboard before retrying.'
    return NextResponse.json({ message: reason }, { status: 409 })
  }

  const releaseClaim = async (reason: string) => {
    const { error: releaseError } = await admin.from('abandoned_carts').update({
      reminder_result: 'failed',
      reminder_error: reason,
      recovery_token_hash: null,
      recovery_token_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('recovery_token_hash', tokenHash).eq('reminder_result', 'sending')
    if (releaseError) console.error('Manual cart reminder claim release failed:', releaseError)
  }

  const startedAt = cart.cart_started_at ? new Date(cart.cart_started_at).getTime() : NaN
  if (!Number.isFinite(startedAt)) {
    await releaseClaim('Cart start time is invalid.')
    return NextResponse.json({ message: 'Could not verify this cart. No reminder was sent.' }, { status: 503 })
  }
  const { data: orders, error: orderLookupError } = await admin.from('orders')
    .select('id,status,payment_status,payment_method,created_at,items')
    .eq('user_id', cart.user_id)
    .gte('created_at', new Date(startedAt - 10 * 60_000).toISOString())
  if (orderLookupError) {
    console.error('Manual cart reminder purchase verification failed:', orderLookupError)
    await releaseClaim('Could not verify whether the cart was purchased.')
    return NextResponse.json({ message: 'Could not verify whether this cart was purchased. No reminder was sent.' }, { status: 503 })
  }
  if ((orders || []).some((order) => isConfirmedCartOrder(order) && orderOverlapsCart(cart.cart_items, order.items))) {
    await releaseClaim('Cart already purchased.')
    return NextResponse.json({ message: 'The customer has already purchased items from this cart. No reminder was sent.' }, { status: 409 })
  }

  const { data: eligible, error: eligibilityError } = await admin.from('abandoned_carts')
    .select('id')
    .eq('id', id).eq('user_id', cart.user_id).eq('customer_email', cart.customer_email)
    .eq('recovery_email_consent', true).eq('last_activity_at', cart.last_activity_at)
    .eq('reminder_result', 'sending').eq('recovery_token_hash', tokenHash)
    .is('reminder_sent_at', null).is('closed_at', null).is('order_id', null)
    .maybeSingle()
  if (eligibilityError || !eligible) {
    if (eligibilityError) console.error('Manual cart reminder eligibility verification failed:', eligibilityError)
    await releaseClaim('Cart eligibility changed before sending.')
    return NextResponse.json({ message: 'Cart eligibility changed or could not be verified. No reminder was sent.' }, { status: 409 })
  }

  const { data: preference, error: preferenceError } = await admin.from('cart_reminder_preferences')
    .select('opted_in,suppressed_at').eq('user_id', cart.user_id).maybeSingle()
  if (preferenceError || (preference && (!preference.opted_in || preference.suppressed_at))) {
    if (preferenceError) console.error('Manual cart reminder preference recheck failed:', preferenceError)
    await releaseClaim('Cart email preference changed before sending.')
    return NextResponse.json({ message: 'Cart email preference changed. No reminder was sent.' }, { status: 409 })
  }

  const { data: savedCart, error: savedCartError } = await admin.from('carts')
    .select('items').eq('user_id', cart.user_id).maybeSingle()
  const currentLines = normalizeTrackedLines(savedCart?.items)
  if (savedCartError || !currentLines.length ||
    JSON.stringify(currentLines) !== JSON.stringify(normalizeTrackedLines(cart.cart_items))) {
    if (savedCartError) console.error('Manual cart reminder current cart lookup failed:', savedCartError)
    await releaseClaim('Saved cart changed before sending.')
    return NextResponse.json({ message: 'The saved cart changed. No reminder was sent.' }, { status: 409 })
  }

  try {
    const sent = await sendCartRecoveryEmail({
      email: verifiedEmail,
      name: cart.customer_name || '',
      itemCount: Number(cart.item_count),
      items: cart.cart_items,
      token,
      cartId: id,
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
    if (sendError instanceof MarketingEmailPausedError) {
      const { error: deferError } = await admin.rpc('ajr_defer_marketing_email', { p_campaign: 'cart', p_id: id })
      if (deferError) {
        console.error('Could not defer paused manual reminder:', deferError)
        return NextResponse.json({ message: 'Could not save the paused reminder; review its status before retrying.' }, { status: 503 })
      }
      return NextResponse.json({ message: 'Marketing reminders are paused or quota could not be verified. No email was sent.' }, { status: 429 })
    }
    if (sendError instanceof CartRecoveryEligibilityError) {
      await releaseClaim('Reminder eligibility changed at the final delivery check.')
      return NextResponse.json({ message: 'The cart or marketing eligibility changed during the final check. No email was sent; refresh the dashboard.' }, { status: 409 })
    }
    if (sendError instanceof CartRecoveryPreparationError) {
      await releaseClaim(safeMessage)
      return NextResponse.json({ message: `The reminder could not be prepared. ${safeMessage}` }, { status: 409 })
    }
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
