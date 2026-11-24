const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shopping-assistant-client.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { assistantSettings, assistantRouteAllowed, assistantRequestHeaders, validateAssistantQuote, requestAssistantCartAdd, createAssistantRequestScope, isCurrentOrderRequest } = loaded.exports

test('settings fail closed and retain the configured welcome as text', () => {
  assert.deepEqual(assistantSettings(null), { enabled: false, welcome: '' })
  assert.equal(assistantSettings({ enabled: false, welcome_message: 'Welcome' }).enabled, false)
  assert.equal(assistantSettings({ enabled: 'true' }).enabled, false)
  assert.deepEqual(assistantSettings({ enabled: true, welcome_message: ' <b>Hello</b> ' }), { enabled: true, welcome: '<b>Hello</b>' })
})

test('customer routes allowed but admin, cart, checkout and API excluded', () => {
  for (const route of ['/', '/login', '/signup', '/forgot-password']) assert.equal(assistantRouteAllowed(route), true)
  for (const route of ['/admin', '/admin/products', '/cart/recover', '/checkout', '/api/ai-assistant']) assert.equal(assistantRouteAllowed(route), false)
})

test('bearer is sent only to the same-origin server when present', () => {
  assert.deepEqual(assistantRequestHeaders(''), { 'Content-Type': 'application/json' })
  assert.deepEqual(assistantRequestHeaders('token'), { 'Content-Type': 'application/json', Authorization: 'Bearer token' })
})

test('cart quote requires fresh stock, the exact pack and available variety, and matching recalculated price', () => {
  const quote = { productId: 7, pack: '250 g', variety: 'Roasted', price: 250 }
  const row = { id: 7, active: true, stock: 3, status: 'In stock' }
  const product = { varieties: [{ name: 'Roasted' }, { name: 'Raw' }] }
  const helpers = {
    packs: () => ['250 g', '500 g'],
    varieties: () => [{ name: 'Roasted' }],
    price: (_product, pack, variety) => pack === '250 g' && variety === 'Roasted' ? 250 : 500,
  }
  const validate = (change = {}) => validateAssistantQuote(change.quote || quote, change.row === undefined ? row : change.row, change.product || product, change.helpers || helpers)
  assert.deepEqual(validate(), { ok: true })
  assert.equal(validate({ row: null }).ok, false)
  assert.equal(validate({ row: { ...row, active: false } }).ok, false)
  assert.equal(validate({ row: { ...row, stock: 0 } }).ok, false)
  assert.equal(validate({ row: { ...row, status: 'Out of stock' } }).ok, false)
  assert.equal(validate({ quote: { ...quote, pack: '1 kg' } }).ok, false)
  assert.equal(validate({ quote: { ...quote, variety: 'Raw' } }).ok, false)
  assert.equal(validate({ quote: { ...quote, price: 249 } }).ok, false)
  assert.equal(validate({ product: { varieties: [] } }).ok, false)
})

test('cart acknowledgement resolves success or error; absent or late handlers never claim success', async () => {
  const quote = { productId: 1, pack: '250 g', variety: '', price: 100 }
  const target = new EventTarget()
  target.addEventListener('ajr-assistant-add-to-cart', (event) => {
    assert.equal(event.detail.isPending(), true)
    event.detail.respond({ ok: true })
  }, { once: true })
  assert.deepEqual(await requestAssistantCartAdd(target, quote, 20), { ok: true })
  target.addEventListener('ajr-assistant-add-to-cart', (event) => {
    event.detail.respond({ ok: false, message: 'Price changed.' })
  }, { once: true })
  assert.deepEqual(await requestAssistantCartAdd(target, quote, 20), { ok: false, message: 'Price changed.' })
  let late
  target.addEventListener('ajr-assistant-add-to-cart', (event) => { late = event.detail }, { once: true })
  assert.equal((await requestAssistantCartAdd(target, quote, 5)).ok, false)
  assert.equal(late.isPending(), false)
  late.respond({ ok: true })
})

test('pending orders are rejected after sign-out, account switch, and switching back', async () => {
  const scope = createAssistantRequestScope()
  let token = 'user-a'
  let finish
  const pending = new Promise((resolve) => { finish = resolve })
  const request = scope.begin()
  const result = pending.then((orders) =>
    isCurrentOrderRequest(scope, request, 'user-a', () => token) ? orders : null)
  token = ''
  scope.invalidate()
  token = 'user-b'
  scope.invalidate()
  token = 'user-a'
  scope.invalidate()
  finish([{ order_number: 'private' }])
  assert.equal(await result, null)
  const next = scope.begin()
  assert.equal(isCurrentOrderRequest(scope, next, 'user-a', () => token), true)
  token = 'user-b'
  assert.equal(isCurrentOrderRequest(scope, next, 'user-a', () => token), false)
  assert.equal(isCurrentOrderRequest(scope, next, '', () => ''), false)
})

test('late conversation responses cannot apply after conversation changes or a newer request', async () => {
  const scope = createAssistantRequestScope()
  let finish
  const old = scope.begin()
  const pending = new Promise((resolve) => { finish = resolve })
  let visible = 'new conversation'
  const result = pending.then((answer) => { if (scope.isCurrent(old)) visible = answer })
  scope.invalidate()
  const current = scope.begin()
  finish('old response')
  await result
  assert.equal(visible, 'new conversation')
  assert.equal(scope.isCurrent(current), true)
  assert.equal(scope.isCurrent(old), false)
})
