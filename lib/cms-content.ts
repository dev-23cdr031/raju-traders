import 'server-only'

import { supabaseAdmin } from '@/lib/supabase'

export function cmsText(value: unknown, limit: number, multiline = false) {
  const raw = String(value ?? '')
  const normalized = multiline
    ? raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    : raw.replace(/[\u0000-\u001f\u007f]/g, ' ')
  return normalized.trim().slice(0, limit)
}

export function cmsDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error('Choose a valid date and time.')
  return date.toISOString()
}

export function cmsProductIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<number>()
  for (const raw of value) {
    const id = Number(raw)
    if (Number.isSafeInteger(id) && id > 0) ids.add(id)
    if (ids.size >= 100) break
  }
  return Array.from(ids)
}

export function cmsStringList(value: unknown, itemLimit: number, maxItems = 100): string[] {
  const entries = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/)
  return entries
    .map((item) => cmsText(item, itemLimit))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function cmsLink(value: unknown, fallback = '') {
  const href = cmsText(value, 500)
  if (!href) return fallback
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) {
    const path = href.split(/[?#]/)[0]
    return ['/', '/about', '/shop', '/contact', '/cart', '/login', '/signup'].includes(path) ? href : fallback
  }
  try {
    const url = new URL(href)
    if (url.protocol === 'https:') return url.toString()
  } catch {
    return fallback
  }
  return fallback
}

export async function writeCmsVersion(
  admin: ReturnType<typeof supabaseAdmin>,
  entityType: 'site_content' | 'banner' | 'recipe',
  entityId: string,
  snapshot: unknown,
  status: string,
  action: string,
  email: string,
) {
  const { error } = await admin.from('cms_content_versions').insert({
    entity_type: entityType,
    entity_id: entityId,
    snapshot,
    status,
    action,
    admin_email: cmsText(email, 254).toLowerCase(),
  })
  if (error) throw error
}
