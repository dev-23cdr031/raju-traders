import { NextRequest, NextResponse } from 'next/server'
import { requireCmsPermission } from '@/lib/cms-auth'
import { supabaseAdmin } from '@/lib/supabase'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function containsUrl(value: unknown, url: string): boolean {
  if (typeof value === 'string') return value === url
  if (Array.isArray(value)) return value.some((item) => containsUrl(item, url))
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsUrl(item, url))
  return false
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response
  const { id } = await params
  if (!ID_PATTERN.test(id)) return NextResponse.json({ message: 'Invalid media ID.' }, { status: 400 })

  try {
    const admin = supabaseAdmin()
    const { data: media, error: mediaError } = await admin.from('cms_media')
      .select('id,storage_path,public_url').eq('id', id).maybeSingle()
    if (mediaError) throw mediaError
    if (!media) return NextResponse.json({ message: 'Image not found.' }, { status: 404 })

    const [contentResult, bannersResult, recipesResult] = await Promise.all([
      admin.from('site_content').select('draft,published').eq('id', 1).maybeSingle(),
      admin.from('cms_banners').select('draft_data,published_data'),
      admin.from('cms_recipes').select('draft_data,published_data'),
    ])
    for (const result of [contentResult, bannersResult, recipesResult]) {
      if (result.error) throw result.error
    }
    const records = [
      contentResult.data,
      ...(bannersResult.data || []),
      ...(recipesResult.data || []),
    ]
    if (records.some((record) => containsUrl(record, media.public_url))) {
      return NextResponse.json({ message: 'This image is still referenced by saved or published content. Replace it there before deleting.' }, { status: 409 })
    }

    const { error: storageError } = await admin.storage.from('website-media').remove([media.storage_path])
    if (storageError) throw storageError
    const { error: deleteError } = await admin.from('cms_media').delete().eq('id', id)
    if (deleteError) throw deleteError
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('DELETE /api/admin/content/media/[id] failed:', error)
    return NextResponse.json({ message: 'Could not delete this image.' }, { status: 503 })
  }
}
