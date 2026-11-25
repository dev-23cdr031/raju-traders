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
const marketing = loadTypeScript('lib/marketing-email.ts', { 'server-only': {} })
const product = { product: { id: 1, name: 'Nuts', image: '/nuts.png', price: 250, selectedWeight: '250 g' }, quantity: 1 }

function createFixture({ order, orderError, currentItems = [product], finalEligible = true, optedOut = false } = {}) {
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
    rpc: async (name) => ({ data: name === 'ajr_marketing_campaign_enabled' ? true : [cart], error: null }),
    from(table) {
      let columns = ''
      let update = null
      const builder = {
        select(value) { columns = value; return this },
        update(value) { update = value; return this },
        eq() { return this }, is() { return this }, not() { return this }, lte() { return this }, gte() { return this },
        maybeSingle: async () => {
          if (table === 'cart_reminder_preferences') return { data: optedOut ? { opted_in: false, suppressed_at: null } : null, error: null }
          if (table === 'carts') return { data: { items: currentItems }, error: null }
          if (update) return { data: { id: cart.id }, error: null }
          if (columns === 'id') return { data: finalEligible ? { id: cart.id } : null, error: null }
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
    '@/lib/marketing-email': marketing,
    '@/lib/cart-recovery-email': {
      CartRecoveryEmailRejectedError: class extends Error {},
      CartRecoveryPreparationError: class extends Error {},
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

process.env.CRON_SECRET = 'test-secret-with-more-than-thirty-two-characters'
process.env.PRODUCT_REMINDER_TOKEN_SECRET = 'test-reminder-secret-at-least-thirty-two-characters'
process.env.RESEND_API_KEY = 'test-key'
process.env.AJR_EMAIL_EDGE_URL = 'https://example.invalid/functions/v1/shared-email-automation'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
process.env.AJR_MAIL_SECRET = 'test-mail-secret-at-least-thirty-two-characters'
process.env.ABANDONED_CART_MINUTES = '30'
delete process.env.NOTIFICATIONS_EMAIL_ENABLED
const authorized = () => new Request('https://example.invalid/api/cron/abandoned-carts', {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
})

test('cart email configuration identifies missing settings without exposing secrets', () => {
  const keys = ['AJR_EMAIL_EDGE_URL', 'AJR_MAIL_SECRET', 'PRODUCT_REMINDER_TOKEN_SECRET', 'NOTIFICATIONS_EMAIL_ENABLED']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    delete process.env.AJR_EMAIL_EDGE_URL
    process.env.AJR_MAIL_SECRET = 'short-secret'
    delete process.env.PRODUCT_REMINDER_TOKEN_SECRET
    process.env.NOTIFICATIONS_EMAIL_ENABLED = 'false'
    const issues = marketing.cartRecoveryConfigurationIssues()
    assert.equal(issues.length, 4)
    assert.match(issues.join(' '), /AJR_EMAIL_EDGE_URL/)
    assert.match(issues.join(' '), /AJR_MAIL_SECRET/)
    assert.match(issues.join(' '), /PRODUCT_REMINDER_TOKEN_SECRET/)
    assert.match(issues.join(' '), /NOTIFICATIONS_EMAIL_ENABLED/)
    assert.doesNotMatch(issues.join(' '), /short-secret/)
    process.env.AJR_EMAIL_EDGE_URL = 'https://other.invalid/functions/v1/shared-email-automation'
    assert.match(marketing.marketingEmailConfigurationIssues().join(' '), /configured Supabase project/)
    process.env.AJR_EMAIL_EDGE_URL = 'https://example.invalid/functions/v1/shared-email-automation'
    process.env.AJR_MAIL_SECRET = 'test-mail-secret-at-least-thirty-two-characters'
    process.env.PRODUCT_REMINDER_TOKEN_SECRET = 'test-reminder-secret-at-least-thirty-two-characters'
    delete process.env.NOTIFICATIONS_EMAIL_ENABLED
    assert.deepEqual(marketing.cartRecoveryConfigurationIssues(), [])
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})

test('saving an unchanged cart preserves the inactivity timer; changing it resets the timer', async () => {
  const updates = []
  const saved = { id: 'cart-1', user_id: 'user-1', cart_items: [product], cart_started_at: '2025-01-01T00:00:00Z', recovery_email_consent: true }
  const admin = {
    from(table) {
      assert.equal(table, 'abandoned_carts')
      return {
        select() { return this }, eq() { return this }, is() { return this },
        async maybeSingle() { return { data: saved, error: null } },
        update(values) {
          updates.push(values)
          return { async eq() { return { error: null } } }
        },
      }
    },
  }
  const user = { id: 'user-1', email: 'test@example.invalid', email_confirmed_at: '2025-01-01', user_metadata: {} }
  await carts.persistSignedInCartSnapshot({ admin, user, items: [product], userAgent: null })
  assert.equal(Object.hasOwn(updates[0], 'last_activity_at'), false)
  await carts.persistSignedInCartSnapshot({ admin, user, items: [{ ...product, quantity: 2 }], userAgent: null })
  assert.ok(Number.isFinite(Date.parse(updates[1].last_activity_at)))
})

test('admin dashboard reports scheduled, sent, delivered, bounced, skipped and failed statuses', async () => {
  const rows = ['skipped', 'bounced', 'delivered', 'sent', 'scheduled', 'failed'].map((id) => ({
    id, user_id: 'user-1', cart_items: [product], item_count: 1, cart_total: 250,
    customer_email: 'test@example.invalid', recovery_email_consent: true,
    last_activity_at: new Date(Date.now() - 31 * 60_000).toISOString(),
    reminder_provider_id: ['bounced', 'delivered', 'sent', 'failed'].includes(id) ? id : null,
    reminder_sent_at: ['bounced', 'delivered', 'sent'].includes(id) ? new Date().toISOString() : null,
    reminder_result: id === 'skipped' ? 'sending' : id === 'failed' ? 'failed' : id === 'scheduled' ? null : 'sent',
  }))
  const admin = {
    from(table) {
      const builder = {
        select() { return this }, eq() { return this }, gt() { return this }, order() { return this }, limit() { return this }, in() { return this },
        then(resolve) {
          const data = table === 'abandoned_carts' ? rows
            : table === 'notification_events' ? [
                { event_key: 'cart:skipped:recovery', status: 'skipped', error: 'Cart already purchased.' },
                { event_key: 'cart:failed:recovery', status: 'delivered', error: null },
              ]
              : table === 'notification_receipts' ? [
                { provider_message_id: 'bounced', status: 'email.bounced' },
                { provider_message_id: 'delivered', status: 'email.delivered' },
                { provider_message_id: 'failed', status: 'email.failed' },
              ] : []
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  const route = loadTypeScript('app/api/admin/abandoned-carts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/abandoned-carts': carts,
    '@/lib/marketing-email': marketing,
    '@/lib/supabase': { requireAdmin: async () => ({ user: { id: 'admin' } }), supabaseAdmin: () => admin },
  })
  const request = new Request('https://example.invalid/api/admin/abandoned-carts')
  request.nextUrl = new URL(request.url)
  const response = await route.GET(request)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result.carts.map((cart) => cart.emailStatus), ['Skipped', 'Bounced', 'Delivered', 'Sent', 'Scheduled', 'Failed'])
  assert.equal(result.carts[0].emailEventError, 'Cart already purchased.')
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

test('changed or emptied carts and revoked eligibility prevent a claimed reminder', async () => {
  for (const options of [{ currentItems: [] }, { currentItems: [{ ...product, quantity: 2 }] }, { finalEligible: false }, { optedOut: true }]) {
    const fixture = createFixture(options)
    await fixture.route.GET(authorized())
    assert.equal(fixture.getEmails(), 0)
    assert.equal(fixture.events.at(-1).status, 'failed')
  }
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
          if (table === 'cart_reminder_preferences') return { data: null, error: null }
          if (table === 'carts') return { data: { items: cart.cart_items }, error: null }
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
    '@/lib/marketing-email': marketing,
    '@/lib/cart-recovery-email': {
      CartRecoveryEmailRejectedError: class extends Error {},
      CartRecoveryPreparationError: class extends Error {},
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
  let requestHeaders
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body)
    requestHeaders = options.headers
    return Response.json({ id: 'test-message' })
  }
  try {
    const email = loadTypeScript('lib/cart-recovery-email.ts', {
      'server-only': {},
      '@/lib/abandoned-carts': carts,
      '@/lib/cart-reminder-token': loadTypeScript('lib/cart-reminder-token.ts', {}),
      '@/lib/marketing-email': marketing,
    })
    await email.sendCartRecoveryEmail({
      email: 'test@example.invalid',
      name: '<Test>',
      itemCount: 2,
      items: [{ product: { name: '<Nuts>', image: '/nuts.png', price: 250 }, quantity: 2 }],
      token: 'test-token',
      cartId: '550e8400-e29b-41d4-a716-446655440000',
    })
    assert.equal(payload.subject, 'You Left Something Behind at Raju Traders!')
    assert.match(payload.html, /https:\/\/example\.invalid\/ajr-logo\.png/)
    assert.match(payload.html, /&lt;Nuts&gt;/)
    assert.match(payload.html, /&lt;Test&gt;/)
    assert.match(payload.html, /https:\/\/example\.invalid\/\?cart=1/)
    assert.match(payload.html, /reminder-unsubscribe/)
    assert.match(payload.html, /https:\/\/example\.invalid\/nuts\.png/)
    assert.match(payload.html, /₹500/)
    assert.match(payload.text, /<Nuts>/)
    assert.equal(payload.id, '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(payload.campaign, 'cart')
    assert.equal(requestHeaders['x-ajr-mail-secret'], process.env.AJR_MAIL_SECRET)
    assert.match(payload.unsubscribe, /reminder-unsubscribe/)
    await assert.rejects(email.sendCartRecoveryEmail({
      email: 'test@example.invalid', name: 'Test', itemCount: 1,
      items: [{ product: { name: 'Nuts', price: 250 }, quantity: 1 }],
      token: 'test-token', cartId: '550e8400-e29b-41d4-a716-446655440000',
    }), email.CartRecoveryPreparationError)
  } finally {
    global.fetch = originalFetch
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl
  }
})

test('cart unsubscribe link is signed and withdrawal is durable', async () => {
  const tokens = loadTypeScript('lib/cart-reminder-token.ts', {})
  const cartId = '550e8400-e29b-41d4-a716-446655440000'
  const changes = []
  class NextResponse extends Response {
    static json(body, options) { return Response.json(body, options) }
  }
  const admin = {
    from() {
      return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }) }
    },
    rpc: async (name, args) => { changes.push({ name, args }); return { error: null } },
  }
  const route = loadTypeScript('app/api/cart/reminder-unsubscribe/route.ts', {
    'next/server': { NextResponse },
    '@/lib/cart-reminder-token': tokens,
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })
  const request = (signature) => ({ nextUrl: new URL(`https://example.invalid/?id=${cartId}&signature=${signature}`) })
  assert.equal((await route.POST(request('bad'))).status, 400)
  const signed = request(tokens.cartUnsubscribeSignature(cartId))
  assert.equal((await route.GET(signed)).status, 200)
  assert.equal(changes.length, 0)
  assert.equal((await route.POST(signed)).status, 200)
  assert.deepEqual(changes, [{ name: 'ajr_unsubscribe_cart_reminders', args: { p_user_id: 'user-1' } }])
})
