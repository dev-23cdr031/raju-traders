import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess, requireCmsPermission } from '@/lib/cms-auth'
import { cmsDate, cmsLink, cmsText, writeCmsVersion } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const imageUrl = (value: unknown) => {
  const image = cmsText(value, 2000)
  if (!image) return ''
  if (image.startsWith('/') && !image.startsWith('//') && !image.includes('..') && !image.includes('\\')) return image
  try {
    const url = new URL(image)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function bannerData(body: any) {
  const title = cmsText(body.title, 120)
  if (!title) throw new Error('Banner title is required.')
  const rawDesktopImage = cmsText(body.desktop_image, 2000)
  const rawMobileImage = cmsText(body.mobile_image, 2000)
  const desktopImage = imageUrl(rawDesktopImage)
  const mobileImage = imageUrl(rawMobileImage)
  if ((rawDesktopImage && !desktopImage) || (rawMobileImage && !mobileImage)) {
    throw new Error('Use an HTTPS image URL or a safe site image path.')
  }
  const startsAt = cmsDate(body.starts_at)
  const expiresAt = cmsDate(body.expires_at)
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    throw new Error('Banner expiry must be later than its start time.')
  }
  return {
    title,
    description: cmsText(body.description, 1000, true),
    desktop_image: desktopImage,
    mobile_image: mobileImage || desktopImage,
    alt_text: cmsText(body.alt_text, 300),
    cta_label: cmsText(body.cta_label, 60),
    cta_href: cmsLink(body.cta_href, '/shop'),
    starts_at: startsAt,
    expires_at: expiresAt,
    sort_order: Math.max(-10000, Math.min(10000, Math.trunc(Number(body.sort_order) || 0))),
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response
  const { id } = await params
  if (!ID_PATTERN.test(id)) return NextResponse.json({ message: 'Invalid banner ID.' }, { status: 400 })

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'draft')
    if (!['draft', 'publish', 'schedule'].includes(action)) {
      return NextResponse.json({ message: 'Choose save draft, publish now, or schedule.' }, { status: 400 })
    }
    const permission = await requireCmsPermission(request, action === 'draft' ? 'draft' : 'publish')
    if ('response' in permission) return permission.response
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('cms_banners').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Banner not found.' }, { status: 404 })

    const draft = bannerData(body)
    const scheduledAt = action === 'schedule' ? cmsDate(body.scheduledAt || draft.starts_at) : null
    if (action === 'schedule' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      return NextResponse.json({ message: 'Choose a future publication time for this banner.' }, { status: 400 })
    }
    await writeCmsVersion(admin, 'banner', id, current.draft_data, current.status, `before-${action}`, access.user.email || '')
    const now = new Date().toISOString()
    const { data, error } = await admin.from('cms_banners').update({
      draft_data: draft,
      published_data: action === 'publish' ? draft : current.published_data,
      status: action === 'publish'
        ? 'published'
        : action === 'schedule'
          ? 'scheduled'
          : current.status === 'published' || (current.status === 'scheduled' && Object.keys(current.published_data || {}).length > 0)
            ? 'published'
            : 'draft',
      scheduled_at: scheduledAt,
      starts_at: draft.starts_at,
      expires_at: draft.expires_at,
      sort_order: draft.sort_order,
      updated_by: access.user.email || '',
      published_by: action === 'publish' ? access.user.email || '' : current.published_by,
      updated_at: now,
      published_at: action === 'publish' ? now : current.published_at,
    }).eq('id', id).select('*').single()
    if (error) throw error
    return NextResponse.json({ banner: data })
  } catch (error: any) {
    console.error('PUT /api/admin/content/banners/[id] failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not update banner.' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response
  const { id } = await params
  if (!ID_PATTERN.test(id)) return NextResponse.json({ message: 'Invalid banner ID.' }, { status: 400 })
  try {
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('cms_banners').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Banner not found.' }, { status: 404 })
    await writeCmsVersion(admin, 'banner', id, current.draft_data, current.status, 'archived', access.user.email || '')
    const { error } = await admin.from('cms_banners').update({
      status: 'archived',
      scheduled_at: null,
      updated_at: new Date().toISOString(),
      updated_by: access.user.email || '',
    }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ archived: true })
  } catch (error) {
    console.error('DELETE /api/admin/content/banners/[id] failed:', error)
    return NextResponse.json({ message: 'Could not archive banner.' }, { status: 503 })
  }
}
