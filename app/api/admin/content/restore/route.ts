import { NextRequest, NextResponse } from 'next/server'
import { writeCmsVersion } from '@/lib/cms-content'
import { requireCmsPermission } from '@/lib/cms-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const versionId = String(body.versionId || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) {
      return NextResponse.json({ message: 'Choose a valid version to restore.' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: version, error: versionError } = await admin.from('cms_content_versions')
      .select('*').eq('id', versionId).maybeSingle()
    if (versionError) throw versionError
    if (!version) return NextResponse.json({ message: 'That content version was not found.' }, { status: 404 })

    if (version.entity_type === 'site_content') {
      const { data: current, error: lookupError } = await admin.from('site_content')
        .select('*').eq('id', 1).maybeSingle()
      if (lookupError) throw lookupError
      if (current?.draft) {
        await writeCmsVersion(admin, 'site_content', '1', current.draft, 'draft', 'before-restore', access.user.email || '')
      }
      const { data, error } = await admin.from('site_content').upsert({
        id: 1,
        draft: version.snapshot,
        published: current?.published || {},
        scheduled_at: null,
        updated_by: access.user.email || '',
        updated_at: new Date().toISOString(),
        published_at: current?.published_at || null,
        published_by: current?.published_by || '',
      }, { onConflict: 'id' }).select('*').single()
      if (error) throw error
      return NextResponse.json({ content: data })
    }

    if (!['banner', 'recipe'].includes(version.entity_type) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version.entity_id)) {
      return NextResponse.json({ message: 'That content version cannot be restored.' }, { status: 400 })
    }

    const table = version.entity_type === 'banner' ? 'cms_banners' : 'cms_recipes'
    const { data: current, error: lookupError } = await admin.from(table).select('*').eq('id', version.entity_id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'The content item for that version no longer exists.' }, { status: 404 })
    await writeCmsVersion(
      admin,
      version.entity_type,
      version.entity_id,
      current.draft_data,
      current.status,
      'before-restore',
      access.user.email || '',
    )
    const restorePatch: Record<string, unknown> = {
      draft_data: version.snapshot,
      status: version.entity_type === 'banner'
        ? current.status === 'published' || (current.status === 'scheduled' && Object.keys(current.published_data || {}).length > 0) ? 'published' : 'draft'
        : current.status === 'published' ? 'published' : 'draft',
      updated_by: access.user.email || '',
      updated_at: new Date().toISOString(),
    }
    if (version.entity_type === 'banner') restorePatch.scheduled_at = null
    const { data, error } = await admin.from(table).update(restorePatch).eq('id', version.entity_id).select('*').single()
    if (error) throw error
    return NextResponse.json({ [version.entity_type]: data, restoredToDraft: true })
  } catch (error: any) {
    console.error('POST /api/admin/content/restore failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not restore that content version.' }, { status: 503 })
  }
}
