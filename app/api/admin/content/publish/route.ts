import { NextRequest, NextResponse } from 'next/server'
import { requireCmsPermission } from '@/lib/cms-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const access = await requireCmsPermission(request, 'publish')
  if ('response' in access) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('site_content')
      .select('*').eq('id', 1).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Save a draft before publishing.' }, { status: 400 })

    if (body.cancelSchedule === true) {
      const { data, error } = await admin.from('site_content')
        .update({ scheduled_at: null, updated_at: new Date().toISOString(), updated_by: access.user.email || '' })
        .eq('id', 1).select('*').single()
      if (error) throw error
      return NextResponse.json({ content: data })
    }

    const scheduledAt = body.scheduleAt ? new Date(String(body.scheduleAt)) : null
    if (body.scheduleAt && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
      return NextResponse.json({ message: 'Choose a future publication time.' }, { status: 400 })
    }
    if (scheduledAt) {
      const { data, error } = await admin.from('site_content').update({
        scheduled_at: scheduledAt.toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: access.user.email || '',
      }).eq('id', 1).select('*').single()
      if (error) throw error
      return NextResponse.json({ content: data, scheduled: true })
    }

    if (current.published) {
      const { error: versionError } = await admin.from('cms_content_versions').insert({
        entity_type: 'site_content',
        entity_id: '1',
        snapshot: current.published,
        status: 'published',
        action: 'before-publish',
        admin_email: access.user.email || '',
      })
      if (versionError) throw versionError
    }
    const now = new Date().toISOString()
    const { data, error } = await admin.from('site_content').update({
      published: current.draft,
      scheduled_at: null,
      published_at: now,
      published_by: access.user.email || '',
      updated_at: now,
      updated_by: access.user.email || '',
    }).eq('id', 1).select('*').single()
    if (error) throw error
    return NextResponse.json({ content: data, scheduled: false })
  } catch (error: any) {
    console.error('POST /api/admin/content/publish failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not publish website content.' }, { status: 503 })
  }
}
