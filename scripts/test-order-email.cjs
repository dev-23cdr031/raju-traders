const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const filename = path.resolve(__dirname, '..', 'lib', 'order-email.ts')
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUnderTest = { exports: {} }
new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
  (name) => name === 'server-only' ? {} : require(name),
  moduleUnderTest, moduleUnderTest.exports, filename, path.dirname(filename),
)

const order = {
  id: 'order-1', order_number: 'AJR-1', customer_name: 'Customer',
  email: 'customer@example.invalid', address: 'Example',
  items: [{ name: 'Almonds', image: '/almonds.webp', quantity: 1, price: 100 }],
  subtotal: 100, shipping: 0, total: 100,
}

async function render(configured) {
  const saved = { ...process.env }
  const previousFetch = global.fetch
  const previousWarn = console.warn
  let payload
  try {
    process.env.RESEND_API_KEY = 'test'
    delete process.env.NOTIFICATIONS_EMAIL_ENABLED
    delete process.env.APP_URL
    if (configured === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = configured
    console.warn = () => {}
    global.fetch = async (_url, options) => {
      payload = JSON.parse(options.body)
      return Response.json({ id: 'message-1' })
    }
    await moduleUnderTest.exports.sendOrderConfirmationEmail(order)
    return payload
  } finally {
    process.env = saved
    global.fetch = previousFetch
    console.warn = previousWarn
  }
}

test('missing or localhost configuration produces public image and order links', async () => {
  for (const configured of [undefined, 'http://localhost:3000']) {
    const email = await render(configured)
    assert.match(email.html, /src="https:\/\/www\.rajutraders\.in\/ajr-logo\.png"/)
    assert.match(email.html, /src="https:\/\/www\.rajutraders\.in\/almonds\.webp"/)
    assert.match(email.html, /href="https:\/\/www\.rajutraders\.in\/my-orders"/)
    assert.doesNotMatch(email.html, /localhost/)
  }
})

test('a configured HTTPS origin is used for relative images', async () => {
  const email = await render('https://shop.example.invalid')
  assert.match(email.html, /src="https:\/\/shop\.example\.invalid\/almonds\.webp"/)
})

test('insecure public website URLs are rejected', async () => {
  await assert.rejects(render('http://shop.example.invalid'), /public HTTPS URL/)
})
