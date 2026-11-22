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
