import { randomBytes, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes, sha256 } from '@/lib/abandoned-carts'
import { CartRecoveryEmailRejectedError, sendCartRecoveryEmail } from '@/lib/cart-recovery-email'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 20
const RETRY_AFTER_MS = 30 * 60_000

function hasValidCronAuthorization(request: NextRequest) {
  const expected = process.env.CRON_SECRET || ''
  const supplied = request.headers.get('authorization') || ''
  const expectedHeader = `Bearer ${expected}`
  if (!expected) return false
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
  if (!process.env.RESEND_API_KEY || process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') {
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
      summary.blocked += 1
      continue
    }

    try {
      const sent = await sendCartRecoveryEmail({
        email: verifiedEmail,
        name: String(row.customer_name || ''),
        itemCount: Number(row.item_count || 1),
        token,
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
        summary.sent += 1
      }
    } catch (error) {
      const message = compactError(error)
      if (error instanceof CartRecoveryEmailRejectedError) {
        await markFailed(message)
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
        console.error('GET /api/cron/abandoned-carts delivery result uncertain:', error)
      }
    }
  }

  return NextResponse.json({ ok: true, thresholdMinutes: abandonmentMinutes(), ...summary })
}
