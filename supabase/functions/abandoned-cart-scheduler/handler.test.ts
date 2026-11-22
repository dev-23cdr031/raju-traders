import { createSchedulerHandler } from './handler.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const config = {
  schedulerSecret: 's'.repeat(40),
  cronSecret: 'c'.repeat(40),
  siteOrigin: 'https://www.rajutraders.in',
}

function request(secret?: string) {
  return new Request('https://example.test/function', {
    method: 'POST',
    headers: secret ? { 'x-ajr-scheduler-secret': secret } : {},
  })
}

Deno.test('rejects unauthorized calls without contacting the website', async () => {
  let called = false
  const handler = createSchedulerHandler(config, () => {
    called = true
    return Promise.resolve(new Response())
  })
  for (const secret of [undefined, 'wrong-secret']) {
    assert((await handler(request(secret))).status === 401, 'Expected unauthorized')
  }
  assert(!called, 'Unauthorized requests must not trigger the job')
})

Deno.test('sends an authenticated request to the fixed reminder route', async () => {
  const handler = createSchedulerHandler(config, (input, init) => {
    assert(String(input) === 'https://www.rajutraders.in/api/cron/abandoned-carts', 'Wrong endpoint')
    assert(init?.method === 'GET', 'Wrong method')
    assert(new Headers(init?.headers).get('authorization') === `Bearer ${config.cronSecret}`, 'Missing credential')
    assert(init?.redirect === 'error', 'Redirects must be rejected')
    return Promise.resolve(Response.json({ ok: true, thresholdMinutes: 30, sent: 0 }))
  })
  const response = await handler(request(config.schedulerSecret))
  assert(response.status === 200, 'Expected successful response')
  assert((await response.json()).thresholdMinutes === 30, 'Expected upstream result')
})

Deno.test('rejects unsafe configuration and reports upstream failure', async () => {
  let called = false
  const fetcher: typeof fetch = () => {
    called = true
    return Promise.resolve(new Response('failure', { status: 503 }))
  }
  const invalid = createSchedulerHandler({ ...config, siteOrigin: 'http://example.test' }, fetcher)
  assert((await invalid(request(config.schedulerSecret))).status === 503, 'Unsafe origin accepted')
  assert(!called, 'Unsafe origin was contacted')
  const handler = createSchedulerHandler(config, fetcher)
  assert((await handler(request(config.schedulerSecret))).status === 502, 'Expected upstream failure')
  assert(called, 'Expected request to website')
})
