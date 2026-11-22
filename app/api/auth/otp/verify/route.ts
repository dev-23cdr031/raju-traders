import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cleanSupabaseUrl } from '@/lib/supabase'

const verificationAttempts = new Map<string, { startedAt: number; count: number }>()
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

function isAllowed(email: string, request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const key = `${forwarded || request.headers.get('x-real-ip') || 'unknown'}:${email}`
  const now = Date.now()
  for (const [entryKey, value] of verificationAttempts) {
    if (now - value.startedAt > ATTEMPT_WINDOW_MS) verificationAttempts.delete(entryKey)
  }
  if (verificationAttempts.size > 10000) verificationAttempts.clear()
  const attempt = verificationAttempts.get(key)
  if (!attempt || now - attempt.startedAt > ATTEMPT_WINDOW_MS) {
    verificationAttempts.set(key, { startedAt: now, count: 1 })
    return true
  }
  if (attempt.count >= MAX_ATTEMPTS) return false
  attempt.count += 1
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { email?: string; token?: string } | null
    const email = String(body?.email || '').trim().toLowerCase()
    const token = String(body?.token || '').replace(/\D/g, '').slice(0, 6)

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json({ message: 'Enter the six-digit verification code.' }, { status: 400 })
    }
    if (!isAllowed(email, request)) {
      return NextResponse.json({ message: 'Too many verification attempts. Please wait before trying again.' }, { status: 429 })
    }

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    if (!cleanSupabaseUrl || !anonKey) {
      return NextResponse.json({ message: 'Authentication is not configured.' }, { status: 500 })
    }

    const authClient = createClient(cleanSupabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await authClient.auth.verifyOtp({ email, token, type: 'signup' })
    if (error || !data.session) {
      const message = /expired/i.test(error?.message || '')
        ? 'This verification code has expired. Resend a new code.'
        : /invalid|token/i.test(error?.message || '')
          ? 'Invalid verification code.'
          : 'We could not verify that code.'
      return NextResponse.json({ message }, { status: 400 })
    }

    return NextResponse.json({
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      session: data.session,
    })
  } catch (error) {
    console.error('OTP verification route error:', error)
    return NextResponse.json({ message: 'We could not verify that code right now.' }, { status: 500 })
  }
}
