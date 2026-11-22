import { NextRequest, NextResponse } from 'next/server'
import { requireCmsPermission } from '@/lib/cms-auth'
import { cmsStringList, cmsText } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireCmsPermission(request, 'publish')
  if ('response' in access) return access.response
  const { id } = await params
  if (!/^[1-9]\d{0,14}$/.test(id)) return NextResponse.json({ message: 'Invalid product ID.' }, { status: 400 })

  try {
    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (body.detail !== undefined) patch.detail = cmsText(body.detail, 2000, true)
    if (body.benefits !== undefined) patch.benefits = cmsStringList(body.benefits, 160)
    if (body.ingredients !== undefined) patch.ingredients = cmsStringList(body.ingredients, 160)
    if (body.seo_title !== undefined) patch.seo_title = cmsText(body.seo_title, 70)
    if (body.seo_description !== undefined) patch.seo_description = cmsText(body.seo_description, 320, true)
    if (body.image !== undefined) {
      const image = cmsText(body.image, 2000)
      const validPath = image.startsWith('/') && !image.startsWith('//') && !image.includes('..') && !image.includes('\\')
      let validUrl = false
      try { validUrl = new URL(image).protocol === 'https:' } catch {}
      if (image && !validPath && !validUrl) {
        return NextResponse.json({ message: 'Use an HTTPS image URL or a safe site image path.' }, { status: 400 })
      }
      patch.image = image
    }
    if (!Object.keys(patch).length) return NextResponse.json({ message: 'Choose product content to update.' }, { status: 400 })

    const { data, error } = await supabaseAdmin().from('products').update(patch).eq('id', id)
      .select('id,name,detail,image,benefits,ingredients,seo_title,seo_description,active').single()
    if (error) throw error
    return NextResponse.json({ product: data })
  } catch (error) {
    console.error('PATCH /api/admin/content/products/[id] failed:', error)
    return NextResponse.json({ message: 'Could not update product content. Verify the CMS migration is applied.' }, { status: 503 })
  }
}
