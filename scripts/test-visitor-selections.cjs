const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')

function loadTypeScript(file, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', file)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const resolve = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  new Function('require', 'module', 'exports', output)(resolve, module, module.exports)
  return module.exports
}

test('selection tracking requires consent and sends the selected product option', () => {
  const values = new Map()
  const sent = []
  global.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    crypto: webcrypto,
    dispatchEvent() {},
  }
  Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent: 'Chrome/1', platform: 'Win32', maxTouchPoints: 0 } })
  global.fetch = (_url, options) => { sent.push(JSON.parse(options.body)); return Promise.resolve(new Response()) }
  const { trackAnalytics } = loadTypeScript('lib/visitor-analytics-client.ts')
  trackAnalytics('product_selection', 'shop', undefined, 7, { kind: 'weight', value: '500 g' })
  assert.equal(sent.length, 0)
  values.set('ajr-analytics-consent', 'declined')
  trackAnalytics('product_selection', 'shop', undefined, 7, { kind: 'weight', value: '500 g' })
  assert.equal(sent.length, 0)
  values.set('ajr-analytics-consent', 'accepted')
  trackAnalytics('product_selection', 'shop', undefined, 7, { kind: 'weight', value: '500 g' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].productId, 7)
  assert.deepEqual(sent[0].selection, { kind: 'weight', value: '500 g' })
})

test('ingestion saves valid selections and rejects malformed or unrelated payloads', async () => {
  const inserted = []
  const { POST } = loadTypeScript('app/api/analytics/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': { supabaseAdmin: () => ({ from: () => ({ insert: async (row) => { inserted.push(row); return { error: null } } }) }) },
  })
  const base = {
    visitorId: '23b42c29-9be7-4a56-a19a-532dc5f09010',
    sessionId: '43b42c29-9be7-4a56-a19a-532dc5f09010',
    eventName: 'product_selection',
    page: 'shop',
    productId: 7,
    selection: { kind: 'variety', value: 'Roasted' },
  }
  const send = (body) => POST(new Request('https://example.invalid/api/analytics', {
    method: 'POST', headers: { 'User-Agent': 'Browser/1' }, body: JSON.stringify(body),
  }))
  assert.equal((await send(base)).status, 202)
  assert.equal(inserted[0].product_id, 7)
  assert.equal(inserted[0].selection_kind, 'variety')
  assert.equal(inserted[0].selection_value, 'Roasted')
  assert.equal((await send({ ...base, page: 'product-detail', selection: { kind: 'weight', value: '250 g' } })).status, 202)
  for (const body of [
    { ...base, productId: undefined },
    { ...base, page: 'login' },
    { ...base, selection: { kind: 'weight', value: '99 g' } },
    { ...base, selection: { kind: 'variety', value: 'x'.repeat(161) } },
    { ...base, selection: { kind: 'variety', value: 'abc\nxyz' } },
    { ...base, eventName: 'page_view', page: 'product-detail' },
  ]) assert.equal((await send(body)).status, 400)
  assert.equal((await send({ ...base, eventName: 'page_view', page: 'product-detail', selection: undefined })).status, 202)
  assert.equal(inserted[2].event_name, 'page_view')
  assert.equal(Object.hasOwn(inserted[2], 'selection_kind'), false)
  assert.equal(inserted.length, 3)
})

test('scrolling is buffered, excludes idle and hidden time, and stops when consent is revoked', () => {
  const values = new Map([['ajr-analytics-consent', 'accepted']])
  const sent = []
  const listeners = new Map()
  const documentListeners = new Map()
  let now = 0
  let interval
  const previous = { window: global.window, document: global.document, fetch: global.fetch, performance: global.performance }
  global.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    crypto: webcrypto,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    setInterval: (callback) => { interval = callback; return 1 },
    clearInterval: () => { interval = null },
  }
  global.document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => documentListeners.set(name, callback),
    removeEventListener: (name) => documentListeners.delete(name),
  }
  Object.defineProperty(global, 'performance', { configurable: true, value: { now: () => now } })
  global.fetch = (_url, options) => { sent.push({ ...JSON.parse(options.body), keepalive: options.keepalive }); return Promise.resolve(new Response()) }
  try {
    const { startScrollTracking } = loadTypeScript('lib/visitor-analytics-client.ts')
    const stop = startScrollTracking('shop')
    listeners.get('scroll')()
    now = 500
    listeners.get('scroll')()
    now = 3000
    listeners.get('scroll')()
    interval()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].eventName, 'scroll_duration')
    assert.equal(sent[0].durationMs, 1000)
    assert.equal(sent[0].page, 'shop')
    assert.equal(sent[0].keepalive, true)
    now = 4000
    listeners.get('scroll')()
    global.document.visibilityState = 'hidden'
    documentListeners.get('visibilitychange')()
    assert.equal(sent[1].durationMs, 250)
    now = 100000
    listeners.get('scroll')()
    global.document.visibilityState = 'visible'
    listeners.get('scroll')()
    values.set('ajr-analytics-consent', 'declined')
    stop()
    assert.equal(sent.length, 2)
    assert.equal(listeners.size, 0)
    assert.equal(documentListeners.size, 0)
    assert.equal(interval, null)
    startScrollTracking('shop')
    assert.equal(listeners.size, 0)
  } finally {
    global.window = previous.window
    global.document = previous.document
    global.fetch = previous.fetch
    Object.defineProperty(global, 'performance', { configurable: true, value: previous.performance })
  }
})

test('ingestion validates scroll durations without changing page duration handling', async () => {
  const inserted = []
  const { POST } = loadTypeScript('app/api/analytics/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase': { supabaseAdmin: () => ({ from: () => ({ insert: async (row) => { inserted.push(row); return { error: null } } }) }) },
  })
  const base = {
    visitorId: '23b42c29-9be7-4a56-a19a-532dc5f09010',
    sessionId: '43b42c29-9be7-4a56-a19a-532dc5f09010',
    eventName: 'scroll_duration', page: 'shop', deviceType: 'mobile', durationMs: 1200,
  }
  const send = (body) => POST(new Request('https://example.invalid/api/analytics', {
    method: 'POST', headers: { 'User-Agent': 'Browser/1' }, body: JSON.stringify(body),
  }))
  assert.equal((await send(base)).status, 202)
  assert.equal(inserted[0].duration_ms, 1200)
  assert.equal(inserted[0].device_type, 'mobile')
  for (const durationMs of [0, -1, 900001, 1.5, '1000', null]) {
    assert.equal((await send({ ...base, durationMs })).status, 400)
  }
  assert.equal((await send({ ...base, eventName: 'page_duration', durationMs: 0 })).status, 202)
})
