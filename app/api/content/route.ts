import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { mergeWebsiteContent } from '@/lib/website-content'

export async function GET() {
  try {
    const admin = supabaseAdmin()
    const { error: scheduleError } = await admin.rpc('cms_publish_due_content')
    if (scheduleError) throw scheduleError

    const [contentResult, bannerResult, recipeResult] = await Promise.all([
      admin.from('site_content').select('published,published_at').eq('id', 1).maybeSingle(),
      admin.from('cms_banners').select('id,published_data,starts_at,expires_at,sort_order')
        .in('status', ['published', 'scheduled']).order('sort_order').limit(200),
      admin.from('cms_recipes').select('id,published_data,sort_order')
        .eq('status', 'published').order('sort_order').limit(200),
    ])
    if (contentResult.error) throw contentResult.error
    if (bannerResult.error) throw bannerResult.error
    if (recipeResult.error) throw recipeResult.error

    const now = Date.now()
    const banners = (bannerResult.data || [])
      .filter((row: any) => row.published_data && Object.keys(row.published_data).length > 0)
      .filter((row: any) =>
        (!row.starts_at || new Date(row.starts_at).getTime() <= now)
        && (!row.expires_at || new Date(row.expires_at).getTime() > now))
      .map((row: any) => ({ id: row.id, ...row.published_data }))
    const recipes = (recipeResult.data || [])
      .filter((row: any) => row.published_data?.visible !== false)
      .map((row: any) => ({ id: row.id, ...row.published_data }))

    return NextResponse.json({
      content: mergeWebsiteContent(contentResult.data?.published),
      banners,
      recipes,
      publishedAt: contentResult.data?.published_at || null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/content failed:', error)
    return NextResponse.json({ message: 'Published website content is temporarily unavailable.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
