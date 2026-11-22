import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cleanSupabaseUrl } from '@/lib/supabase'

const resendRequests = new Map<string, number>()
const COOLDOWN_MS = 60_000

function mayResend(email: string, request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  const now = Date.now()
  for (const [key, until] of resendRequests) {
    if (until <= now) resendRequests.delete(key)
  }
  if (resendRequests.size > 10000) resendRequests.clear()
  for (const key of [`email:${email}`, `ip:${ip}`]) {
    if ((resendRequests.get(key) || 0) > now) return false
  }
  resendRequests.set(`email:${email}`, now + COOLDOWN_MS)
  resendRequests.set(`ip:${ip}`, now + COOLDOWN_MS)
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { email?: string } | null
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 })
    }
    if (!mayResend(email, request)) {
      return NextResponse.json({ message: 'A code was requested recently. Please wait before trying again.' }, { status: 429 })
    }

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    if (!cleanSupabaseUrl || !anonKey) {
      return NextResponse.json({ message: 'Authentication is not configured.' }, { status: 500 })
    }

    const authClient = createClient(cleanSupabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error } = await authClient.auth.resend({ type: 'signup', email })
    if (error) {
      if (/rate limit|too many/i.test(error.message)) {
        return NextResponse.json({ message: 'A code was requested recently. Please wait before trying again.' }, { status: 429 })
      }
      return NextResponse.json({ message: 'We could not resend the verification code.' }, { status: 400 })
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error('OTP resend route error:', error)
    return NextResponse.json({ message: 'We could not resend the verification code right now.' }, { status: 500 })
  }
}
