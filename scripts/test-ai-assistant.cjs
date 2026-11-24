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

const email = load('lib/product-reminder-email.ts')
const assistant = load('lib/ai-assistant.ts', {
  'server-only': {},
  '@/lib/product-reminder-email': email,
})
const conversationId = '11111111-1111-4111-8111-111111111111'
const product = { id: 1, name: 'Almonds', category: 'Nuts', image: '/almonds.webp', price: 250, weight: '250 g', variety: '' }

test('only structured requests are accepted, never customer messages or account data', () => {
  assert.equal(assistant.parseAssistantRequest({ intent: 'gift', language: 'en', conversationId, budget: 500 }).budget, 500)
  assert.throws(() => assistant.parseAssistantRequest({ intent: 'gift', language: 'en', conversationId, message: 'private' }), /fields/)
  assert.throws(() => assistant.parseAssistantRequest({ intent: 'gift', language: 'en', conversationId, productIds: ['1'] }), /selection/)
  assert.throws(() => assistant.parseAssistantRequest({ intent: 'compare', language: 'en', conversationId, productIds: [1] }), /two products/)
  assert.throws(() => assistant.parseAssistantRequest({ intent: 'gift', language: 'en', conversationId, budget: -1 }), /budget/)
})

test('Gemini receives only public catalog fields and validated output must reference real products', async () => {
  let transmitted
  const fetcher = async (_url, options) => {
    transmitted = JSON.parse(options.body)
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ids":[1]}' }] } }] })
  }
  const ranked = await assistant.rankPublicProducts('key', 'gift', [product], fetcher)
  assert.deepEqual(ranked, [product])
  const prompt = transmitted.contents[0].parts[0].text
  assert.deepEqual(JSON.parse(prompt), { action: 'gift', catalog: [{ id: 1, name: 'Almonds', category: 'Nuts' }] })
  await assert.rejects(() => assistant.rankPublicProducts('key', 'gift', [product], async () =>
    Response.json({ candidates: [{ content: { parts: [{ text: '{"ids":[999]}' }] } }] })), /unknown product/)
})

test('out-of-stock products are excluded and prices use the current offered size', () => {
  const row = { id: 1, name: 'Almonds', category: 'Nuts', type: 'Snacking', image: '/almonds.webp',
    price: 250, stock: 5, status: 'In stock', varieties: [{ name: 'Roasted', price: 1000, active: true }],
    pack_sizes: ['100 g', '250 g'] }
  assert.equal(assistant.assistantProduct(row).price, 100)
  assert.equal(assistant.assistantProduct({ ...row, stock: 0 }), null)
})

test('quota-exhausted requests return real catalog results without calling Gemini', async () => {
  const updates = []
  const admin = {
    rpc: async () => ({ data: [{ request_id: 'request-id', allow_ai: false }], error: null }),
    from(table) {
      if (table === 'products') {
        return {
          select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
          then(resolve) {
            return Promise.resolve({ data: [{ id: 1, name: 'Almonds', category: 'Nuts', type: 'Snacking',
              image: '/almonds.webp', price: 250, stock: 5, status: 'In stock', varieties: [], pack_sizes: ['250 g'] }], error: null }).then(resolve)
          },
        }
      }
      assert.equal(table, 'ai_assistant_requests')
      return { update(value) { updates.push(value); return this }, async eq() { return { error: null } } }
    },
  }
  const route = load('app/api/ai-assistant/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/ai-assistant': assistant,
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })

  const originalSecret = process.env.AI_RATE_LIMIT_SECRET
  const originalKey = process.env.GEMINI_API_KEY
  const originalVercel = process.env.VERCEL
  const originalFetch = global.fetch
  process.env.AI_RATE_LIMIT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  process.env.GEMINI_API_KEY = 'test-key'
  delete process.env.VERCEL
  global.fetch = () => { throw new Error('Gemini must not be called') }
  try {
    const request = new Request('https://example.invalid/api/ai-assistant', {
      method: 'POST', body: JSON.stringify({ intent: 'gift', language: 'en', conversationId, budget: 300 }),
    })
    const response = await route.POST(request)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.source, 'fallback')
    assert.equal(body.products[0].name, 'Almonds')
    assert.deepEqual(updates[0].product_ids, [1])
  } finally {
    global.fetch = originalFetch
    for (const [name, value] of [['AI_RATE_LIMIT_SECRET', originalSecret], ['GEMINI_API_KEY', originalKey], ['VERCEL', originalVercel]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('assistant admin routes reject non-admin requests before touching database', async () => {
  const denied = Response.json({ message: 'Admin access only.' }, { status: 403 })
  const route = load('app/api/admin/ai-assistant/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': {
      requireAdmin: async () => ({ response: denied.clone() }),
      supabaseAdmin: () => { throw new Error('Database must not be accessed') },
    },
  })
  const get = await route.GET(new Request('https://example.invalid'))
  const patch = await route.PATCH(new Request('https://example.invalid', { method: 'PATCH', body: '{}' }))
  assert.equal(get.status, 403)
  assert.equal(patch.status, 403)
  const faqRoute = load('app/api/admin/ai-assistant/faqs/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': {
      requireAdmin: async () => ({ response: denied.clone() }),
      supabaseAdmin: () => { throw new Error('Database must not be accessed') },
    },
  })
  assert.equal((await faqRoute.GET(new Request('https://example.invalid'))).status, 403)
  assert.equal((await faqRoute.POST(new Request('https://example.invalid', { method: 'POST', body: '{}' }))).status, 403)
})

test('public FAQ endpoint only requests published entries', async () => {
  const filters = []
  const admin = {
    from(table) {
      assert.equal(table, 'ai_assistant_faqs')
      return {
        select() { return this }, eq(...args) { filters.push(args); return this }, order() { return this },
        async limit() { return { data: [], error: null } },
      }
    },
  }
  const route = load('app/api/ai-assistant/faqs/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })
  const response = await route.GET()
  assert.equal(response.status, 200)
  assert.deepEqual(filters, [['published', true]])
  assert.match(response.headers.get('cache-control'), /s-maxage=60/)
})

test('offers exclude restricted and customer-specific coupon codes', async () => {
  const unrestricted = { id: 'public', code: 'PUBLIC', name: 'Public', description: '', discount_type: 'percentage',
    discount_value: 5, minimum_purchase: 0, maximum_order_amount: null, expires_at: '2099-01-01',
    first_order_only: false, new_customers_only: false, existing_customers_only: false,
    usage_limit: null, per_customer_limit: null, eligible_customer_ids: [], eligible_product_ids: [],
    excluded_product_ids: [], eligible_categories: [], excluded_categories: [] }
  const admin = {
    rpc: async () => ({ data: [{ request_id: 'request-id', allow_ai: false }], error: null }),
    from(table) {
      assert.equal(table, 'coupons')
      return {
        select() { return this }, eq() { return this }, lte() { return this }, gt() { return this },
        async limit() { return { data: [unrestricted, { ...unrestricted, id: 'private', code: 'PRIVATE', eligible_customer_ids: ['customer'] }, { ...unrestricted, id: 'first', code: 'FIRST', first_order_only: true }], error: null } },
      }
    },
  }
  const route = load('app/api/ai-assistant/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/ai-assistant': assistant,
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })
  const originalSecret = process.env.AI_RATE_LIMIT_SECRET
  const originalVercel = process.env.VERCEL
  process.env.AI_RATE_LIMIT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  delete process.env.VERCEL
  try {
    const response = await route.POST(new Request('https://example.invalid', {
      method: 'POST', body: JSON.stringify({ intent: 'offers', language: 'en', conversationId }),
    }))
    const body = await response.json()
    assert.deepEqual(body.offers.map((offer) => offer.code), ['PUBLIC'])
  } finally {
    if (originalSecret === undefined) delete process.env.AI_RATE_LIMIT_SECRET
    else process.env.AI_RATE_LIMIT_SECRET = originalSecret
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  }
})

test('invalid model selections fail closed to actual catalog and count the attempted request', async () => {
  const updates = []
  const admin = {
    rpc: async () => ({ data: [{ request_id: 'request-id', allow_ai: true }], error: null }),
    from(table) {
      if (table === 'products') return {
        select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
        then(resolve) { return Promise.resolve({ data: [{ id: 1, name: 'Almonds', category: 'Nuts', type: 'Snacking', image: '/almonds.webp', price: 250, stock: 5, status: 'In stock', varieties: [], pack_sizes: ['250 g'] }], error: null }).then(resolve) },
      }
      assert.equal(table, 'ai_assistant_requests')
      return { update(value) { updates.push(value); return this }, async eq() { return { error: null } } }
    },
  }
  const route = load('app/api/ai-assistant/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/ai-assistant': assistant,
    '@/lib/supabase': { supabaseAdmin: () => admin },
  })
  const originalSecret = process.env.AI_RATE_LIMIT_SECRET
  const originalKey = process.env.GEMINI_API_KEY
  const originalVercel = process.env.VERCEL
  const originalFetch = global.fetch
  process.env.AI_RATE_LIMIT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  process.env.GEMINI_API_KEY = 'test-key'
  delete process.env.VERCEL
  global.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"ids":[999]}' }] } }] })
  try {
    const response = await route.POST(new Request('https://example.invalid', {
      method: 'POST', body: JSON.stringify({ intent: 'gift', language: 'en', conversationId }),
    }))
    const body = await response.json()
    assert.equal(body.source, 'fallback')
    assert.deepEqual(body.products.map((item) => item.id), [1])
    assert.equal(updates[0].status, 'failed')
  } finally {
    global.fetch = originalFetch
    for (const [name, value] of [['AI_RATE_LIMIT_SECRET', originalSecret], ['GEMINI_API_KEY', originalKey], ['VERCEL', originalVercel]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('authenticated requests apply an account rate limit without sending identity to Gemini', async () => {
  let reservation
  let prompt
  const admin = {
    rpc: async (_name, args) => { reservation = args; return { data: [{ request_id: 'request-id', allow_ai: true }], error: null } },
    from(table) {
      if (table === 'products') return {
        select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
        then(resolve) { return Promise.resolve({ data: [{ id: 1, name: 'Almonds', category: 'Nuts', type: 'Snacking', image: '/almonds.webp', price: 250, stock: 5, status: 'In stock', varieties: [], pack_sizes: ['250 g'] }], error: null }).then(resolve) },
      }
      return { update() { return this }, async eq() { return { error: null } } }
    },
  }
  const route = load('app/api/ai-assistant/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/ai-assistant': assistant,
    '@/lib/supabase': { supabaseAdmin: () => admin, getUserFromToken: async (token) => token === 'valid-token' ? { id: 'private-user-id' } : null },
  })
  const originalSecret = process.env.AI_RATE_LIMIT_SECRET
  const originalKey = process.env.GEMINI_API_KEY
  const originalVercel = process.env.VERCEL
  const originalFetch = global.fetch
  process.env.AI_RATE_LIMIT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  process.env.GEMINI_API_KEY = 'test-key'
  delete process.env.VERCEL
  global.fetch = async (_url, options) => {
    prompt = options.body
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ids":[1]}' }] } }] })
  }
  try {
    const body = JSON.stringify({ intent: 'gift', language: 'en', conversationId })
    const bad = await route.POST(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer invalid' }, body }))
    assert.equal(bad.status, 401)
    const response = await route.POST(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body }))
    assert.equal(response.status, 200)
    assert.match(reservation.p_user_hash, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(prompt, /private-user-id|valid-token|127\.0\.0\.1/)
  } finally {
    global.fetch = originalFetch
    for (const [name, value] of [['AI_RATE_LIMIT_SECRET', originalSecret], ['GEMINI_API_KEY', originalKey], ['VERCEL', originalVercel]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
