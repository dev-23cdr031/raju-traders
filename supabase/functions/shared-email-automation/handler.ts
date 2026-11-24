type Config = {
  schedulerSecret: string
  mailSecret: string
  cronSecret: string
  appUrl: string
  resendApiKey: string
  resendFromEmail: string
  supabaseUrl: string
  serviceRoleKey: string
}

type UsageWindow = { used: number; limit: number | null; resets_at: string }
type Usage = { daily: UsageWindow; monthly: UsageWindow }

async function sameSecret(expected: string, actual: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
  ])
  let diff = 0
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

function validWindow(value: unknown): value is UsageWindow {
  if (!value || typeof value !== 'object') return false
  const window = value as Record<string, unknown>
  return Number.isSafeInteger(window.used) && Number(window.used) >= 0 &&
    (window.limit === null || (Number.isSafeInteger(window.limit) && Number(window.limit) >= 0)) &&
    typeof window.resets_at === 'string' && Number.isFinite(Date.parse(window.resets_at))
}

export function createSharedEmailHandler(config: Config, fetcher: typeof fetch = fetch) {
  async function usage(): Promise<Usage> {
    await waitForProviderSlot()
    const response = await fetcher('https://api.resend.com/usage', {
      headers: { Authorization: `Bearer ${config.resendApiKey}` }, signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`Resend usage returned HTTP ${response.status}`)
    const data = await response.json()
    if (!validWindow(data?.emails?.daily) || !validWindow(data?.emails?.monthly)) throw new Error('Invalid Resend usage response')
    return { daily: data.emails.daily, monthly: data.emails.monthly }
  }

  async function rpc(name: string, body: Record<string, unknown>) {
    const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`Quota database returned HTTP ${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  async function waitForProviderSlot() {
    const delay = await rpc('ajr_reserve_resend_api_slot', {})
    if (!Number.isSafeInteger(delay) || delay < 0 || delay > 20000) throw new Error('Invalid provider rate slot')
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (config.schedulerSecret.length < 32 || config.mailSecret.length < 32 || config.cronSecret.length < 32 ||
      !config.resendApiKey || !config.serviceRoleKey || !config.supabaseUrl ||
      !/^(?:Raju Traders <)?no-reply@rajutraders\.in>?$/i.test(config.resendFromEmail)) {
      return Response.json({ error: 'Email automation is not configured.' }, { status: 503 })
    }
    let origin: URL
    try {
      origin = new URL(config.appUrl)
      const database = new URL(config.supabaseUrl)
      if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
        database.protocol !== 'https:' || database.username || database.password || database.pathname !== '/' || database.search || database.hash) {
        throw new Error('Invalid origin')
      }
    } catch {
      return Response.json({ error: 'Email automation origin is invalid.' }, { status: 503 })
    }
    const mailHeader = request.headers.get('x-ajr-mail-secret') || ''
    if (mailHeader) {
      if (!await sameSecret(config.mailSecret, mailHeader)) return new Response('Unauthorized', { status: 401 })
      let payload: Record<string, unknown>
      try { payload = await request.json() } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }) }
      if (payload.action === 'usage') {
        try { return Response.json(await usage(), { headers: { 'Cache-Control': 'no-store' } }) }
        catch (error) {
          console.error('Resend usage unavailable:', error instanceof Error ? error.message : 'unknown error')
          return Response.json({ error: 'Provider usage is unavailable.' }, { status: 503 })
        }
      }
      const campaign = payload.campaign
      const id = payload.id
      const recipient = payload.to
      const unsubscribe = payload.unsubscribe
      if (payload.action !== 'send' || (campaign !== 'cart' && campaign !== 'product') ||
        typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
        typeof recipient !== 'string' || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
        typeof payload.subject !== 'string' || !payload.subject || payload.subject.length > 200 || /[\r\n]/.test(payload.subject) ||
        typeof payload.html !== 'string' || payload.html.length > 200000 ||
        typeof payload.text !== 'string' || payload.text.length > 100000 || typeof unsubscribe !== 'string') {
        return Response.json({ error: 'Invalid email request.' }, { status: 400 })
      }
      try {
        const link = new URL(unsubscribe)
        const expectedPath = campaign === 'cart' ? '/api/cart/reminder-unsubscribe' : '/api/product-reminders/unsubscribe'
        if (link.origin !== origin.origin || link.pathname !== expectedPath || link.username || link.password || link.hash) throw new Error('Invalid link')
      } catch {
        return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })
      }
      let reservation: string | null
      try {
        const current = await usage()
        reservation = await rpc('ajr_reserve_marketing_email', {
          p_campaign: campaign,
          p_daily_used: current.daily.used,
          p_monthly_used: current.monthly.used,
          p_provider_daily_limit: current.daily.limit,
          p_provider_monthly_limit: current.monthly.limit,
        })
      } catch (error) {
        console.error('Email quota check failed:', error instanceof Error ? error.message : 'unknown error')
        return Response.json({ code: 'paused', error: 'Provider quota could not be verified.' }, { status: 503 })
      }
      if (!reservation) return Response.json({ code: 'paused', error: 'Marketing is paused by quota or settings.' }, { status: 429 })
      let status: 'sent' | 'uncertain' | 'rejected' = 'uncertain'
      let result: Response
      try {
        await waitForProviderSlot()
        const eligible = await rpc('ajr_marketing_email_still_eligible', { p_campaign: campaign, p_id: id, p_recipient: recipient })
        if (eligible !== true) {
          const enabled = await rpc('ajr_marketing_campaign_enabled', { p_campaign: campaign })
          await rpc('ajr_finish_marketing_email', { p_id: reservation, p_status: 'rejected' })
          if (enabled === false) return Response.json({ code: 'paused', error: 'Marketing is disabled.' }, { status: 429 })
          if (enabled !== true) throw new Error('Invalid campaign setting')
          return Response.json({ code: 'ineligible', error: 'Reminder eligibility changed.' }, { status: 409 })
        }
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `${campaign}-reminder/${id}`,
          },
          body: JSON.stringify({
            from: config.resendFromEmail, to: [recipient], subject: payload.subject, html: payload.html, text: payload.text,
            headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          }),
          signal: AbortSignal.timeout(8000),
        })
        const body = await response.json().catch(() => ({}))
        if (response.ok && typeof body.id === 'string' && body.id) {
          status = 'sent'
          result = Response.json({ id: body.id })
        } else if (response.status >= 400 && response.status < 500) {
          status = 'rejected'
          result = Response.json({ error: 'Resend rejected the email.' }, { status: response.status })
        } else {
          result = Response.json({ error: 'Delivery outcome is uncertain.' }, { status: 502 })
        }
      } catch (error) {
        console.error('Resend delivery outcome uncertain:', error instanceof Error ? error.name : 'unknown error')
        result = Response.json({ error: 'Delivery outcome is uncertain.' }, { status: 502 })
      }
      try { await rpc('ajr_finish_marketing_email', { p_id: reservation, p_status: status }) }
      catch (error) {
        console.error('Email quota reservation finalization failed:', error instanceof Error ? error.message : 'unknown error')
        return Response.json({ error: 'Delivery outcome is uncertain.' }, { status: 502 })
      }
      return result
    }
    if (!await sameSecret(config.schedulerSecret, request.headers.get('x-ajr-scheduler-secret') || '')) {
      return new Response('Unauthorized', { status: 401 })
    }
    let failed = false
    const summaries: Record<string, unknown> = {}
    for (const [name, path] of [['cart', '/api/cron/abandoned-carts'], ['product', '/api/cron/product-reminders']]) {
      try {
        const response = await fetcher(new URL(path, origin), {
          headers: { Authorization: `Bearer ${config.cronSecret}` }, redirect: 'error', signal: AbortSignal.timeout(55000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        summaries[name] = await response.json()
      } catch (error) {
        failed = true
        console.error(`${name} scheduler failed:`, error instanceof Error ? error.message : 'unknown error')
        summaries[name] = { error: 'Processing failed.' }
      }
    }
    try { await rpc('ajr_record_email_scheduler_run', { p_status: failed ? 'failed' : 'ok' }) }
    catch (error) {
      failed = true
      console.error('Scheduler heartbeat failed:', error instanceof Error ? error.message : 'unknown error')
    }
    return Response.json({ ok: !failed, summaries }, { status: failed ? 502 : 200 })
  }
}
