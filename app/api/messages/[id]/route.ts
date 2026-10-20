import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

// PATCH /api/messages/:id — mark a message read / unread (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const read = Boolean(body.read)
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('messages').update({ read }).eq('id', id).select('*').single()
    if (error) throw error
    return NextResponse.json({ message: data })
  } catch (e: any) {
    console.error('PATCH /api/messages/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to update message.' }, { status: 500 })
  }
}

// DELETE /api/messages/:id — delete a message (admin only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const admin = supabaseAdmin()
    const { error } = await admin.from('messages').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('DELETE /api/messages/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to delete message.' }, { status: 500 })
  }
}
