import { NextRequest, NextResponse } from 'next/server'
import { requireCmsPermission } from '@/lib/cms-auth'
import { cmsText } from '@/lib/cms-content'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CATEGORY_ALIASES: Record<string, string> = {
  banner: 'banners',
  recipe: 'recipes',
  product: 'products',
}
const CATEGORIES = new Set(['general', 'banners', 'recipes', 'products', 'site'])

async function matchesImageType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.type === 'image/png') return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  return file.type === 'image/webp'
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

export async function POST(request: NextRequest) {
  const access = await requireCmsPermission(request, 'draft')
  if ('response' in access) return access.response

  let uploadedPath = ''
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ message: 'Choose an image file to upload.' }, { status: 400 })
    if (!MIME_TYPES.has(file.type)) return NextResponse.json({ message: 'Use a JPG, PNG, or WebP image.' }, { status: 400 })
    if (file.size < 1 || file.size > MAX_FILE_BYTES) return NextResponse.json({ message: 'Image must be 5 MB or smaller.' }, { status: 400 })
    if (!await matchesImageType(file)) return NextResponse.json({ message: 'The file contents do not match its image type.' }, { status: 400 })

    const admin = supabaseAdmin()
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
    const categoryInput = cmsText(formData.get('category'), 30).toLowerCase()
    const category = CATEGORY_ALIASES[categoryInput] || (CATEGORIES.has(categoryInput) ? categoryInput : 'general')
    const id = crypto.randomUUID()
    uploadedPath = `${category}/${id}.${extension}`
    const { error: uploadError } = await admin.storage.from('website-media').upload(uploadedPath, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { data: publicUrl } = admin.storage.from('website-media').getPublicUrl(uploadedPath)
    const record = {
      storage_path: uploadedPath,
      public_url: publicUrl.publicUrl,
      original_name: cmsText(file.name, 255) || `image.${extension}`,
      mime_type: file.type,
      size_bytes: file.size,
      alt_text: cmsText(formData.get('alt_text') || formData.get('altText'), 300),
      category,
      uploaded_by: cmsText(access.user.email, 254).toLowerCase(),
    }
    const { data, error } = await admin.from('cms_media').insert(record).select('*').single()
    if (error) {
      const { error: cleanupError } = await admin.storage.from('website-media').remove([uploadedPath])
      if (cleanupError) console.error('CMS media upload cleanup failed:', cleanupError)
      uploadedPath = ''
      throw error
    }
    uploadedPath = ''
    return NextResponse.json({
      media: { ...data, url: data.public_url, filename: data.original_name, used: false },
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/admin/content/media failed:', error)
    if (uploadedPath) {
      const { error: cleanupError } = await supabaseAdmin().storage.from('website-media').remove([uploadedPath])
      if (cleanupError) console.error('CMS media upload cleanup failed:', cleanupError)
    }
    return NextResponse.json({ message: 'Could not upload this image. Check that the CMS migration is applied and try again.' }, { status: 503 })
  }
}
