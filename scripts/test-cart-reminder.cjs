const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadTypeScript(file, dependencies) {
  const filename = path.resolve(__dirname, '..', file)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const resolve = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
    resolve, module, module.exports, filename, path.dirname(filename),
  )
  return module.exports
}

const carts = loadTypeScript('lib/abandoned-carts.ts', { 'server-only': {} })
const product = { product: { id: 1, selectedWeight: '250 g' }, quantity: 1 }

function createFixture({ order, orderError } = {}) {
  const now = Date.now()
  const cart = {
    id: 'cart-1',
    user_id: 'user-1',
    customer_email: 'test@example.invalid',
    customer_name: 'Test',
    item_count: 1,
    cart_items: [product],
    cart_started_at: new Date(now - 3600_000).toISOString(),
    last_activity_at: new Date(now - 31 * 60_000).toISOString(),
    attempt_at: new Date(now).toISOString(),
    order_id: null,
  }
  const events = []
  let emails = 0
  let cartClosed = false

  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: cart.customer_email, email_confirmed_at: '2025-01-01' } }, error: null }) } },
    rpc: async () => ({ data: [cart], error: null }),
    from(table) {
      let columns = ''
      let update = null
      const builder = {
        select(value) { columns = value; return this },
        update(value) { update = value; return this },
        eq() { return this }, is() { return this }, not() { return this }, lte() { return this }, gte() { return this },
        maybeSingle: async () => {
          if (update) return { data: { id: cart.id }, error: null }
          if (columns.startsWith('id,customer_name')) return { data: null, error: null }
          return { data: cart, error: null }
        },
        then(resolve) {
          if (table === 'orders') return Promise.resolve({ data: order ? [order] : [], error: orderError || null }).then(resolve)
          if (update?.closed_at) cartClosed = true
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  const route = loadTypeScript('app/api/cron/abandoned-carts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/abandoned-carts': carts,
    '@/lib/cart-recovery-email': {
      CartRecoveryEmailRejectedError: class extends Error {},
      sendCartRecoveryEmail: async () => { emails += 1; return { id: 'test-message' } },
    },
    '@/lib/notification-automation': {
      beginCartNotificationEvent: async () => ({ id: 'event-1', status: 'sending' }),
      recordNotificationEvent: async (_admin, _id, event) => { events.push(event) },
    },
    '@/lib/order-whatsapp': { sendAbandonedCartWhatsApp: async () => ({ skipped: true }), WhatsAppProviderRejectedError: class extends Error {} },
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })
  return { route, events, getEmails: () => emails, isCartClosed: () => cartClosed, now }
}

process.env.CRON_SECRET = 'test-secret'
process.env.RESEND_API_KEY = 'test-key'
process.env.ABANDONED_CART_MINUTES = '30'
delete process.env.NOTIFICATIONS_EMAIL_ENABLED
const authorized = () => new Request('https://example.invalid/api/cron/abandoned-carts', {
  headers: { Authorization: 'Bearer test-secret' },
})

test('completed matching purchases are closed without sending a reminder', async () => {
  const fixture = createFixture({
    order: { id: 'order-1', user_id: 'user-1', status: 'Pending', payment_method: 'COD', created_at: new Date(Date.now() - 20 * 60_000).toISOString(), items: [product] },
  })
  const response = await fixture.route.GET(authorized())
  assert.equal(response.status, 200)
  assert.equal(fixture.getEmails(), 0)
  assert.equal(fixture.isCartClosed(), true)
  assert.equal(fixture.events[0].status, 'skipped')
})

test('order lookup failures fail closed without sending a reminder', async () => {
  const fixture = createFixture({ orderError: { message: 'database unavailable' } })
  const response = await fixture.route.GET(authorized())
  assert.equal(response.status, 200)
  assert.equal(fixture.getEmails(), 0)
  assert.equal(fixture.events[0].status, 'failed')
})

test('an unpaid order does not prevent an eligible reminder', async () => {
  const fixture = createFixture({
    order: { id: 'order-1', user_id: 'user-1', status: 'Pending', payment_method: 'Card', payment_status: 'Pending', created_at: new Date(Date.now() - 20 * 60_000).toISOString(), items: [product] },
  })
  const response = await fixture.route.GET(authorized())
  const result = await response.json()
  assert.equal(fixture.getEmails(), 1)
  assert.equal(result.thresholdMinutes, 30)
  assert.equal(result.sent, 1)
})

function createManualFixture({ order, orderError, consent = true, claim = true, eligible = true, sent = false } = {}) {
  const cart = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: 'user-1',
    customer_email: 'test@example.invalid',
    customer_name: 'Test',
    item_count: 1,
    cart_items: [product],
    recovery_email_consent: consent,
    cart_started_at: new Date(Date.now() - 3600_000).toISOString(),
    last_activity_at: new Date(Date.now() - 31 * 60_000).toISOString(),
    reminder_sent_at: sent ? new Date().toISOString() : null,
    reminder_attempt_at: null,
    reminder_result: null,
    closed_at: null,
    order_id: null,
  }
  const filters = []
  let email
  let updates = 0
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: cart.customer_email, email_confirmed_at: '2025-01-01' } }, error: null }) } },
    from(table) {
      let columns = ''
      let update = null
      const builder = {
        select(value) { columns = value; return this },
        update(value) { update = value; return this },
        eq(key, value) { filters.push([key, value]); return this },
        is(key, value) { filters.push([key, value]); return this },
        lte(key, value) { filters.push([key, value]); return this },
        gte() { return this }, or() { return this },
        maybeSingle: async () => {
          if (update) {
            updates += 1
            return { data: updates === 1 && !claim ? null : { id: cart.id }, error: null }
          }
          if (columns === 'id') return { data: eligible ? { id: cart.id } : null, error: null }
          return { data: cart, error: null }
        },
        then(resolve) {
          if (table === 'orders') return Promise.resolve({ data: order ? [order] : [], error: orderError || null }).then(resolve)
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  const route = loadTypeScript('app/api/admin/abandoned-carts/[id]/remind/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/abandoned-carts': { ...carts, safeRecoveryBaseUrl: () => 'https://example.invalid' },
    '@/lib/cart-recovery-email': {
      CartRecoveryEmailRejectedError: class extends Error {},
      sendCartRecoveryEmail: async (input) => { email = input; return { id: 'test-message' } },
    },
    '@/lib/supabase': { requireAdmin: async () => ({}), supabaseAdmin: () => admin },
  })
  return {
    send: () => route.POST(new Request('https://example.invalid', { method: 'POST' }), { params: Promise.resolve({ id: cart.id }) }),
    email: () => email,
    filters,
  }
}

test('manual reminder sends the saved items to the verified account once', async () => {
  const fixture = createManualFixture()
  assert.equal((await fixture.send()).status, 200)
  assert.deepEqual(fixture.email().items, [product])
  assert.equal(fixture.email().email, 'test@example.invalid')
  assert.ok(fixture.filters.some(([key, value]) => key === 'closed_at' && value === null))
  assert.ok(fixture.filters.some(([key]) => key === 'last_activity_at'))
})

test('manual reminder blocks completed purchases and failed order checks', async () => {
  for (const options of [
    { order: { status: 'pending', payment_method: 'COD', items: [product] } },
    { orderError: { message: 'database unavailable' } },
  ]) {
    const fixture = createManualFixture(options)
    assert.ok([409, 503].includes((await fixture.send()).status))
    assert.equal(fixture.email(), undefined)
  }
})

test('manual reminder blocks revoked consent, prior sends, and changed cart state', async () => {
  for (const options of [{ consent: false }, { sent: true }, { claim: false }, { eligible: false }]) {
    const fixture = createManualFixture(options)
    assert.equal((await fixture.send()).status, 409)
    assert.equal(fixture.email(), undefined)
  }
})

test('recovery email includes branded logo, escaped items, and private links', async () => {
  const originalFetch = global.fetch
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.invalid'
  let payload
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body)
    return Response.json({ id: 'test-message' })
  }
  try {
    const email = loadTypeScript('lib/cart-recovery-email.ts', {
      'server-only': {},
      '@/lib/abandoned-carts': carts,
    })
    await email.sendCartRecoveryEmail({
      email: 'test@example.invalid',
      name: '<Test>',
      itemCount: 2,
      items: [{ product: { name: '<Nuts>' }, quantity: 2 }],
      token: 'test-token',
    })
    assert.match(payload.subject, /Raju Traders/)
    assert.match(payload.html, /https:\/\/rajutraders\.in\/ajr-logo\.png/)
    assert.match(payload.html, /&lt;Nuts&gt;/)
    assert.match(payload.html, /&lt;Test&gt;/)
    assert.match(payload.html, /cart\/recover\?token=test-token/)
    assert.match(payload.html, /action=unsubscribe/)
    assert.match(payload.text, /<Nuts>/)
  } finally {
    global.fetch = originalFetch
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl
  }
})
