const schedulerSecret = Deno.env.get('AJR_SCHEDULER_SECRET') || ''
const cronSecret = Deno.env.get('AJR_CRON_SECRET') || ''
const origin = Deno.env.get('AJR_SITE_ORIGIN') || ''

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (schedulerSecret.length < 32 || cronSecret.length < 32) return new Response('Scheduler is not configured', { status: 503 })
  if (request.headers.get('x-ajr-scheduler-secret') !== schedulerSecret) return new Response('Unauthorized', { status: 401 })
  let url: URL
  try {
    url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin')
  } catch {
    return new Response('Scheduler origin is invalid', { status: 503 })
  }
  try {
    const response = await fetch(new URL('/api/cron/product-reminders', url), {
      headers: { Authorization: `Bearer ${cronSecret}` },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) return new Response('Product reminder processing failed', { status: 502 })
    return new Response('Product reminder processing completed', { status: 200 })
  } catch (error) {
    console.error('Product reminder scheduler failed:', error)
    return new Response('Product reminder processing failed', { status: 502 })
  }
})
