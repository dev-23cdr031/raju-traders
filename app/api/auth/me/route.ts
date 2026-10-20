import { NextRequest, NextResponse } from 'next/server'
import { getUserFromToken } from '@/lib/supabase'

// GET /api/auth/me — resolve the current Supabase session into a user profile.
// Used by the shop to decide whether a customer is logged in (and therefore
// whether cart / wishlist / orders belong to them).
export async function GET(request: NextRequest) {
  try {
    const header = request.headers.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return NextResponse.json({ user: null }, { status: 401 })

    const user = await getUserFromToken(token)
    if (!user) return NextResponse.json({ user: null }, { status: 401 })

    const meta = (user.user_metadata || {}) as Record<string, any>
    const name = [meta.first_name, meta.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')

    return NextResponse.json({
      user: {
        id: user.id,
        email: String(user.email || '').toLowerCase(),
        name: name || String(user.email || '').split('@')[0],
        phone: String(meta.phone || ''),
        created_at: user.created_at,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || 'Unable to read session.' }, { status: 500 })
  }
}
