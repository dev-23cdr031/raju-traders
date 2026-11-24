const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shared-email-automation', 'handler.ts'), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', output)(mod, mod.exports)
const secret = 'a-secret-with-at-least-thirty-two-characters'
const id = '550e8400-e29b-41d4-a716-446655440000'
const config = {
  schedulerSecret: secret, mailSecret: secret + 'mail', cronSecret: secret + 'cron',
  appUrl: 'https://www.rajutraders.in', resendApiKey: 'test-key', resendFromEmail: 'no-reply@rajutraders.in',
  supabaseUrl: 'https://database.example.invalid', serviceRoleKey: 'test-service-role',
}
const email = {
  action: 'send', campaign: 'cart', id, to: 'test@example.invalid', subject: 'Test',
  html: '<p>Test</p>', text: 'Test',
  unsubscribe: `https://www.rajutraders.in/api/cart/reminder-unsubscribe?id=${id}`,
}
const request = (body, header = 'x-ajr-mail-secret', value = config.mailSecret) =>
  new Request('https://edge.example.invalid', { method: 'POST', headers: { [header]: value }, body: JSON.stringify(body) })

function fixture({ usageFailure = false, reservation = id, eligible = true, sendStatus = 200, networkError = false } = {}) {
  const calls = []
  const usage = { emails: {
    daily: { used: 12, limit: 100, resets_at: '2099-01-01T00:00:00Z' },
    monthly: { used: 50, limit: 3000, resets_at: '2099-01-01T00:00:00Z' },
  } }
  const fetcher = async (input, options = {}) => {
    const url = String(input)
    calls.push({ url, options })
    if (url.endsWith('/usage')) return usageFailure ? new Response('', { status: 401 }) : Response.json(usage)
    if (url.endsWith('/ajr_reserve_resend_api_slot')) return Response.json(0)
    if (url.endsWith('/ajr_reserve_marketing_email')) return Response.json(reservation)
    if (url.endsWith('/ajr_marketing_email_still_eligible')) return Response.json(eligible)
    if (url.endsWith('/ajr_marketing_campaign_enabled')) return Response.json(true)
    if (url.endsWith('/ajr_finish_marketing_email') || url.endsWith('/ajr_record_email_scheduler_run')) return Response.json(null)
    if (url === 'https://api.resend.com/emails') {
      if (networkError) throw new Error('network error')
      return Response.json(sendStatus === 200 ? { id: 'provider-id' } : { message: 'rejected' }, { status: sendStatus })
    }
    if (url.includes('/api/cron/')) return Response.json({ ok: true })
    throw new Error(`Unexpected request: ${url}`)
  }
  return { handler: mod.exports.createSharedEmailHandler(config, fetcher), calls }
}

test('scheduler is authenticated and invokes both campaigns once', async () => {
  const f = fixture()
  assert.equal((await f.handler(request({}, 'x-ajr-scheduler-secret', 'wrong'))).status, 401)
  assert.equal(f.calls.length, 0)
  const result = await f.handler(request({}, 'x-ajr-scheduler-secret', secret))
  assert.equal(result.status, 200)
  assert.deepEqual(f.calls.filter((call) => call.url.includes('/api/cron/')).map((call) => new URL(call.url).pathname),
    ['/api/cron/abandoned-carts', '/api/cron/product-reminders'])
})

test('usage failures and quota exhaustion fail closed without sending', async () => {
  for (const options of [{ usageFailure: true }, { reservation: null }]) {
    const f = fixture(options)
    const response = await f.handler(request(email))
    assert.equal((await response.json()).code, 'paused')
    assert.equal(f.calls.some((call) => call.url === 'https://api.resend.com/emails'), false)
  }
})

test('sender rechecks eligibility and uses a stable provider idempotency key', async () => {
  const blocked = fixture({ eligible: false })
  assert.equal((await blocked.handler(request(email))).status, 409)
  assert.equal(blocked.calls.some((call) => call.url === 'https://api.resend.com/emails'), false)
  const f = fixture()
  assert.equal((await f.handler(request(email))).status, 200)
  const sent = f.calls.find((call) => call.url === 'https://api.resend.com/emails')
  assert.equal(sent.options.headers['Idempotency-Key'], `cart-reminder/${id}`)
  const body = JSON.parse(sent.options.body)
  assert.equal(body.from, 'no-reply@rajutraders.in')
  assert.deepEqual(body.to, ['test@example.invalid'])
  assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

test('unknown provider outcomes retain an uncertain reservation; rejections release it', async () => {
  for (const [options, expected] of [[{ networkError: true }, 'uncertain'], [{ sendStatus: 429 }, 'rejected']]) {
    const f = fixture(options)
    const response = await f.handler(request(email))
    assert.equal(response.status, options.networkError ? 502 : 429)
    const finish = f.calls.find((call) => call.url.endsWith('/ajr_finish_marketing_email'))
    assert.equal(JSON.parse(finish.options.body).p_status, expected)
  }
})

test('mail endpoint rejects invalid authorization and external unsubscribe links', async () => {
  const f = fixture()
  assert.equal((await f.handler(request(email, 'x-ajr-mail-secret', 'wrong'))).status, 401)
  assert.equal((await f.handler(request({ ...email, unsubscribe: 'https://attacker.invalid/api/cart/reminder-unsubscribe' }))).status, 400)
  assert.equal(f.calls.length, 0)
})
