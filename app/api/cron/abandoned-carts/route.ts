import { randomBytes, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes, associatePersistedOrder, isConfirmedCartOrder, normalizeTrackedLines, orderOverlapsCart, safeRecoveryBaseUrl, sha256 } from '@/lib/abandoned-carts'
import { CartRecoveryEligibilityError, CartRecoveryEmailRejectedError, CartRecoveryPreparationError, sendCartRecoveryEmail } from '@/lib/cart-recovery-email'
import { cartRecoveryConfigurationIssues, MarketingEmailPausedError } from '@/lib/marketing-email'
import { beginCartNotificationEvent, recordNotificationEvent } from '@/lib/notification-automation'
import { sendAbandonedCartWhatsApp, WhatsAppProviderRejectedError } from '@/lib/order-whatsapp'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 5
const RETRY_AFTER_MS = 30 * 60_000

function hasValidCronAuthorization(request: NextRequest) {
  const expected = process.env.CRON_SECRET || ''
  const supplied = request.headers.get('authorization') || ''
  const expectedHeader = `Bearer ${expected}`
  if (expected.length < 32) return false
  const expectedBuffer = Buffer.from(expectedHeader)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

function compactError(error: unknown) {
  return String(error instanceof Error ? error.message : error || 'Email provider request failed.')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300)
}

export async function GET(request: NextRequest) {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  if (cartRecoveryConfigurationIssues().length) {
    return NextResponse.json({ message: 'Cart reminders are unavailable.' }, { status: 503 })
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - abandonmentMinutes() * 60_000)
  const staleBefore = new Date(now.getTime() - RETRY_AFTER_MS)
  let admin: ReturnType<typeof supabaseAdmin>
  try {
    admin = supabaseAdmin()
  } catch (error) {
    console.error('GET /api/cron/abandoned-carts config error:', error)
    return NextResponse.json({ message: 'Cart reminders are unavailable.' }, { status: 503 })
  }

  const { data: enabled, error: settingsError } = await admin.rpc('ajr_marketing_campaign_enabled', { p_campaign: 'cart' })
  if (settingsError || typeof enabled !== 'boolean') {
    console.error('Cart automation setting unavailable:', settingsError)
    return NextResponse.json({ message: 'Automation setting unavailable.' }, { status: 503 })
  }
  if (!enabled) return NextResponse.json({ ok: true, claimed: 0, paused: true })
  const { data: claimedRows, error: claimError } = await admin.rpc('ajr_claim_cart_recovery_reminders', {
    p_cutoff: cutoff.toISOString(),
    p_stale_before: staleBefore.toISOString(),
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    console.error('GET /api/cron/abandoned-carts claim failed:', claimError)
    return NextResponse.json({ message: 'Cart reminders are temporarily unavailable.' }, { status: 503 })
  }

  const summary = { claimed: claimedRows?.length || 0, sent: 0, failed: 0, blocked: 0, uncertain: 0 }
  for (const row of claimedRows || []) {
    const id = String(row.id || '')
    const attemptAt = String(row.attempt_at || '')
    const userId = String(row.user_id || '')
    const expectedEmail = String(row.customer_email || '').trim().toLowerCase()
    const emailEvent = await beginCartNotificationEvent(admin, { ...row, recovery_email_consent: true }, 'email').catch((error) => {
      console.error('GET /api/cron/abandoned-carts event creation error:', error)
      return null
    })
    if (!emailEvent || emailEvent.status !== 'sending') {
      summary.blocked += 1
      continue
    }

    const markFailed = async (message: string) => {
      const { error } = await admin.from('abandoned_carts').update({
        reminder_result: 'failed',
        reminder_error: message,
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        recovery_redeemed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('reminder_result', 'sending').eq('reminder_attempt_at', attemptAt)
      if (error) console.error('GET /api/cron/abandoned-carts failure recording error:', error)
    }

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
    const verifiedEmail = authData?.user?.email_confirmed_at
      ? String(authData.user.email || '').trim().toLowerCase()
      : ''
    if (authError || !verifiedEmail || verifiedEmail !== expectedEmail) {
      await markFailed('Verified account email is unavailable or has changed.')
      await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Verified account email is unavailable or has changed.', failed_at: new Date().toISOString() })
      summary.blocked += 1
      continue
    }

    try {
      const { data: cart, error: cartError } = await admin.from('abandoned_carts')
        .select('cart_started_at,cart_items').eq('id', id).maybeSingle()
      if (cartError || !cart?.cart_started_at) throw cartError || new Error('Cart is unavailable.')
      const start = new Date(cart.cart_started_at).getTime()
      if (!Number.isFinite(start)) throw new Error('Cart start time is invalid.')
      const { data: orders, error: orderError } = await admin.from('orders')
        .select('id,user_id,status,payment_status,payment_method,created_at,items')
        .eq('user_id', userId)
        .gte('created_at', new Date(start - 10 * 60_000).toISOString())
      if (orderError) throw orderError
      const completedOrder = (orders || []).find((order) =>
        isConfirmedCartOrder(order) && orderOverlapsCart(cart.cart_items, order.items))
      if (completedOrder) {
        if (!await associatePersistedOrder(admin, completedOrder)) {
          throw new Error('Could not confirm purchased cart state.')
        }
        await recordNotificationEvent(admin, emailEvent.id, { status: 'skipped', error: 'Cart already purchased.' })
        summary.blocked += 1
        continue
      }
    } catch (error) {
      console.error('GET /api/cron/abandoned-carts purchase verification failed:', error)
      await markFailed('Could not verify whether the cart was purchased.')
      await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Could not verify whether the cart was purchased.', failed_at: new Date().toISOString() })
      summary.blocked += 1
      continue
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = sha256(token)
    const { data: prepared, error: prepareError } = await admin.from('abandoned_carts').update({
      recovery_token_hash: tokenHash,
      recovery_token_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
      recovery_redeemed_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
      .eq('reminder_result', 'sending')
      .eq('reminder_attempt_at', attemptAt)
      .eq('recovery_email_consent', true)
      .is('reminder_sent_at', null)
      .is('closed_at', null)
      .is('order_id', null)
      .lte('last_activity_at', cutoff.toISOString())
      .select('id')
      .maybeSingle()
    if (prepareError || !prepared) {
      if (prepareError) console.error('GET /api/cron/abandoned-carts token preparation error:', prepareError)
      await markFailed('Cart eligibility changed before sending.')
      await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Cart eligibility changed before sending.', failed_at: new Date().toISOString() })
      summary.blocked += 1
      continue
    }

    try {
      const { data: eligible, error: eligibilityError } = await admin.from('abandoned_carts')
        .select('id').eq('id', id).eq('user_id', userId).eq('customer_email', expectedEmail)
        .eq('recovery_email_consent', true).eq('reminder_result', 'sending')
        .eq('recovery_token_hash', tokenHash).is('closed_at', null).is('order_id', null)
        .is('reminder_sent_at', null).lte('last_activity_at', cutoff.toISOString()).maybeSingle()
      if (eligibilityError || !eligible) {
        if (eligibilityError) console.error('Cart reminder final eligibility check failed:', eligibilityError)
        await markFailed('Cart eligibility changed before sending.')
        await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Cart eligibility changed before sending.', failed_at: new Date().toISOString() })
        summary.blocked += 1
        continue
      }
      const { data: preference, error: preferenceError } = await admin.from('cart_reminder_preferences')
        .select('opted_in,suppressed_at').eq('user_id', userId).maybeSingle()
      if (preferenceError || (preference && (!preference.opted_in || preference.suppressed_at))) {
        if (preferenceError) console.error('Cart reminder preference recheck failed:', preferenceError)
        await markFailed('Cart email preference changed before sending.')
        await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Cart email preference changed before sending.', failed_at: new Date().toISOString() })
        summary.blocked += 1
        continue
      }
      const { data: savedCart, error: savedCartError } = await admin.from('carts')
        .select('items').eq('user_id', userId).maybeSingle()
      const currentLines = normalizeTrackedLines(savedCart?.items)
      if (savedCartError || !currentLines.length ||
        JSON.stringify(currentLines) !== JSON.stringify(normalizeTrackedLines(row.cart_items))) {
        if (savedCartError) console.error('Cart reminder current cart lookup failed:', savedCartError)
        await markFailed('Saved cart changed before sending.')
        await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: 'Saved cart changed before sending.', failed_at: new Date().toISOString() })
        summary.blocked += 1
        continue
      }
      const sent = await sendCartRecoveryEmail({
        email: verifiedEmail,
        name: String(row.customer_name || ''),
        itemCount: Number(row.item_count || 1),
        items: Array.isArray(row.cart_items) ? row.cart_items : [],
        token,
        cartId: id,
      })
      const { data: recorded, error: recordError } = await admin.from('abandoned_carts').update({
        reminder_sent_at: new Date().toISOString(),
        reminder_result: 'sent',
        reminder_provider_id: sent.id || null,
        reminder_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('reminder_result', 'sending').eq('recovery_token_hash', tokenHash)
        .select('id').maybeSingle()
      if (recordError || !recorded) {
        console.error('GET /api/cron/abandoned-carts accepted send not recorded:', recordError)
        summary.uncertain += 1
      } else {
        await recordNotificationEvent(admin, emailEvent.id, { status: 'sent', provider_message_id: sent.id || null, sent_at: new Date().toISOString(), error: null })
        // Consent, cart state and purchase status can change while email is
        // being delivered. Re-read immediately before any marketing message.
        const { data: freshCart, error: freshCartError } = await admin.from('abandoned_carts')
          .select('id,customer_name,customer_phone,customer_email,item_count,cart_total,cart_items,whatsapp_marketing_consent,recovery_email_consent,last_activity_at,closed_at,order_id,reminder_sent_at')
          .eq('id', id).eq('whatsapp_marketing_consent', true).eq('recovery_email_consent', true)
          .is('closed_at', null).is('order_id', null).not('reminder_sent_at', 'is', null)
          .lte('last_activity_at', cutoff.toISOString()).maybeSingle()
        if (freshCartError) console.error('GET /api/cron/abandoned-carts WhatsApp eligibility recheck failed:', freshCartError)
        if (freshCart?.customer_phone) {
          const whatsappEvent = await beginCartNotificationEvent(admin, freshCart, 'whatsapp').catch(() => null)
          if (whatsappEvent?.status === 'sending') {
            try {
              const whatsapp = await sendAbandonedCartWhatsApp({ phone: String(freshCart.customer_phone), customer_name: String(freshCart.customer_name || ''), items: Array.isArray(freshCart.cart_items) ? freshCart.cart_items : [], recoveryUrl: safeRecoveryBaseUrl() + '/cart/recover?token=' + encodeURIComponent(token) })
              if (whatsapp.skipped) await recordNotificationEvent(admin, whatsappEvent.id, { status: 'skipped', error: whatsapp.reason || 'Not configured' })
              else await recordNotificationEvent(admin, whatsappEvent.id, { status: 'sent', provider_message_id: whatsapp.id, sent_at: new Date().toISOString() })
            } catch (whatsappError) {
              const known = whatsappError instanceof WhatsAppProviderRejectedError
              await recordNotificationEvent(admin, whatsappEvent.id, { status: known ? 'failed' : 'uncertain', error: compactError(whatsappError), failed_at: new Date().toISOString() })
            }
          }
        }
        summary.sent += 1
      }
    } catch (error) {
      const message = compactError(error)
      if (error instanceof MarketingEmailPausedError) {
        const { error: deferError } = await admin.rpc('ajr_defer_marketing_email', { p_campaign: 'cart', p_id: id, p_event_id: emailEvent.id })
        if (deferError) {
          console.error('Could not defer paused cart reminder:', deferError)
          summary.uncertain += 1
        } else summary.blocked += 1
      } else if (error instanceof CartRecoveryEligibilityError || error instanceof CartRecoveryEmailRejectedError || error instanceof CartRecoveryPreparationError) {
        await markFailed(message)
        await recordNotificationEvent(admin, emailEvent.id, { status: 'failed', error: message, failed_at: new Date().toISOString() })
        summary.failed += 1
      } else {
        // Do not retry an uncertain provider outcome: duplicate emails are worse
        // than an incomplete reminder. Admins can inspect this locked claim.
        const { error: recordError } = await admin.from('abandoned_carts').update({
          reminder_error: message,
          updated_at: new Date().toISOString(),
        }).eq('id', id).eq('reminder_result', 'sending').eq('recovery_token_hash', tokenHash)
        if (recordError) console.error('GET /api/cron/abandoned-carts uncertain result recording error:', recordError)
        summary.uncertain += 1
        await recordNotificationEvent(admin, emailEvent.id, { status: 'uncertain', error: 'Provider result uncertain: ' + message, failed_at: new Date().toISOString() })
        console.error('GET /api/cron/abandoned-carts delivery result uncertain:', error)
      }
    }
  }

  return NextResponse.json({ ok: true, thresholdMinutes: abandonmentMinutes(), ...summary })
}
