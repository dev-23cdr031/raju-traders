import { createHmac, timingSafeEqual } from 'node:crypto'

export function cartUnsubscribeSignature(id: string) {
  const secret = process.env.PRODUCT_REMINDER_TOKEN_SECRET || ''
  if (secret.length < 32) throw new Error('PRODUCT_REMINDER_TOKEN_SECRET must contain at least 32 characters.')
  return createHmac('sha256', secret).update(`cart-unsubscribe:${id}`).digest('hex')
}

export function validCartUnsubscribeSignature(id: string, signature: string) {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(cartUnsubscribeSignature(id), 'hex'))
}
