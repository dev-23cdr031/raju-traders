const PENDING_KEY = 'ajr-login-cart-reminder'
const MAX_AGE_MS = 15 * 60_000

type PendingChoice = { method: 'google' | 'otp'; email?: string; createdAt: number }

export function clearPendingCartReminder() {
  window.sessionStorage.removeItem(PENDING_KEY)
}

export function setPendingCartReminder(method: 'google' | 'otp', email?: string) {
  const choice: PendingChoice = { method, email, createdAt: Date.now() }
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(choice))
}

export function takePendingCartReminder(method: 'google' | 'otp', email?: string) {
  const stored = window.sessionStorage.getItem(PENDING_KEY)
  clearPendingCartReminder()
  if (!stored) return false
  let choice: PendingChoice
  try {
    choice = JSON.parse(stored)
  } catch {
    return false
  }
  if (!choice || typeof choice !== 'object' || typeof choice.createdAt !== 'number') return false
  const age = Date.now() - choice.createdAt
  return choice.method === method && Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS
    && (method !== 'otp' || Boolean(email && choice.email === email))
}

export async function saveLoginCartReminderChoice(token: string, optedIn: boolean) {
  if (!optedIn) return
  if (!token) throw new Error('Your reminder preference could not be saved. Please try again later.')
  const response = await fetch('/api/cart/reminder-preference', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ optedIn: true }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.message || 'Your reminder preference could not be saved. Please try again later.')
  }
}
