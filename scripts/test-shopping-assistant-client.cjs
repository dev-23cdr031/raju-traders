const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shopping-assistant-client.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { assistantSettings, assistantRouteAllowed, assistantRequestHeaders, validateAssistantQuote, requestAssistantCartAdd, createAssistantRequestScope, isCurrentOrderRequest, isPersistableAssistantMessage } = loaded.exports
const chatSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shopping-assistant-chat.ts'), 'utf8')
const chatCompiled = ts.transpileModule(chatSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const chatLoaded = { exports: {} }
new Function('module', 'exports', chatCompiled)(chatLoaded, chatLoaded.exports)
const { classifyLocalChat } = chatLoaded.exports

const publicFaqs = [{ id: 1, question: 'What are your delivery charges?', answer: 'See the delivery page for current charges.' }]
const publicCatalog = [
  { id: 1, name: 'California Almonds', type: 'Nuts' },
  { id: 2, name: 'Roasted Cashews', type: 'Nuts' },
]

test('local chat greets in English, Tamil and Tanglish without inventing facts', () => {
  for (const text of ['hello!', 'வணக்கம்', 'vanakkam']) {
    assert.deepEqual(classifyLocalChat(text, [], []), { kind: 'greeting' })
  }
  assert.deepEqual(classifyLocalChat('நன்றி', [], []), { kind: 'thanks' })
})

test('local chat answers only a sufficiently matching published FAQ', () => {
  assert.deepEqual(classifyLocalChat('How much is delivery?', publicFaqs, []), { kind: 'faq', answer: publicFaqs[0].answer })
  assert.deepEqual(classifyLocalChat('டெலிவரி செலவு என்ன?', publicFaqs, []), { kind: 'faq', answer: publicFaqs[0].answer })
  assert.deepEqual(classifyLocalChat('What are your delivery charges?', [], []), { kind: 'unknown' })
  assert.deepEqual(classifyLocalChat('How much is international delivery?', publicFaqs, []), { kind: 'unknown' })
  assert.deepEqual(classifyLocalChat('How much is my delivery?', publicFaqs, []), { kind: 'unknown' })
  assert.deepEqual(classifyLocalChat('How much is delivery?', [...publicFaqs, { ...publicFaqs[0], id: 2 }], []), { kind: 'unknown' })
})

test('local product questions only return identifiers from the live public catalogue', () => {
  for (const text of ['show almonds', 'பாதாம்', 'badam venum']) {
    assert.deepEqual(classifyLocalChat(text, [], publicCatalog), { kind: 'products', productIds: [1] })
  }
  assert.deepEqual(classifyLocalChat('show almonds', [], []), { kind: 'unknown' })
  assert.deepEqual(classifyLocalChat('recommend products', [], publicCatalog), { kind: 'intent', intent: 'recommend' })
  assert.deepEqual(classifyLocalChat('show me offers', [], publicCatalog), { kind: 'intent', intent: 'offers' })
})

test('unknown, policy, health and private questions never fabricate answers or trigger product actions', () => {
  for (const text of ['What is the refund policy?', 'Do almonds cure diabetes?', 'order 12345', 'Where is my order 12345?', 'What is your telephone number?']) {
    assert.deepEqual(classifyLocalChat(text, [], publicCatalog), { kind: 'unknown' })
  }
  assert.deepEqual(classifyLocalChat('my orders', [], publicCatalog), { kind: 'orders' })
  assert.deepEqual(classifyLocalChat('contact us', [], publicCatalog), { kind: 'support' })
  assert.deepEqual(classifyLocalChat('How can I find products?', [], publicCatalog), { kind: 'catalog' })
  assert.deepEqual(classifyLocalChat('How do I compare products?', [], publicCatalog), { kind: 'compare' })
})

test('typed messages, their replies and pending messages are excluded from history', () => {
  const message = { id: '1', role: 'customer', text: 'private order 123' }
  assert.equal(isPersistableAssistantMessage({ ...message, transient: true }), false)
  assert.equal(isPersistableAssistantMessage({ ...message, role: 'assistant', transient: true }), false)
  assert.equal(isPersistableAssistantMessage({ ...message, pending: true }), false)
  assert.equal(isPersistableAssistantMessage({ ...message, text: 'Gift guide' }), true)
})

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
