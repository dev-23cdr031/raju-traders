import CartRecoveryClient from './recovery-client'

export default async function CartRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>
}) {
  const { token = '', action = '' } = await searchParams
  return <CartRecoveryClient token={token} action={action} />
}
