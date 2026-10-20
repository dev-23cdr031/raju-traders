import { NextRequest, NextResponse } from 'next/server'

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
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
      const errorMessage = data?.msg || data?.error_description || data?.message || 'Unable to sign in.'
      return NextResponse.json({ message: errorMessage, fullError: data }, { status: response.status })
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