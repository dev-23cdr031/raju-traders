import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes } from '@/lib/abandoned-carts'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

const mask = (value: string) => {
  const at = value.indexOf('@')
  if (at > 1) return value.slice(0, 2) + '•••' + value.slice(at)
  const digits = value.replace(/\D/g, '')
  return digits ? '••••' + digits.slice(-4) : 'Hidden'
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const cutoff = new Date(Date.now() - abandonmentMinutes() * 60_000).toISOString()
    const [{ data: events, error }, { count: carts }, { count: recovered }, { count: remindersSent }, { count: remindersFailed }, ...counts] = await Promise.all([
      admin.from('notification_events').select('id,event_type,channel,recipient,status,provider_message_id,error,retry_count,created_at,sent_at,delivered_at').order('created_at', { ascending: false }).limit(150),
      admin.from('abandoned_carts').select('*', { count: 'exact', head: true }).gt('item_count', 0).is('closed_at', null).lte('last_activity_at', cutoff),
      admin.from('abandoned_carts').select('*', { count: 'exact', head: true }).not('order_id', 'is', null).not('closed_at', 'is', null).not('reminder_sent_at', 'is', null),
      admin.from('abandoned_carts').select('*', { count: 'exact', head: true }).not('reminder_sent_at', 'is', null),
      admin.from('abandoned_carts').select('*', { count: 'exact', head: true }).eq('reminder_result', 'failed'),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).in('channel', ['email', 'admin_email']).in('status', ['sent', 'delivered', 'read']),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).in('channel', ['email', 'admin_email']).in('status', ['delivered', 'read']),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).in('channel', ['email', 'admin_email']).eq('status', 'failed'),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).eq('channel', 'whatsapp').in('status', ['sent', 'delivered', 'read']),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).eq('channel', 'whatsapp').in('status', ['delivered', 'read']),
      admin.from('notification_events').select('*', { count: 'exact', head: true }).eq('channel', 'whatsapp').eq('status', 'failed'),
    ])
    if (error) throw error
    const rows = events || []
    return NextResponse.json({
      events: rows.map((row: any) => ({ ...row, recipient: mask(String(row.recipient || '')) })),
      metrics: {
        email: { sent: counts[0].count, delivered: counts[1].count, failed: counts[2].count },
        whatsapp: { sent: counts[3].count, delivered: counts[4].count, failed: counts[5].count },
        abandonedCarts: carts || 0,
        recoveredCarts: recovered || 0,
        recovery: { sent: remindersSent || 0, failed: remindersFailed || 0, conversionRate: remindersSent ? Math.round(((recovered || 0) / remindersSent) * 1000) / 10 : null },
      },
      settings: {
        email: Boolean(process.env.RESEND_API_KEY) && process.env.NOTIFICATIONS_EMAIL_ENABLED !== 'false',
        whatsapp: Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID) && process.env.NOTIFICATIONS_WHATSAPP_ENABLED !== 'false',
        scheduler: Boolean(process.env.CRON_SECRET),
        metaWebhook: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN),
        resendWebhook: Boolean(process.env.RESEND_WEBHOOK_SECRET),
        cartMinutes: abandonmentMinutes(),
      },
    })
  } catch (error: any) {
    console.error('GET /api/admin/notification-automation failed:', error)
    return NextResponse.json({ message: 'Notification automation is unavailable. Apply supabase/notification-automation.sql first.' }, { status: 503 })
  }
}
