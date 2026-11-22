import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin().from('coupons')
      .select('id,code,name,description,discount_type,discount_value,max_discount_amount,minimum_purchase,expires_at,promote,banner_title,banner_copy,banner_cta')
      .eq('active', true)
      .eq('archived', false)
      .eq('is_public', true)
      .eq('show_to_customers', true)
      .lte('starts_at', now)
      .gt('expires_at', now)
      .order('promote', { ascending: false })
      .order('expires_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return NextResponse.json({ offers: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/coupons failed:', error)
    return NextResponse.json({ message: 'Offers are temporarily unavailable.' }, { status: 503 })
  }
}
