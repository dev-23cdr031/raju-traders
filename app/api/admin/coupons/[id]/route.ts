import { NextRequest, NextResponse } from 'next/server'
import { normalizeCouponInput, writeCouponAudit } from '@/lib/coupon-admin'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: 'Invalid coupon reference.' }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const admin = supabaseAdmin()
    const { data: current, error: lookupError } = await admin.from('coupons').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw lookupError
    if (!current) return NextResponse.json({ message: 'Coupon not found.' }, { status: 404 })

    if (body.archived === true) {
      const { data, error } = await admin.from('coupons')
        .update({ archived: true, active: false, promote: false, updated_by: gate.user.email || '', updated_at: new Date().toISOString() })
        .eq('id', id).select('*').single()
      if (error) throw error
      try {
        await writeCouponAudit(admin, { couponId: id, code: current.code, adminEmail: gate.user.email || '', action: 'archived', changes: { archived: true } })
      } catch (auditError) {
        console.error('Coupon was archived, but its audit event could not be saved:', auditError)
      }
      return NextResponse.json({ coupon: data })
    }

    const merged = { ...current, ...body }
    const payload = normalizeCouponInput(merged, gate.user.email || '')
    const { data, error } = await admin.from('coupons').update(payload).eq('id', id).select('*').single()
    if (error) {
      if (/duplicate key/i.test(error.message)) return NextResponse.json({ message: 'That coupon code already exists.' }, { status: 409 })
      throw error
    }
    let warning = ''
    try {
      await writeCouponAudit(admin, { couponId: id, code: data.code, adminEmail: gate.user.email || '', action: 'updated', changes: payload })
    } catch (auditError) {
      console.error('Coupon was updated, but its audit event could not be saved:', auditError)
      warning = 'Coupon saved, but the audit event could not be recorded.'
    }
    return NextResponse.json({ coupon: data, warning })
  } catch (error: any) {
    console.error('PATCH /api/admin/coupons/[id] failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not update coupon.' }, { status: 400 })
  }
}
