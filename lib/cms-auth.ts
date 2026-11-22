import 'server-only'

import { getUserFromToken, isAdminEmail, supabaseAdmin } from '@/lib/supabase'

export type CmsRole = 'super_admin' | 'content_manager' | 'editor' | 'viewer'
export type CmsPermission = 'view' | 'draft' | 'publish' | 'roles'

const PERMISSIONS: Record<CmsRole, CmsPermission[]> = {
  super_admin: ['view', 'draft', 'publish', 'roles'],
  content_manager: ['view', 'draft', 'publish'],
  editor: ['view', 'draft'],
  viewer: ['view'],
}

export async function getCmsAccess(request: Request) {
  const { NextResponse } = await import('next/server')
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const user = await getUserFromToken(token)
  if (!user?.id || !user.email) {
    return { response: NextResponse.json({ message: 'Sign in to manage website content.' }, { status: 401 }) }
  }
  const email = String(user.email).trim().toLowerCase()
  if (isAdminEmail(email)) return { user, role: 'super_admin' as const }

  try {
    const { data, error } = await supabaseAdmin()
      .from('cms_user_roles')
      .select('role,email')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.error('CMS role lookup failed:', error)
      return {
        response: NextResponse.json(
          { message: 'Content Manager permissions are not ready. Apply supabase/website-content-manager.sql.' },
          { status: 503 },
        ),
      }
    }
    if (!data || String(data.email).toLowerCase() !== email) {
      return { response: NextResponse.json({ message: 'You do not have Website Content Manager access.' }, { status: 403 }) }
    }
    return { user, role: data.role as CmsRole }
  } catch (error) {
    console.error('CMS role lookup failed:', error)
    return { response: NextResponse.json({ message: 'Could not verify CMS permissions.' }, { status: 503 }) }
  }
}

export async function requireCmsPermission(request: Request, permission: CmsPermission) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access
  const { NextResponse } = await import('next/server')
  if (!PERMISSIONS[access.role].includes(permission)) {
    return { response: NextResponse.json({ message: 'Your CMS role does not allow this action.' }, { status: 403 }) }
  }
  return access
}
