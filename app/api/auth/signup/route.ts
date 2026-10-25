import { NextRequest, NextResponse } from 'next/server'
import { cleanSupabaseUrl } from '@/lib/supabase'

// Supabase's built-in mailer is rate limited, and with "Confirm email" turned on
// every signup needs an email round-trip. Translate the provider wording into
// something a customer can act on instead of a generic failure.
function describeSignupError(message: string) {
  if (/rate limit/i.test(message)) {
    return 'Too many signup emails were requested right now. Please wait a few minutes and try again.'
  }
  if (/already registered|already exists|user already/i.test(message)) {
    return 'An account already exists for that email. Please log in instead.'
  }
  return message
}

export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string }

    try {
      body = await request.json()
    } catch (parseError) {
      console.error('Signup route JSON parse error:', parseError)
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 })
    }

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const firstName = String(body.firstName || '').trim()
    const lastName = String(body.lastName || '').trim()
    const phone = String(body.phone || '').trim()

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ message: 'Please provide a valid email and a 6-character password.' }, { status: 400 })
    }

    const url = cleanSupabaseUrl
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!url || !anonKey) {
      return NextResponse.json({ message: 'Supabase environment is not configured.' }, { status: 500 })
    }

    const response = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errorMessage = data?.msg || data?.error_description || 'Unable to create account.'
      return NextResponse.json({ message: describeSignupError(errorMessage) }, { status: response.status })
    }

    // `session` is only returned when Supabase does not require the customer to
    // confirm their email first, so the caller can tell the two cases apart.
    const user = data?.user || (data?.id ? data : null)
    const session = data?.session || (data?.access_token ? data : null)
    return NextResponse.json({
      user,
      session,
      needsConfirmation: Boolean(user) && !session,
    })
  } catch (error) {
    console.error('Signup route error:', error)
    return NextResponse.json({ message: 'Unable to create account.' }, { status: 500 })
  }
}
