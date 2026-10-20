import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

// GET /api/messages — contact inquiries (admin only)
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('messages').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    return NextResponse.json({ messages: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || 'Failed to load messages.' }, { status: 500 })
  }
}

// POST /api/messages — public contact form saves here
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || body.customer || '').trim()
    const email = String(body.email || '').trim()
    const message = String(body.message || body.detail || '').trim()
    if (!name || !email || !message) return NextResponse.json({ message: 'Name, email and message are required.' }, { status: 400 })
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('messages')
      .insert({
        customer: name,
        email,
        phone: String(body.phone || ''),
        subject: String(body.subject || body.category || 'General inquiry'),
        detail: message,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, message: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || 'Failed to send message.' }, { status: 500 })
  }
}
