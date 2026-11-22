import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_AUTH_USERS = 50000
const MAX_AUDIT_EVENTS = 50000
const PAGE_SIZE = 25
const DEVICE_FILTERS = new Set(['Desktop', 'Mobile', 'Tablet', 'Other'])
const STATUSES = new Set(['Active', 'Pending Verification', 'Disabled'])

type AuditEvent = {
  id: string
  user_id: string | null
  event_type: 'login_success' | 'login_failure' | 'logout'
  device: string | null
  browser: string | null
  os: string | null
  login_method: string | null
  session_ref: string | null
  created_at: string
}

function isDate(value: string) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function getStatus(user: any, now: number) {
  if (user.banned_until && Date.parse(user.banned_until) > now) return 'Disabled'
  if (!user.confirmed_at && !user.email_confirmed_at) return 'Pending Verification'
  return 'Active'
}

async function loadUsers(admin: ReturnType<typeof supabaseAdmin>) {
  const users: any[] = []
  for (let page = 1; page <= Math.ceil(MAX_AUTH_USERS / 1000) + 1; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const current = data?.users ?? []
    if (page > Math.ceil(MAX_AUTH_USERS / 1000)) {
      if (current.length) throw new Error('Too many auth users to load safely.')
      return users
    }
    users.push(...current)
    if (current.length < 1000) return users
  }
  throw new Error('Too many auth users to load safely.')
}

async function loadEvents(admin: ReturnType<typeof supabaseAdmin>) {
  const events: AuditEvent[] = []
  for (let start = 0; start <= MAX_AUDIT_EVENTS; start += 1000) {
    const { data, error } = await admin
      .from('auth_login_events')
      .select('id,user_id,event_type,device,browser,os,login_method,session_ref,created_at')
      .order('created_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw error
    const current = (data ?? []) as AuditEvent[]
    if (start === MAX_AUDIT_EVENTS) {
      if (current.length) throw new Error('Too many audit events to load safely.')
      return events
    }
    events.push(...current)
    if (current.length < 1000) return events
  }
  throw new Error('Too many audit events to load safely.')
}

function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  const params = request.nextUrl.searchParams
  const q = (params.get('q') || '').trim().slice(0, 100).toLocaleLowerCase()
  const registeredFrom = params.get('registeredFrom') || ''
  const registeredTo = params.get('registeredTo') || ''
  const lastLoginFrom = params.get('lastLoginFrom') || ''
  const lastLoginTo = params.get('lastLoginTo') || ''
  const status = params.get('status') || ''
  const device = params.get('device') || ''
  const sort = params.get('sort') || 'desc'
  const page = Number(params.get('page') || '1')
  const exportCsv = params.get('export') === 'csv'

  if (![registeredFrom, registeredTo, lastLoginFrom, lastLoginTo].every(isDate)
    || (status && !STATUSES.has(status))
    || (device && device !== 'all' && !DEVICE_FILTERS.has(device))
    || !['asc', 'desc'].includes(sort)
    || (!exportCsv && (!Number.isInteger(page) || page < 1 || page > 10000))) {
    return NextResponse.json({ message: 'Invalid search or pagination filters.' }, { status: 400 })
  }

  try {
    const admin = supabaseAdmin()
    const now = Date.now()
    const [users, eventsResult] = await Promise.all([
      loadUsers(admin),
      loadEvents(admin).then((events) => ({ events, enabled: true as const }))
        .catch(() => ({ events: [] as AuditEvent[], enabled: false as const })),
    ])
    const events = eventsResult.events
    const userById = new Map(users.map((user) => [user.id, user]))
    const loginCounts = new Map<string, number>()
    const latestDevices = new Map<string, AuditEvent>()
    for (const event of events) {
      if (!event.user_id) continue
      if (event.event_type === 'login_success') {
        loginCounts.set(event.user_id, (loginCounts.get(event.user_id) || 0) + 1)
        if (!latestDevices.has(event.user_id)) latestDevices.set(event.user_id, event)
      }
    }

    const from = (value: string) => value ? Date.parse(`${value}T00:00:00.000Z`) : null
    const to = (value: string) => value ? Date.parse(`${value}T23:59:59.999Z`) : null
    const filtered = users.map((user) => {
      const metadata = user.user_metadata || {}
      const firstName = String(metadata.first_name || '').trim()
      const lastName = String(metadata.last_name || '').trim()
      const name = [firstName, lastName].filter(Boolean).join(' ')
      const deviceEvent = latestDevices.get(user.id)
      const deviceName = deviceEvent ? [deviceEvent.device, deviceEvent.browser, deviceEvent.os].filter(Boolean).join(' · ') : null
      const recordedLoginCount = loginCounts.get(user.id) || 0
      return {
        id: user.id,
        name: name || null,
        email: user.email || null,
        phone: user.phone || metadata.phone || null,
        createdAt: user.created_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        confirmedAt: user.confirmed_at || user.email_confirmed_at || null,
        status: getStatus(user, now),
        loginCount: eventsResult.enabled && (recordedLoginCount > 0 || !user.last_sign_in_at) ? recordedLoginCount : null,
        device: deviceName,
        deviceType: deviceEvent?.device || null,
      }
    }).filter((user) => {
      const registeredAt = user.createdAt ? Date.parse(user.createdAt) : NaN
      const lastLoginAt = user.lastSignInAt ? Date.parse(user.lastSignInAt) : NaN
      const searchText = `${user.name || ''} ${user.email || ''} ${user.phone || ''}`.toLocaleLowerCase()
      return (!q || searchText.includes(q))
        && (!status || user.status === status)
        && (!device || device === 'all' || user.deviceType === device)
        && (from(registeredFrom) === null || registeredAt >= from(registeredFrom)!)
        && (to(registeredTo) === null || registeredAt <= to(registeredTo)!)
        && (from(lastLoginFrom) === null || lastLoginAt >= from(lastLoginFrom)!)
        && (to(lastLoginTo) === null || lastLoginAt <= to(lastLoginTo)!)
    }).sort((a, b) => {
      const difference = Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
      return sort === 'asc' ? difference : -difference
    })

    if (exportCsv) {
      const columns = ['ID', 'Customer name', 'Email', 'Phone', 'Registration', 'Last sign in', 'Last recorded device', 'Status', 'Successful logins (instrumentation era)']
      const rows = filtered.map((user) => [
        user.id, user.name || 'Not Provided', user.email || 'Not Provided', user.phone || 'Not Provided',
        user.createdAt || 'Not Provided', user.lastSignInAt || 'Not Recorded', user.device || 'Not Recorded',
        user.status, user.loginCount === null ? 'Not Recorded' : user.loginCount,
      ])
      const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
      return new Response(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ajr-login-users.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }

    const today = new Date()
    const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    const stats = {
      totalUsers: users.length,
      signedInToday: users.filter((user) => user.last_sign_in_at && Date.parse(user.last_sign_in_at) >= todayStart).length,
      active30Days: users.filter((user) => user.last_sign_in_at && now - Date.parse(user.last_sign_in_at) <= 30 * 24 * 60 * 60 * 1000).length,
      registeredToday: users.filter((user) => user.created_at && Date.parse(user.created_at) >= todayStart).length,
      registeredThisMonth: users.filter((user) => user.created_at && Date.parse(user.created_at) >= monthStart).length,
      successfulLogins: eventsResult.enabled ? events.filter((event) => event.event_type === 'login_success').length : null,
      failedLogins: eventsResult.enabled ? events.filter((event) => event.event_type === 'login_failure').length : null,
    }
    const recentActivity = events.slice(0, 12).map((event) => {
      const user = event.user_id ? userById.get(event.user_id) : null
      const metadata = user?.user_metadata || {}
      const customerName = [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim()
      return {
        id: event.id,
        eventType: event.event_type,
        userId: event.user_id,
        customerName: customerName || (event.event_type === 'login_failure' ? 'Unresolved sign-in' : user?.email || 'Customer'),
        device: [event.device, event.browser, event.os].filter(Boolean).join(' · ') || 'Not Provided',
        createdAt: event.created_at,
      }
    })
    const firstRecordedAt = events.length ? events[events.length - 1].created_at : null
    const start = (page - 1) * PAGE_SIZE
    return NextResponse.json({
      users: filtered.slice(start, start + PAGE_SIZE),
      total: filtered.length,
      page,
      pageSize: PAGE_SIZE,
      stats,
      recentActivity,
      trackingEnabled: eventsResult.enabled,
      firstRecordedAt,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/admin/login-users failed.')
    return NextResponse.json({ message: error?.message || 'Unable to load login users.' }, { status: 500 })
  }
}
