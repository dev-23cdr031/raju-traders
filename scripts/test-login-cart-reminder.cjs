const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cart-reminder-login.ts'), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', output)(moduleUnderTest, moduleUnderTest.exports)
const { clearPendingCartReminder, setPendingCartReminder, takePendingCartReminder, saveLoginCartReminderChoice } = moduleUnderTest.exports

const values = new Map()
global.window = { sessionStorage: {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
} }

test('only an explicit checked choice sends an authenticated opt-in request', async () => {
  const originalFetch = global.fetch
  const requests = []
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    return Response.json({ state: 'opted_in' })
  }
  try {
    await saveLoginCartReminderChoice('verified-token', false)
    assert.equal(requests.length, 0)
    await assert.rejects(() => saveLoginCartReminderChoice('', true), /could not be saved/)
    await saveLoginCartReminderChoice('verified-token', true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].options.headers.Authorization, 'Bearer verified-token')
    assert.deepEqual(JSON.parse(requests[0].options.body), { optedIn: true })
    global.fetch = async () => Response.json({ message: 'Email delivery is suppressed. Please contact support.' }, { status: 403 })
    await assert.rejects(() => saveLoginCartReminderChoice('verified-token', true), /suppressed/)
  } finally {
    global.fetch = originalFetch
  }
})

test('Google and OTP choices are short-lived, single-use and bound to the correct flow', () => {
  clearPendingCartReminder()
  setPendingCartReminder('google')
  assert.equal(takePendingCartReminder('google'), true)
  assert.equal(takePendingCartReminder('google'), false)
  setPendingCartReminder('otp', 'first@example.invalid')
  assert.equal(takePendingCartReminder('otp', 'second@example.invalid'), false)
  setPendingCartReminder('otp', 'first@example.invalid')
  assert.equal(takePendingCartReminder('otp', 'first@example.invalid'), true)
  setPendingCartReminder('google')
  const key = [...values.keys()][0]
  values.set(key, JSON.stringify({ method: 'google', createdAt: Date.now() - 16 * 60_000 }))
  assert.equal(takePendingCartReminder('google'), false)
  values.set(key, 'null')
  assert.equal(takePendingCartReminder('google'), false)
})
