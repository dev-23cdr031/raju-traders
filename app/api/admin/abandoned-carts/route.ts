import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes, isConfirmedCartOrder, matchedOrderItemTotal, orderOverlapsCart, trackedCartTotal } from '@/lib/abandoned-carts'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'
import { cartRecoveryConfigurationIssues } from '@/lib/marketing-email'

type ReminderHistory = { status: string | null; attempted_at: string | null; sent_at: string | null; delivery_status: string | null }
type ReminderBlocker = ReminderHistory & { reason: 'cooldown' | 'processing' | 'uncertain'; campaign: 'cart' | 'product'; eligible_at: string | null }
type ReminderDiagnostics = { cart_id: string; blocker: ReminderBlocker | null; previous: ReminderHistory | null; previous_sent: ReminderHistory | null }

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  const now = Date.now()
  const thresholdMs = abandonmentMinutes() * 60_000
  const params = request.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from).getTime() : now - 30 * 86400_000
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to).getTime() + 86400_000 : now + 1
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  try {
    const admin = supabaseAdmin()
    const { data: rows, error } = await admin.from('abandoned_carts')
      .select('id,user_id,cart_items,cart_total,item_count,customer_name,customer_email,customer_phone,device_category,recovery_email_consent,recovery_email_consent_at,cart_started_at,last_activity_at,closed_at,order_id,reminder_attempt_at,reminder_attempts,reminder_sent_at,reminder_result,reminder_error,reminder_provider_id,recovery_token_hash,created_at')
      .gt('item_count', 0)
      .order('last_activity_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    const cartRows = rows || []
    const diagnostics = new Map<string, ReminderDiagnostics>()
    for (let offset = 0; offset < cartRows.length; offset += 400) {
      const { data, error: diagnosticError } = await admin.rpc('ajr_cart_customer_diagnostics', {
        p_cart_ids: cartRows.slice(offset, offset + 400).map((row: { id: string }) => row.id),
      })
      if (diagnosticError) {
        console.error('Cart reminder diagnostics failed:', diagnosticError)
        throw new Error('Cart reminder diagnostics are unavailable. Apply supabase/cart-cooldown-diagnostics.sql before deploying the website.')
      }
      for (const diagnostic of (data || []) as ReminderDiagnostics[]) diagnostics.set(diagnostic.cart_id, diagnostic)
    }
    if (diagnostics.size !== cartRows.length) {
      throw new Error('Cart reminder diagnostics are unavailable. Refresh the dashboard and try again.')
    }
    const userIds = Array.from(new Set(cartRows.map((row: any) => row.user_id).filter(Boolean)))
    const preferences = new Map<string, { opted_in: boolean; opted_out_at: string | null; suppressed_at: string | null }>()
    for (let offset = 0; offset < userIds.length; offset += 400) {
      const { data: preferenceRows, error: preferenceError } = await admin.from('cart_reminder_preferences')
        .select('user_id,opted_in,opted_out_at,suppressed_at').in('user_id', userIds.slice(offset, offset + 400))
      if (preferenceError) throw preferenceError
      for (const preference of preferenceRows || []) preferences.set(preference.user_id, preference)
    }
    const eventKeys = cartRows.map((row: any) => `cart:${row.id}:recovery`)
    const emailEvents = new Map<string, { status: string; error: string | null; provider_message_id: string | null }>()
    for (let offset = 0; offset < eventKeys.length; offset += 400) {
      const { data: events, error: eventError } = await admin.from('notification_events')
        .select('event_key,status,error,provider_message_id').eq('event_type', 'abandoned_cart').eq('channel', 'email')
        .in('event_key', eventKeys.slice(offset, offset + 400))
      if (eventError) throw eventError
      for (const event of events || []) emailEvents.set(event.event_key, { status: event.status, error: event.error, provider_message_id: event.provider_message_id })
    }
    const providerIds = Array.from(new Set(cartRows.map((row: any) => row.reminder_provider_id).filter(Boolean)))
    const receiptStatuses = new Map<string, Set<string>>()
    for (let offset = 0; offset < providerIds.length; offset += 400) {
      const { data: receipts, error: receiptError } = await admin.from('notification_receipts')
        .select('provider_message_id,status').eq('provider', 'resend')
        .in('provider_message_id', providerIds.slice(offset, offset + 400))
      if (receiptError) throw receiptError
      for (const receipt of receipts || []) {
        const statuses = receiptStatuses.get(receipt.provider_message_id) || new Set<string>()
        statuses.add(receipt.status)
        receiptStatuses.set(receipt.provider_message_id, statuses)
      }
    }
    const orderIds = Array.from(new Set(cartRows.map((row: any) => row.order_id).filter(Boolean)))
    const ordersById = new Map<string, any>()
    for (let offset = 0; offset < orderIds.length; offset += 400) {
      const { data: orders, error: orderError } = await admin.from('orders')
        .select('id,order_number,status,payment_method,payment_status,total,created_at,items')
        .in('id', orderIds.slice(offset, offset + 400))
      if (orderError) throw orderError
      for (const order of orders || []) ordersById.set(order.id, order)
    }

    const carts = cartRows.map((row: any) => {
      const order = row.order_id ? ordersById.get(row.order_id) : null
      const recovered = Boolean(order && isConfirmedCartOrder(order)
        && orderOverlapsCart(row.cart_items, order.items))
      const lastActivity = new Date(row.last_activity_at).getTime()
      const receipts = receiptStatuses.get(row.reminder_provider_id) || new Set<string>()
      const deliveryStatus = ['email.complained', 'email.bounced', 'email.suppressed', 'email.failed', 'email.delivered']
        .find((status) => receipts.has(status)) || null
      const emailEvent = emailEvents.get(`cart:${row.id}:recovery`)
      const preference = preferences.get(row.user_id)
      const diagnostic = diagnostics.get(row.id)
      const permissionStatus = preference?.suppressed_at ? 'suppressed'
        : preference && !preference.opted_in && preference.opted_out_at ? 'opted_out'
          : row.recovery_email_consent && (!preference || preference.opted_in) ? 'valid'
            : preference?.opted_in ? 'not_enabled_for_cart' : 'missing'
      const recoverableClaim = row.reminder_result === 'sending' && row.reminder_attempt_at &&
        new Date(row.reminder_attempt_at).getTime() <= now - 30 * 60_000 &&
        !row.reminder_sent_at && !row.recovery_token_hash && !row.reminder_provider_id &&
        !emailEvent?.provider_message_id && !['sent', 'delivered', 'read', 'uncertain'].includes(emailEvent?.status || '')
      const eventRequiresReview = row.reminder_result !== 'sending' && !row.reminder_sent_at &&
        Boolean(emailEvent?.provider_message_id || ['sending', 'sent', 'delivered', 'read', 'uncertain'].includes(emailEvent?.status || ''))
      const emailStatus = deliveryStatus === 'email.bounced' ? 'Bounced'
        : deliveryStatus === 'email.failed' || deliveryStatus === 'email.suppressed' || deliveryStatus === 'email.complained' ? 'Failed'
          : deliveryStatus === 'email.delivered' || emailEvent?.status === 'delivered' ? 'Delivered'
            : row.reminder_sent_at || row.reminder_result === 'sent' ? 'Sent'
              : emailEvent?.status === 'skipped' ? 'Skipped'
              : emailEvent?.status === 'uncertain' ? 'Uncertain'
                : row.reminder_result === 'failed' || emailEvent?.status === 'failed' ? 'Failed'
                  : emailEvent?.status === 'sent' ? 'Sent'
                    : row.reminder_result === 'sending' || emailEvent?.status === 'sending' ? 'Sending'
                      : row.user_id && permissionStatus === 'valid' && row.customer_email && !row.closed_at && !row.order_id
                        ? diagnostic?.blocker ? 'Blocked' : 'Scheduled'
                        : 'Not eligible'
      const status = recovered ? 'Recovered' : row.closed_at ? 'Closed' : (lastActivity + thresholdMs > now ? 'Active' : 'Abandoned')
      return {
        id: row.id,
        userId: row.user_id,
        items: row.cart_items,
        itemCount: Number(row.item_count || 0),
        total: Number(row.cart_total || trackedCartTotal(row.cart_items || [])),
        customerName: row.customer_name || '',
        customerEmail: row.customer_email || '',
        customerPhone: row.customer_phone || '',
        guest: !row.user_id,
        device: row.device_category || null,
        consent: Boolean(row.recovery_email_consent),
        permissionStatus,
        consentAt: row.recovery_email_consent_at,
        startedAt: row.cart_started_at,
        lastActivityAt: row.last_activity_at,
        closedAt: row.closed_at,
        orderId: row.order_id,
        status,
        reminderAttemptAt: row.reminder_attempt_at,
        reminderAttempts: row.reminder_attempts,
        recoverableClaim: Boolean(recoverableClaim),
        eventRequiresReview,
        reminderSentAt: row.reminder_sent_at,
        reminderResult: row.reminder_result,
        reminderError: row.reminder_error,
        deliveryStatus,
        emailStatus,
        emailEventError: emailEvent?.error || null,
        customerBlocker: diagnostic?.blocker || null,
        previousReminder: diagnostic?.previous || null,
        previousSentReminder: diagnostic?.previous_sent || null,
        scheduledAt: new Date(lastActivity + thresholdMs).toISOString(),
        order: order ? {
          id: order.id,
          number: order.order_number,
          status: order.status,
          total: Number(order.total || 0),
          createdAt: order.created_at,
          matchedItems: orderOverlapsCart(row.cart_items, order.items),
        } : null,
      }
    })

    const inPeriod = carts.filter((cart: any) => {
      const activity = new Date(cart.lastActivityAt).getTime()
      return cart.itemCount > 0 && activity >= start && activity < end
    })
    const recovered = carts.filter((cart: any) => cart.status === 'Recovered')
    const abandoned = carts.filter((cart: any) => cart.status === 'Abandoned')
    const abandonedToday = abandoned.filter((cart: any) => {
      const abandonedAt = new Date(cart.lastActivityAt).getTime() + thresholdMs
      return abandonedAt >= todayStart.getTime() && abandonedAt <= now
    }).length
    const recoveredRevenue = recovered.reduce((sum: number, cart: any) => {
      const order = cart.order ? ordersById.get(cart.order.id) : null
      return sum + matchedOrderItemTotal(cart.items, order?.items)
    }, 0)
    const conversionCount = inPeriod.filter((cart: any) => cart.status === 'Recovered').length
    const abandonmentCount = inPeriod.filter((cart: any) => cart.status === 'Abandoned').length

    const emailConfigurationIssues = cartRecoveryConfigurationIssues()
    return NextResponse.json({
      carts,
      metrics: {
        abandonedCount: abandoned.length,
        abandonedToday,
        abandonedValue: abandoned.reduce((sum: number, cart: any) => sum + cart.total, 0),
        abandonmentRate: inPeriod.length ? Math.round((abandonmentCount / inPeriod.length) * 1000) / 10 : 0,
        recoveredCount: recovered.length,
        recoveredRevenue,
        periodCartCount: inPeriod.length,
        periodAbandonedCount: abandonmentCount,
        periodRecoveredCount: conversionCount,
        recoveryConversionRate: conversionCount + abandonmentCount
          ? Math.round((conversionCount / (conversionCount + abandonmentCount)) * 1000) / 10 : 0,
        thresholdMinutes: abandonmentMinutes(),
        trackedRecords: cartRows.length,
        truncated: cartRows.length === 5000,
        emailConfigured: emailConfigurationIssues.length === 0,
        emailConfigurationIssues,
      },
    })
  } catch (error: any) {
    console.error('GET /api/admin/abandoned-carts error:', error)
    return NextResponse.json({
      message: error?.message?.startsWith('Cart reminder diagnostics are unavailable.')
        ? error.message
        : error?.message?.includes('abandoned_carts')
        ? 'Abandoned-cart storage is not set up. Apply supabase/abandoned-carts.sql.'
        : 'Could not load abandoned carts.',
    }, { status: 503 })
  }
}
