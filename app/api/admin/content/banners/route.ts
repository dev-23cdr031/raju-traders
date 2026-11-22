import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess, requireCmsPermission } from '@/lib/cms-auth'
import { cmsDate, cmsLink, cmsText, writeCmsVersion } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

function imageUrl(value: unknown) {
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

function scheduleFor(action: string, body: any, startsAt: string | null) {
  if (action !== 'schedule') return null
  const scheduledAt = cmsDate(body.scheduledAt || startsAt)
  if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
    throw new Error('Choose a future publication time for this banner.')
  }
  return scheduledAt
}

export async function POST(request: NextRequest) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'draft')
    if (!['draft', 'publish', 'schedule'].includes(action)) {
      return NextResponse.json({ message: 'Choose save draft, publish now, or schedule.' }, { status: 400 })
    }
    const permission = await requireCmsPermission(request, action === 'draft' ? 'draft' : 'publish')
    if ('response' in permission) return permission.response
    const draft = bannerData(body)
    const scheduledAt = scheduleFor(action, body, draft.starts_at)
    const status = action === 'publish' ? 'published' : action === 'schedule' ? 'scheduled' : 'draft'
    const now = new Date().toISOString()
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('cms_banners').insert({
      draft_data: draft,
      published_data: action === 'publish' ? draft : {},
      status,
      scheduled_at: scheduledAt,
      starts_at: draft.starts_at,
      expires_at: draft.expires_at,
      sort_order: draft.sort_order,
      updated_by: access.user.email || '',
      published_by: action === 'publish' ? access.user.email || '' : '',
      updated_at: now,
      published_at: action === 'publish' ? now : null,
    }).select('*').single()
    if (error) throw error
    await writeCmsVersion(admin, 'banner', data.id, draft, status, 'created', access.user.email || '')
    return NextResponse.json({ banner: data }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/admin/content/banners failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not save banner.' }, { status: 400 })
  }
}
