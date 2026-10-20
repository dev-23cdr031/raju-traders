import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

// GET /api/dashboard — revenue/orders/customers/products summary (admin only)
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const [ordersResult, productsResult, messagesResult] = await Promise.all([
      admin.from('orders').select('total,status,created_at,channel').order('created_at', { ascending: false }).limit(500),
      admin.from('products').select('id,stock,status,price'),
      admin.from('messages').select('id'),
    ])
    if (ordersResult.error) throw ordersResult.error
    if (productsResult.error) throw productsResult.error
    if (messagesResult.error) throw messagesResult.error

    const list = ordersResult.data ?? []
    const products = productsResult.data ?? []
    const messages = messagesResult.data ?? []
    const activeOrders = list.filter((o: any) => o.status !== 'Cancelled')
    const revenue = activeOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
    const onlineOrders = list.filter((o: any) => o.channel === 'Online')
    const offlineOrders = list.filter((o: any) => o.channel === 'Offline')
    const pending = list.filter((o: any) => o.status === 'Pending').length
    const outOfStock = products.filter((p: any) => Number(p.stock) <= 0).length
    const currentMonth = new Date()
    const monthlyRevenue = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11 + index, 1)
      return {
        year: month.getFullYear(),
        month: month.getMonth(),
        label: month.toLocaleDateString('en-IN', { month: 'short' }),
        revenue: 0,
      }
    })
    list.forEach((order: any) => {
      if (order.status === 'Cancelled') return
      const createdAt = new Date(order.created_at)
      const bucket = monthlyRevenue.find((month) => month.year === createdAt.getFullYear() && month.month === createdAt.getMonth())
      if (bucket && Number.isFinite(Number(order.total))) bucket.revenue += Number(order.total)
    })

    return NextResponse.json({
      revenue,
      orders: list.length,
      pending,
      onlineOrders: onlineOrders.length,
      offlineOrders: offlineOrders.length,
      onlineRevenue: onlineOrders.filter((o: any) => o.status !== 'Cancelled').reduce((sum: number, o: any) => sum + Number(o.total || 0), 0),
      offlineRevenue: offlineOrders.filter((o: any) => o.status !== 'Cancelled').reduce((sum: number, o: any) => sum + Number(o.total || 0), 0),
      products: products.length,
      outOfStock,
      inquiries: messages.length,
      monthlyRevenue: monthlyRevenue.map(({ label, revenue: monthRevenue }) => ({ label, revenue: monthRevenue })),
      recent: list.slice(0, 8),
    })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || 'Failed to load dashboard.' }, { status: 500 })
  }
}
