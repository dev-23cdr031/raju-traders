import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess, requireCmsPermission } from '@/lib/cms-auth'
import { cmsProductIds, cmsStringList, cmsText, writeCmsVersion } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function recipeData(input: any) {
  const body = input?.recipe && typeof input.recipe === 'object' ? input.recipe : input
  const title = cmsText(body.title, 120)
  const image = cmsText(body.image, 2000)
  if (!title) throw new Error('Recipe name is required.')
  if (!image || (!image.startsWith('/') && !/^https:\/\//i.test(image))) throw new Error('Choose a valid recipe image.')
  if (image.startsWith('//') || image.includes('..') || image.includes('\\')) throw new Error('Choose a valid recipe image.')
  const prepMinutes = Number(body.prep_minutes)
  if (!Number.isInteger(prepMinutes) || prepMinutes < 0 || prepMinutes > 1440) {
    throw new Error('Preparation time must be between 0 and 1,440 minutes.')
  }
  const productIds = cmsProductIds(body.product_ids)
  const ingredients = cmsStringList(body.ingredients, 300)
  return {
    title,
    description: cmsText(body.description, 1000, true),
    image,
    alt_text: cmsText(body.alt_text, 300),
    ingredients,
    instructions: cmsStringList(body.instructions, 1000),
    prep_minutes: prepMinutes,
    product_ids: productIds,
    sort_order: Math.max(-10000, Math.min(10000, Math.trunc(Number(body.sort_order) || 0))),
    visible: body.visible !== false,
  }
}

async function validateProducts(admin: ReturnType<typeof supabaseAdmin>, productIds: number[]) {
  if (!productIds.length) return
  const { data, error } = await admin.from('products').select('id').in('id', productIds)
  if (error) throw error
  const found = new Set((data || []).map((row: any) => Number(row.id)))
  if (productIds.some((id) => !found.has(id))) throw new Error('One or more related products no longer exist.')
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response
  const { id } = await params
  if (!ID_PATTERN.test(id)) return NextResponse.json({ message: 'Invalid recipe ID.' }, { status: 400 })

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'draft')
    if (!['draft', 'publish'].includes(action)) {
      return NextResponse.json({ message: 'Choose save draft or publish now.' }, { status: 400 })
    }
    const permission = await requireCmsPermission(request, action === 'draft' ? 'draft' : 'publish')
    if ('response' in permission) return permission.response
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('cms_recipes').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Recipe not found.' }, { status: 404 })

    const draft = recipeData(body)
    await validateProducts(admin, draft.product_ids)
    await writeCmsVersion(admin, 'recipe', id, current.draft_data, current.status, `before-${action}`, access.user.email || '')
    const now = new Date().toISOString()
    const { data, error } = await admin.from('cms_recipes').update({
      draft_data: draft,
      published_data: action === 'publish' ? draft : current.published_data,
      status: action === 'publish' ? 'published' : current.status === 'published' ? 'published' : 'draft',
      sort_order: draft.sort_order,
      updated_by: access.user.email || '',
      published_by: action === 'publish' ? access.user.email || '' : current.published_by,
      updated_at: now,
      published_at: action === 'publish' ? now : current.published_at,
    }).eq('id', id).select('*').single()
    if (error) throw error
    return NextResponse.json({ recipe: data })
  } catch (error: any) {
    console.error('PUT /api/admin/content/recipes/[id] failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not update recipe.' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response
  const { id } = await params
  if (!ID_PATTERN.test(id)) return NextResponse.json({ message: 'Invalid recipe ID.' }, { status: 400 })
  try {
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('cms_recipes').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Recipe not found.' }, { status: 404 })
    await writeCmsVersion(admin, 'recipe', id, current.draft_data, current.status, 'archived', access.user.email || '')
    const { error } = await admin.from('cms_recipes').update({
      status: 'archived',
      updated_at: new Date().toISOString(),
      updated_by: access.user.email || '',
    }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ archived: true })
  } catch (error) {
    console.error('DELETE /api/admin/content/recipes/[id] failed:', error)
    return NextResponse.json({ message: 'Could not archive recipe.' }, { status: 503 })
  }
}
