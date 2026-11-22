type SchedulerConfig = {
  schedulerSecret: string
  cronSecret: string
  siteOrigin: string
}

async function sameSecret(expected: string, supplied: string) {
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

export function createSchedulerHandler(config: SchedulerConfig, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (config.schedulerSecret.length < 32 || config.cronSecret.length < 32) {
      console.error('Scheduler secrets are missing or shorter than 32 characters.')
      return new Response('Scheduler is not configured', { status: 503 })
    }

    const supplied = request.headers.get('x-ajr-scheduler-secret') || ''
    if (!await sameSecret(config.schedulerSecret, supplied)) return new Response('Unauthorized', { status: 401 })

    let endpoint: URL
    try {
      const origin = new URL(config.siteOrigin)
      if (origin.protocol !== 'https:' || origin.username || origin.password ||
          origin.pathname !== '/' || origin.search || origin.hash) {
        throw new Error('Expected an HTTPS origin without a path.')
      }
      endpoint = new URL('/api/cron/abandoned-carts', origin)
    } catch {
      console.error('Scheduler website origin is not configured correctly.')
      return new Response('Scheduler is not configured', { status: 503 })
    }

    try {
      const response = await fetcher(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.cronSecret}` },
        redirect: 'error',
        signal: AbortSignal.timeout(65_000),
      })
      if (!response.ok) {
        console.error('Abandoned-cart endpoint rejected the scheduled request:', response.status)
        return new Response('Reminder job failed', { status: 502 })
      }
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
        console.error('Abandoned-cart endpoint returned an invalid response.')
        return new Response('Reminder job failed', { status: 502 })
      }
      return Response.json(result)
    } catch (error) {
      console.error('Scheduled reminder request failed:', error instanceof Error ? error.name : 'UnknownError')
      return new Response('Reminder job failed', { status: 502 })
    }
  }
}
