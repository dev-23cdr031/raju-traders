import { NextRequest, NextResponse } from 'next/server'
import { cleanSupabaseUrl, requireAdmin } from '@/lib/supabase'

const BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024

// POST /api/upload — upload a product image to Supabase Storage (admin only).
// Returns { url } pointing at the public object.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const url = cleanSupabaseUrl
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!url || !serviceKey) {
      return NextResponse.json({ message: 'Supabase environment is not configured.' }, { status: 500 })
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ message: 'No image file received.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: 'Image must be smaller than 5 MB.' }, { status: 400 })
    }

    const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

    // Make sure a public bucket exists.
    const head = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: auth })
    if (!head.ok) {
      await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      })
    }

    const rawExt = (String(file.name || 'image.jpg').split('.').pop() || 'jpg').toLowerCase()
    const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
        'cache-control': '3600',
      },
      body: bytes,
    })
    if (!up.ok) {
      const detail = await up.text().catch(() => '')
      throw new Error(detail || 'Upload failed.')
    }

    return NextResponse.json({ url: `${url}/storage/v1/object/public/${BUCKET}/${path}` })
  } catch (e: any) {
    console.error('POST /api/upload error:', e)
    return NextResponse.json({ message: e?.message || 'Upload failed.' }, { status: 500 })
  }
}