import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess } from '@/lib/cms-auth'
import { cmsText } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response
  if (access.role !== 'super_admin') {
    return NextResponse.json({ message: 'Only a Super Admin can manage content roles.' }, { status: 403 })
  }
  try {
    const { data, error } = await supabaseAdmin().from('cms_user_roles')
      .select('user_id,email,role,assigned_by,created_at,updated_at').order('email').limit(1000)
    if (error) throw error
    return NextResponse.json({ roles: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/admin/content/roles failed:', error)
    return NextResponse.json({ message: 'Could not load content roles.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response
  if (access.role !== 'super_admin') {
    return NextResponse.json({ message: 'Only a Super Admin can assign content roles.' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const userId = String(body.userId || '').trim()
    const role = String(body.role || '')
    if (!USER_ID_PATTERN.test(userId)) return NextResponse.json({ message: 'Enter a valid Supabase user UUID.' }, { status: 400 })
    const admin = supabaseAdmin()

    if (role === 'remove') {
      const { error } = await admin.from('cms_user_roles').delete().eq('user_id', userId)
      if (error) throw error
      return NextResponse.json({ removed: true })
    }
    if (!['content_manager', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json({ message: 'Choose Content Manager, Editor, Viewer, or remove access.' }, { status: 400 })
    }

    const email = cmsText(body.email, 254).toLowerCase()
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError) throw userError
    if (!userResult?.user?.email || String(userResult.user.email).toLowerCase() !== email) {
      return NextResponse.json({ message: 'The email must match the selected Supabase Auth user.' }, { status: 400 })
    }
    const { data, error } = await admin.from('cms_user_roles').upsert({
      user_id: userId,
      email,
      role,
      assigned_by: String(access.user.email || '').toLowerCase(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('user_id,email,role,assigned_by,created_at,updated_at').single()
    if (error) throw error
    return NextResponse.json({ role: data })
  } catch (error) {
    console.error('PUT /api/admin/content/roles failed:', error)
    return NextResponse.json({ message: 'Could not update that content role.' }, { status: 503 })
  }
}
