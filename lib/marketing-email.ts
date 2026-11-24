import 'server-only'

export class MarketingEmailPausedError extends Error {}
export class MarketingEmailRejectedError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export function marketingEmailConfigurationIssues() {
  const issues: string[] = []
  try {
    const url = new URL(process.env.AJR_EMAIL_EDGE_URL || '')
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (url.protocol !== 'https:' || url.pathname !== '/functions/v1/shared-email-automation' ||
      url.origin !== project.origin || url.username || url.password || url.search || url.hash) {
      issues.push('AJR_EMAIL_EDGE_URL must point to the shared function in the configured Supabase project.')
    }
  } catch {
    issues.push('Set AJR_EMAIL_EDGE_URL and NEXT_PUBLIC_SUPABASE_URL to valid HTTPS URLs.')
  }
  if ((process.env.AJR_MAIL_SECRET || '').length < 32) {
    issues.push('AJR_MAIL_SECRET must contain at least 32 characters.')
  }
  return issues
}

export function marketingEmailConfigured() {
  return marketingEmailConfigurationIssues().length === 0
}

export function cartRecoveryConfigurationIssues() {
  const issues = marketingEmailConfigurationIssues()
  if ((process.env.PRODUCT_REMINDER_TOKEN_SECRET || '').length < 32) {
    issues.push('PRODUCT_REMINDER_TOKEN_SECRET must contain at least 32 characters.')
  }
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') {
    issues.push('Email notifications are disabled by NOTIFICATIONS_EMAIL_ENABLED.')
  }
  return issues
}

export async function marketingEdgeRequest(payload: Record<string, unknown>) {
  if (!marketingEmailConfigured()) throw new MarketingEmailPausedError('Marketing email service is not configured.')
  return fetch(process.env.AJR_EMAIL_EDGE_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ajr-mail-secret': process.env.AJR_MAIL_SECRET! },
    body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(45000),
  })
}

export async function sendMarketingEmail(payload: {
  campaign: 'cart' | 'product'; id: string; to: string; subject: string; text: string; html: string; unsubscribe: string
}) {
  const response = await marketingEdgeRequest({ action: 'send', ...payload })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (result.code === 'paused') throw new MarketingEmailPausedError(String(result.error || 'Marketing is paused.'))
    if (response.status < 500) throw new MarketingEmailRejectedError(String(result.error || 'Email was rejected.'), response.status)
    throw new Error('Email delivery outcome is uncertain.')
  }
  const id = result.id
  if (typeof id !== 'string' || !id) throw new Error('Email provider did not return a message ID.')
  return { id }
}
