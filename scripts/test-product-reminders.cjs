const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', file)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const resolve = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  new Function('require', 'module', 'exports', output)(resolve, module, module.exports)
  return module.exports
}

process.env.PRODUCT_REMINDER_TOKEN_SECRET = 'test-secret-with-more-than-thirty-two-characters'
process.env.CRON_SECRET = 'test-cron-secret-with-more-than-thirty-two-characters'
process.env.RESEND_API_KEY = 'test-api-key'
const emailModule = load('lib/product-reminder-email.ts')
const id = '11111111-1111-4111-8111-111111111111'

test('email uses real product data and signed, purpose-bound links', () => {
  const email = emailModule.productReminderEmail({
    id, customerName: '<Guest>', productName: 'Almonds & Cashews',
    productImage: '/almonds.webp', description: '<fresh>', price: 250, weight: '250 g', variety: '',
  })

  assert.match(email.html, /https:\/\/www\.rajutraders\.in\/ajr-logo\.png/)
  assert.match(email.html, /https:\/\/www\.rajutraders\.in\/almonds\.webp/)
  assert.match(email.html, /Almonds &amp; Cashews/)
  assert.doesNotMatch(email.html, /<fresh>/)
  assert.match(email.text, /Almonds & Cashews/)
  const signature = emailModule.reminderSignature(id, 'unsubscribe')
  assert.equal(emailModule.validReminderSignature(id, 'unsubscribe', signature), true)
  assert.equal(emailModule.validReminderSignature(id, 'click', signature), false)
  assert.equal(emailModule.validReminderSignature(id, 'unsubscribe', 'wrong'), false)
})

test('reminder pricing uses the current available variety and pack size', () => {
  const offer = emailModule.currentProductOffer({
    price: 250, type: 'Snacking', image: '/almonds.webp',
    pack_sizes: ['250 g', '100 g'],
    varieties: [{ name: 'Roasted', price: 1000, image: '/roasted.webp', active: true }],
  })
  assert.deepEqual(offer, { price: 100, weight: '100 g', variety: 'Roasted', image: '/roasted.webp' })
  assert.throws(() => emailModule.currentProductOffer({
    price: 250, type: 'Snacking', image: '/almonds.webp', pack_sizes: [],
    varieties: [{ name: 'Roasted', price: 1000, active: false }],
  }))
})

function fixture({ optedIn = true, cancelled = false, revokeBeforeSend = false, responseStatus = 200, networkError = false } = {}) {
  const patches = []
  const messages = []
  let preferenceReads = 0
  const candidate = { id, user_id: 'user-id', product_id: 1, attempts: 1 }
  const rows = {
    product_reminder_preferences: { opted_in: optedIn, suppressed_at: null },
    products: { name: 'Almonds', image: '/almonds.webp', detail: 'Almonds', price: 250, active: true },
    product_reminders: { status: 'sending', cancel_reason: cancelled ? 'added_to_cart' : null },
  }
  const admin = {
    rpc: async (name) => ({ data: name === 'ajr_marketing_campaign_enabled' ? true : [candidate], error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'test@example.invalid', email_confirmed_at: '2025-01-01', user_metadata: { name: 'Test' } } }, error: null }) } },
    from(table) {
      let patch
      return {
        select() { return this }, eq() { return this },
        maybeSingle: async () => ({
          data: table === 'product_reminder_preferences' && ++preferenceReads === 2 && revokeBeforeSend
            ? { opted_in: false, suppressed_at: null } : rows[table], error: null,
        }),
        update(value) { patch = value; return this },
        then(resolve) { patches.push(patch); return Promise.resolve({ error: null }).then(resolve) },
      }
    },
  }
  const route = load('app/api/cron/product-reminders/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': { supabaseAdmin: () => admin },
    '@/lib/product-reminder-email': emailModule,
    '@/lib/marketing-email': load('lib/marketing-email.ts', { 'server-only': {} }),
  })
  return { route, patches, messages, fetch: async (_url, options) => {
    messages.push(options)
    if (networkError) throw new Error('network error')
    return Response.json(responseStatus === 200 ? { id: 'resend-id' } : { message: 'rejected' }, { status: responseStatus })
  } }
}

test('scheduler requires its secret, enforces consent and respects cart cancellation', async () => {
  process.env.AJR_EMAIL_EDGE_URL = 'https://example.invalid/functions/v1/shared-email-automation'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
  process.env.AJR_MAIL_SECRET = 'test-mail-secret-at-least-thirty-two-characters'
  for (const options of [{ optedIn: false }, { cancelled: true }, { revokeBeforeSend: true }]) {
    const f = fixture(options)
    const oldFetch = global.fetch
    global.fetch = f.fetch
    try {
      const unauthorized = await f.route.GET(new Request('https://example.invalid'))
      assert.equal(unauthorized.status, 401)
      const response = await f.route.GET(new Request('https://example.invalid', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }))
      assert.equal(response.status, 200)
      assert.equal(f.messages.length, 0)
      assert.equal(f.patches[0].status, 'cancelled')
    } finally { global.fetch = oldFetch }
  }
})

test('signup forwards only an explicit marketing choice without changing OTP behavior', async () => {
  const { POST } = load('app/api/auth/signup/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': { cleanSupabaseUrl: 'https://auth.example.invalid' },
  })
  const oldFetch = global.fetch
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
  try {
    for (const choice of [true, false, 'true', undefined]) {
      let payload
      global.fetch = async (_url, options) => {
        payload = JSON.parse(options.body)
        return Response.json({ user: { id: 'new-user' } })
      }
      const response = await POST(new Request('https://example.invalid', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.invalid', password: 'password', productMarketingConsent: choice }),
      }))
      assert.equal(payload.data.product_marketing_consent, choice === true)
      assert.equal(payload.data.cart_marketing_consent, choice === true)
      assert.deepEqual(await response.json(), { session: null, needsConfirmation: true })
    }
  } finally {
    global.fetch = oldFetch
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey
  }
})

test('scheduler records provider acceptance and does not retry unknown outcomes', async () => {
  for (const options of [{}, { networkError: true }, { responseStatus: 429 }]) {
    const f = fixture(options)
    const oldFetch = global.fetch
    global.fetch = f.fetch
    try {
      await f.route.GET(new Request('https://example.invalid', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }))
      assert.equal(f.messages.length, 1)
      assert.equal(JSON.parse(f.messages[0].body).id, id)
      assert.equal(f.patches[0].status, options.networkError ? 'uncertain' : options.responseStatus === 429 ? 'pending' : 'sent')
    } finally { global.fetch = oldFetch }
  }
})

test('anonymous product visits are rejected before recording', async () => {
  let recorded = false
  const { POST } = load('app/api/product-reminders/visit/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': {
      requireUser: async () => ({ response: Response.json({ message: 'Unauthorized' }, { status: 401 }) }),
      supabaseAdmin: () => { recorded = true; throw new Error('must not record') },
    },
  })
  const response = await POST(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify({ productId: 1 }) }))
  assert.equal(response.status, 401)
  assert.equal(recorded, false)
})

test('unsubscribe needs a signed link and GET does not change consent', async () => {
  const changes = []
  class NextResponse extends Response {
    static json(body, options) { return Response.json(body, options) }
  }
  const admin = {
    from(table) {
      let patch
      return {
        select() { return this }, eq() { return this },
        maybeSingle: async () => ({ data: { user_id: 'user-id' }, error: null }),
        update(value) { patch = value; return this },
        then(resolve) { changes.push({ table, patch }); return Promise.resolve({ error: null }).then(resolve) },
      }
    },
  }
  const route = load('app/api/product-reminders/unsubscribe/route.ts', {
    'next/server': { NextResponse },
    '@/lib/supabase': { supabaseAdmin: () => admin },
    '@/lib/product-reminder-email': emailModule,
  })
  const request = (signature) => ({ nextUrl: new URL(`https://example.invalid/?id=${id}&signature=${signature}`) })
  assert.equal((await route.POST(request('bad'))).status, 400)
  const signed = request(emailModule.reminderSignature(id, 'unsubscribe'))
  assert.equal((await route.GET(signed)).status, 200)
  assert.equal(changes.length, 0)
  assert.equal((await route.POST(signed)).status, 200)
  assert.equal(changes[0].table, 'product_reminder_preferences')
  assert.equal(changes[0].patch.opted_in, false)
  assert.equal(changes[1].patch.status, 'cancelled')
})

test('signed product links record the click and open the correct product', async () => {
  const changes = []
  const admin = {
    from(table) {
      let patch
      return {
        select() { return this }, eq() { return this }, is() { return this },
        maybeSingle: async () => ({ data: { product_id: 42, status: 'sent', clicked_at: null }, error: null }),
        insert(value) { changes.push({ table, value }); return Promise.resolve({ error: null }) },
        update(value) { patch = value; return this },
        then(resolve) { changes.push({ table, value: patch }); return Promise.resolve({ error: null }).then(resolve) },
      }
    },
  }
  const { GET } = load('app/api/product-reminders/click/route.ts', {
    'next/server': { NextResponse: {
      json: (body, options) => Response.json(body, options),
      redirect: (url, options) => new Response(null, { ...options, headers: { ...options.headers, Location: url } }),
    } },
    '@/lib/supabase': { supabaseAdmin: () => admin },
    '@/lib/product-reminder-email': emailModule,
  })
  const request = (signature) => ({ nextUrl: new URL(`https://example.invalid/?id=${id}&signature=${signature}`) })
  assert.equal((await GET(request(emailModule.reminderSignature(id, 'unsubscribe')))).status, 400)
  assert.equal(changes.length, 0)
  const response = await GET(request(emailModule.reminderSignature(id, 'click')))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), 'https://www.rajutraders.in/?product=42')
  assert.deepEqual(changes[0], { table: 'product_reminder_clicks', value: { reminder_id: id } })
})
