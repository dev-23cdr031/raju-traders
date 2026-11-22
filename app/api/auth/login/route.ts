import { after, NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { cleanSupabaseUrl } from '@/lib/supabase'
import { recordAuthEvent } from '@/lib/auth-audit'

const failedLoginBuckets = new Map<string, { startedAt: number; count: number }>()
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURE_EVENTS_PER_WINDOW = 5

function mayRecordFailure(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const source = request.headers.get('x-real-ip') || forwarded || 'unknown'
  const now = Date.now()
  for (const [key, bucket] of failedLoginBuckets) {
    if (now - bucket.startedAt > FAILURE_WINDOW_MS) failedLoginBuckets.delete(key)
  }
  if (failedLoginBuckets.size > 10000) failedLoginBuckets.delete(failedLoginBuckets.keys().next().value!)
  const bucket = failedLoginBuckets.get(source)
  if (!bucket || now - bucket.startedAt > FAILURE_WINDOW_MS) {
    failedLoginBuckets.set(source, { startedAt: now, count: 1 })
    return true
  }
  if (bucket.count >= MAX_FAILURE_EVENTS_PER_WINDOW) return false
  bucket.count += 1
  return true
}

export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string }

    try {
      body = await request.json()
    } catch (parseError) {
      console.error('Login route JSON parse error:', parseError)
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 })
    }

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 })
    }

    const url = cleanSupabaseUrl
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!url || !anonKey) {
      return NextResponse.json({ message: 'Supabase environment is not configured.' }, { status: 500 })
    }

    const sendAuthRequest = () => fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    let response: Response
    try {
      response = await sendAuthRequest()
    } catch (error) {
      const code = String((error as any)?.cause?.code || '')
      if (code !== 'ENOTFOUND' && code !== 'EAI_AGAIN') throw error
      await new Promise((resolve) => setTimeout(resolve, 300))
      response = await sendAuthRequest()
    }

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      if ((response.status === 400 || response.status === 401) && mayRecordFailure(request)) {
        after(async () => {
          await recordAuthEvent({ eventType: 'login_failure', userAgent: request.headers.get('user-agent') })
        })
      }
      const errorMessage = data?.msg || data?.error_description || data?.message || 'Unable to sign in.'
      return NextResponse.json({ message: errorMessage, fullError: data }, { status: response.status })
    }

    if (data.user?.id) {
      after(async () => {
        await recordAuthEvent({
          eventType: 'login_success',
          userId: data.user.id,
          userAgent: request.headers.get('user-agent'),
          loginMethod: 'password',
          sessionRef: randomUUID(),
        })
      })
    }
    return NextResponse.json({ user: data.user || null, session: data })
  } catch (error) {
    console.error('Login route error:', error)
    const code = String((error as any)?.cause?.code || '')
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return NextResponse.json(
        { message: 'Could not reach Supabase Auth. Check your network connection and Supabase project URL, then try again.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ message: 'Unable to sign in.' }, { status: 500 })
  }
}