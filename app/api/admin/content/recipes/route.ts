import { NextRequest, NextResponse } from 'next/server'
import { getCmsAccess, requireCmsPermission } from '@/lib/cms-auth'
import { cmsProductIds, cmsStringList, cmsText, writeCmsVersion } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

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

export async function POST(request: NextRequest) {
  const access = await getCmsAccess(request)
  if ('response' in access) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'draft')
    if (!['draft', 'publish'].includes(action)) {
      return NextResponse.json({ message: 'Choose save draft or publish now.' }, { status: 400 })
    }
    const permission = await requireCmsPermission(request, action === 'draft' ? 'draft' : 'publish')
    if ('response' in permission) return permission.response
    const admin = supabaseAdmin()
    const draft = recipeData(body)
    await validateProducts(admin, draft.product_ids)
    const now = new Date().toISOString()
    const { data, error } = await admin.from('cms_recipes').insert({
      draft_data: draft,
      published_data: action === 'publish' ? draft : {},
      status: action === 'publish' ? 'published' : 'draft',
      sort_order: draft.sort_order,
      updated_by: access.user.email || '',
      published_by: action === 'publish' ? access.user.email || '' : '',
      updated_at: now,
      published_at: action === 'publish' ? now : null,
    }).select('*').single()
    if (error) throw error
    await writeCmsVersion(admin, 'recipe', data.id, draft, action === 'publish' ? 'published' : 'draft', 'created', access.user.email || '')
    return NextResponse.json({ recipe: data }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/admin/content/recipes failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not save recipe.' }, { status: 400 })
  }
}
