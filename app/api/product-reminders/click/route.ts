import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validReminderSignature } from '@/lib/product-reminder-email'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  const signature = request.nextUrl.searchParams.get('signature') || ''
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !validReminderSignature(id, 'click', signature)) {
      return NextResponse.json({ message: 'Invalid reminder link.' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('product_reminders').select('product_id,status,clicked_at').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data || data.status !== 'sent') return NextResponse.json({ message: 'Reminder link unavailable.' }, { status: 404 })
    const { error: clickError } = await admin.from('product_reminder_clicks').insert({ reminder_id: id })
    if (clickError) throw clickError
    if (!data.clicked_at) {
      const { error: updateError } = await admin.from('product_reminders').update({ clicked_at: new Date().toISOString() })
        .eq('id', id).is('clicked_at', null)
      if (updateError) throw updateError
    }
    return NextResponse.redirect(`https://www.rajutraders.in/?product=${data.product_id}`, {
      status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (error) {
    console.error('Product reminder click failed:', error)
    return NextResponse.json({ message: 'Could not open this product.' }, { status: 503 })
  }
}
