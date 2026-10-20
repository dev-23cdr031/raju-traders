import { notFound } from 'next/navigation'
import AdminDashboard, { type AdminSection } from '../AdminDashboard'

const ADMIN_SECTIONS: AdminSection[] = ['orders', 'products', 'inventory', 'messages', 'settings']

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  if (!ADMIN_SECTIONS.includes(section as AdminSection)) notFound()

  return <AdminDashboard section={section as AdminSection} />
}