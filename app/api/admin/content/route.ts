import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess, requireCmsPermission } from '@/lib/cms-auth'
import { mergeWebsiteContent } from '@/lib/website-content'
import { supabaseAdmin } from '@/lib/supabase'

const INTERNAL_DESTINATIONS = new Set(['/', '/about', '/shop', '/contact', '/cart'])

function containsUrl(value: unknown, url: string): boolean {
  if (typeof value === 'string') return value === url
  if (Array.isArray(value)) return value.some((item) => containsUrl(item, url))
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsUrl(item, url))
  return false
}

function safeInternalDestination(value: unknown, fallback: string) {
  const href = String(value || '').trim()
  return INTERNAL_DESTINATIONS.has(href) ? href : fallback
}

function safeAnnouncementDestination(value: unknown) {
  const internal = safeInternalDestination(value, '')
  if (internal) return internal
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function safeNavigationDestination(value: unknown) {
  const internal = safeInternalDestination(value, '')
  if (internal) return internal
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : '/'
  } catch {
    return '/'
  }
}

function normalizeContent(input: unknown) {
  const content = mergeWebsiteContent(input)
  content.announcement.href = safeAnnouncementDestination(content.announcement.href)
  content.navigation = content.navigation.map((item, index) => ({
    ...item,
    href: safeNavigationDestination(item.href),
    sort_order: index,
  }))
  return content
}

async function writeVersion(
  admin: ReturnType<typeof supabaseAdmin>,
  snapshot: unknown,
  status: string,
  action: string,
  email: string,
) {
  if (!snapshot) return
  const { error } = await admin.from('cms_content_versions').insert({
    entity_type: 'site_content',
    entity_id: '1',
    snapshot,
    status,
    action,
    admin_email: email,
  })
  if (error) throw error
}

export async function GET(request: NextRequest) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response

  try {
    const admin = supabaseAdmin()
    const [contentResult, bannerResult, recipeResult, mediaResult, versionResult, roleResult, productResult] = await Promise.all([
      admin.from('site_content').select('*').eq('id', 1).maybeSingle(),
      admin.from('cms_banners').select('*').order('sort_order').order('updated_at', { ascending: false }).limit(500),
      admin.from('cms_recipes').select('*').order('sort_order').order('updated_at', { ascending: false }).limit(500),
      admin.from('cms_media').select('*').order('created_at', { ascending: false }).limit(1000),
      admin.from('cms_content_versions').select('id,entity_type,entity_id,snapshot,status,action,admin_email,created_at').order('created_at', { ascending: false }).limit(100),
      access.role === 'super_admin'
        ? admin.from('cms_user_roles').select('user_id,email,role,assigned_by,created_at,updated_at').order('email').limit(1000)
        : Promise.resolve({ data: [], error: null }),
      admin.from('products').select('id,name,detail,image,benefits,ingredients,seo_title,seo_description,active').order('name').limit(1000),
    ])
    for (const result of [contentResult, bannerResult, recipeResult, mediaResult, versionResult, roleResult, productResult]) {
      if (result.error) throw result.error
    }

    const content = contentResult.data
    const rawBanners = bannerResult.data || []
    const rawRecipes = recipeResult.data || []
    const cmsRecords = [content, ...rawBanners, ...rawRecipes, ...(productResult.data || [])]
    const banners = rawBanners.map((row: any) => ({
      ...row,
      ...(row.draft_data && Object.keys(row.draft_data).length ? row.draft_data : row.published_data || {}),
      draft_changed: JSON.stringify(row.draft_data || {}) !== JSON.stringify(row.published_data || {}),
    }))
    const recipes = rawRecipes.map((row: any) => ({
      ...row,
      ...(row.draft_data && Object.keys(row.draft_data).length ? row.draft_data : row.published_data || {}),
      draft_changed: JSON.stringify(row.draft_data || {}) !== JSON.stringify(row.published_data || {}),
    }))
    const media = (mediaResult.data || []).map((row: any) => ({
      ...row,
      url: row.public_url,
      filename: row.original_name,
      used: cmsRecords.some((record) => containsUrl(record, row.public_url)),
    }))
    const versions = (versionResult.data || []).map((row: any) => ({
      ...row,
      label: row.action,
      author: row.admin_email,
    }))
    return NextResponse.json({
      role: access.role,
      metrics: {
        sectionCount: 6,
        publishedCount: (content?.published_at ? 1 : 0)
          + (bannerResult.data || []).filter((row: any) => ['published', 'scheduled'].includes(row.status) && Object.keys(row.published_data || {}).length > 0).length
          + (recipeResult.data || []).filter((row: any) => row.status === 'published').length,
        draftCount: (content?.updated_at && content?.updated_at !== content?.published_at ? 1 : 0)
          + (bannerResult.data || []).filter((row: any) => row.status === 'draft' || JSON.stringify(row.draft_data) !== JSON.stringify(row.published_data)).length
          + (recipeResult.data || []).filter((row: any) => row.status === 'draft' || JSON.stringify(row.draft_data) !== JSON.stringify(row.published_data)).length,
        scheduledCount: (content?.scheduled_at ? 1 : 0)
          + (bannerResult.data || []).filter((row: any) => row.status === 'scheduled').length,
        mediaCount: (mediaResult.data || []).length,
        lastPublishedAt: content?.published_at || null,
      },
      content: {
        draft: normalizeContent(content?.draft),
        published: normalizeContent(content?.published),
        scheduledAt: content?.scheduled_at || null,
        updatedAt: content?.updated_at || null,
        publishedAt: content?.published_at || null,
      },
      banners,
      recipes,
      media,
      products: productResult.data || [],
      versions,
      roles: roleResult.data || [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/admin/content failed:', error)
    return NextResponse.json({ message: 'Website Content Manager storage is unavailable. Apply supabase/website-content-manager.sql.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const rawDraft = body.draft || {}
    const email = String(rawDraft.footer?.email || '').trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'Enter a valid contact email address.' }, { status: 400 })
    }
    for (const [label, value] of [['Instagram URL', rawDraft.footer?.instagram], ['Facebook URL', rawDraft.footer?.facebook]] as Array<[string, unknown]>) {
      const link = String(value || '').trim()
      if (link && !safeAnnouncementDestination(link).startsWith('https://')) {
        return NextResponse.json({ message: `${label} must use HTTPS.` }, { status: 400 })
      }
    }
    const announcementHref = String(rawDraft.announcement?.href || '').trim()
    if (announcementHref && !safeAnnouncementDestination(announcementHref)) {
      return NextResponse.json({ message: 'Use a supported site path or an HTTPS announcement destination.' }, { status: 400 })
    }
    const navigation = Array.isArray(rawDraft.navigation) ? rawDraft.navigation : []
    if (navigation.some((item: any) => {
      const href = String(item?.href || '').trim()
      return href && href !== '/' && safeNavigationDestination(href) === '/'
    })) {
      return NextResponse.json({ message: 'Navigation destinations must be supported site paths or HTTPS URLs.' }, { status: 400 })
    }
    const draft = normalizeContent(body.draft)
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('site_content')
      .select('*').eq('id', 1).maybeSingle()
    if (lookupError) throw lookupError
    if (current?.draft) await writeVersion(admin, current.draft, 'draft', 'draft-replaced', access.user.email || '')

    const { data, error } = await admin.from('site_content').upsert({
      id: 1,
      draft,
      published: current?.published || {},
      scheduled_at: null,
      updated_by: access.user.email || '',
      updated_at: new Date().toISOString(),
      published_at: current?.published_at || null,
      published_by: current?.published_by || '',
    }, { onConflict: 'id' }).select('*').single()
    if (error) throw error
    return NextResponse.json({ content: { draft: normalizeContent(data.draft), published: normalizeContent(data.published), scheduledAt: data.scheduled_at, updatedAt: data.updated_at, publishedAt: data.published_at } })
  } catch (error: any) {
    console.error('PUT /api/admin/content failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not save content draft.' }, { status: 503 })
  }
}
