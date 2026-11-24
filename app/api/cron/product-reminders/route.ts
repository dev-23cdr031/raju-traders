import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { currentProductOffer, productReminderEmail } from '@/lib/product-reminder-email'
import { marketingEmailConfigured, MarketingEmailPausedError, MarketingEmailRejectedError, sendMarketingEmail } from '@/lib/marketing-email'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const received = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  return secret.length >= 32 && Buffer.byteLength(received) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
  if (!marketingEmailConfigured() || (process.env.PRODUCT_REMINDER_TOKEN_SECRET || '').length < 32) {
    return NextResponse.json({ message: 'Product reminder delivery is not configured.' }, { status: 503 })
  }
  const admin = supabaseAdmin()
  const { data: enabled, error: settingsError } = await admin.rpc('ajr_marketing_campaign_enabled', { p_campaign: 'product' })
  if (settingsError || typeof enabled !== 'boolean') {
    console.error('Product automation setting unavailable:', settingsError)
    return NextResponse.json({ message: 'Automation setting unavailable.' }, { status: 503 })
  }
  if (!enabled) return NextResponse.json({ processed: 0, paused: true })
  const { data: candidates, error } = await admin.rpc('ajr_claim_product_reminders', { p_limit: 5 })
  if (error) {
    console.error('Product reminder claim failed:', error.message)
    return NextResponse.json({ message: 'Could not claim reminders.' }, { status: 503 })
  }

  const results = await Promise.all((candidates || []).map(async (candidate: {
    id: string; user_id: string; product_id: number; attempts: number
  }) => {
    const finish = async (patch: Record<string, unknown>) => {
      const { error: updateError } = await admin.from('product_reminders').update({
        ...patch, updated_at: new Date().toISOString(),
      }).eq('id', candidate.id).eq('status', 'sending')
      if (updateError) throw updateError
    }
    let sendStarted = false
    try {
      const [preference, product, reminder, userResult] = await Promise.all([
        admin.from('product_reminder_preferences').select('opted_in,suppressed_at').eq('user_id', candidate.user_id).maybeSingle(),
        admin.from('products').select('name,image,detail,price,type,varieties,pack_sizes,active').eq('id', candidate.product_id).maybeSingle(),
        admin.from('product_reminders').select('status,cancel_reason').eq('id', candidate.id).maybeSingle(),
        admin.auth.admin.getUserById(candidate.user_id),
      ])
      if (preference.error || product.error || reminder.error || userResult.error) {
        throw preference.error || product.error || reminder.error || userResult.error
      }
      const user = userResult.data.user
      if (!preference.data?.opted_in || preference.data.suppressed_at || !user?.email || !user.email_confirmed_at ||
        !product.data?.active || reminder.data?.status !== 'sending' || reminder.data.cancel_reason) {
        await finish({ status: 'cancelled', cancel_reason: reminder.data?.cancel_reason || 'ineligible' })
        return 'cancelled'
      }
      const offer = currentProductOffer(product.data)
      const email = productReminderEmail({
        id: candidate.id,
        customerName: String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.first_name || '').slice(0, 100),
        productName: String(product.data.name || '').slice(0, 200),
        productImage: offer.image,
        description: String(product.data.detail || '').trim().slice(0, 240),
        price: offer.price,
        weight: offer.weight,
        variety: offer.variety,
      })
      const [finalPreference, finalReminder] = await Promise.all([
        admin.from('product_reminder_preferences').select('opted_in,suppressed_at').eq('user_id', candidate.user_id).maybeSingle(),
        admin.from('product_reminders').select('status,cancel_reason').eq('id', candidate.id).maybeSingle(),
      ])
      if (finalPreference.error || finalReminder.error) throw finalPreference.error || finalReminder.error
      if (!finalPreference.data?.opted_in || finalPreference.data.suppressed_at ||
        finalReminder.data?.status !== 'sending' || finalReminder.data.cancel_reason) {
        await finish({ status: 'cancelled', cancel_reason: finalReminder.data?.cancel_reason || 'ineligible' })
        return 'cancelled'
      }
      sendStarted = true
      const body = await sendMarketingEmail({ campaign: 'product', id: candidate.id, to: user.email, ...email })
      await finish({ status: 'sent', provider_message_id: body.id, sent_at: new Date().toISOString(), error: null })
      return 'sent'
    } catch (reason) {
      console.error('Product reminder processing failed:', reason)
      try {
        if (reason instanceof MarketingEmailPausedError) {
          const { error: deferError } = await admin.rpc('ajr_defer_marketing_email', { p_campaign: 'product', p_id: candidate.id })
          if (deferError) throw deferError
          return 'paused'
        }
        if (reason instanceof MarketingEmailRejectedError) {
          const retry = reason.status === 429 && candidate.attempts < 3
          await finish({ status: reason.status === 409 ? 'cancelled' : retry ? 'pending' : 'failed',
            ...(retry ? { next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString() } : {}),
            error: reason.message })
          return retry ? 'retry' : 'failed'
        }
        const retry = !sendStarted && candidate.attempts < 3
        await finish({
          status: sendStarted ? 'uncertain' : retry ? 'pending' : 'failed',
          ...(retry ? { next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString() } : {}),
          error: sendStarted ? 'Delivery outcome unknown; manual review required.' : 'Eligibility or preparation failed.',
        })
      } catch (updateError) {
        console.error('Product reminder status update failed:', updateError)
      }
      return 'failed'
    }
  }))
  return NextResponse.json({ processed: results.length, results }, { headers: { 'Cache-Control': 'no-store' } })
}
