import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

const DEFAULT_SETTINGS = {
  shopName: 'AJR',
  tagline: 'ALWAYS JUST ROYAL',
  logoUrl: '/ajr-logo.png',
}

const MIGRATION_GUIDANCE = 'Store settings are not set up yet. Run supabase/store-settings.sql in the Supabase SQL editor, then refresh this page.'

function asSettings(row: any) {
  return {
    shopName: String(row?.shop_name || DEFAULT_SETTINGS.shopName),
    tagline: String(row?.tagline || DEFAULT_SETTINGS.tagline),
    logoUrl: String(row?.logo_url || DEFAULT_SETTINGS.logoUrl),
  }
}

function configurationError(error: any) {
  return /store_settings|relation .* does not exist|schema cache/i.test(String(error?.message || error || ''))
}

// GET /api/settings — branding settings are intentionally admin-only because
// they include the current store configuration, not public storefront content.
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { data, error } = await supabaseAdmin()
      .from('store_settings')
      .select('shop_name, tagline, logo_url')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ settings: asSettings(data) })
  } catch (error: any) {
    console.error('GET /api/settings error:', error)
    return NextResponse.json(
      { message: configurationError(error) ? MIGRATION_GUIDANCE : error?.message || 'Could not load store settings.' },
      { status: 500 },
    )
  }
}

// PATCH /api/settings — administrator-only singleton branding record.
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const body = await request.json().catch(() => ({}))
    const shopName = String(body.shopName || '').trim().slice(0, 80)
    const tagline = String(body.tagline || '').trim().slice(0, 140)
    const logoUrl = String(body.logoUrl || '').trim().slice(0, 2_000)
    if (!shopName) return NextResponse.json({ message: 'Shop name is required.' }, { status: 400 })
    if (logoUrl && !(/^(https?:\/\/|\/)/i.test(logoUrl))) {
      return NextResponse.json({ message: 'Logo URL must be an uploaded image URL or a site-relative path.' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin()
      .from('store_settings')
      .upsert({ id: 1, shop_name: shopName, tagline, logo_url: logoUrl || DEFAULT_SETTINGS.logoUrl }, { onConflict: 'id' })
      .select('shop_name, tagline, logo_url')
      .single()
    if (error) throw error
    return NextResponse.json({ settings: asSettings(data) })
  } catch (error: any) {
    console.error('PATCH /api/settings error:', error)
    return NextResponse.json(
      { message: configurationError(error) ? MIGRATION_GUIDANCE : error?.message || 'Could not save store settings.' },
      { status: 500 },
    )
  }
}
