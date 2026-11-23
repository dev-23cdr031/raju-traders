const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadNotifications(email) {
  const filename = path.resolve(__dirname, '..', 'lib', 'notification-automation.ts')
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const dependencies = {
    'server-only': {},
    '@/lib/order-email': email,
    '@/lib/order-whatsapp': { WhatsAppProviderRejectedError: class extends Error {} },
  }
  const resolve = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
    resolve, module, module.exports, filename, path.dirname(filename),
  )
  return module.exports
}

const order = { id: 'order-1', email: 'customer@example.invalid', payment_method: 'COD' }

test('missing notification migration is reported without sending untracked emails', async () => {
  let sends = 0
  const errors = []
  const previous = console.error
  console.error = (message) => errors.push(message)
  try {
    const notifications = loadNotifications({
      OrderEmailRejectedError: class extends Error {},
      sendOrderConfirmationEmail: async () => { sends++; return { id: 'message-1' } },
    })
    const admin = { rpc: async () => ({ error: { code: 'PGRST202' } }) }
    const result = await notifications.dispatchOrderNotifications(admin, order)
    assert.equal(result.queued, false)
    assert.equal(sends, 0)
    assert.match(errors.join(' '), /PGRST202/)
  } finally {
    console.error = previous
  }
})

test('provider rejection is recorded and reported without logging provider details', async () => {
  class Rejected extends Error {}
  const errors = []
  const records = []
  const previous = console.error
  console.error = (message) => errors.push(message)
  try {
    const notifications = loadNotifications({
      OrderEmailRejectedError: Rejected,
      sendOrderConfirmationEmail: async () => { throw new Rejected('private provider details') },
    })
    const admin = {
      rpc: async () => ({ data: { id: 'event-1', status: 'sending' }, error: null }),
      from: () => ({ update: (values) => ({ eq: async () => { records.push(values); return { error: null } } }) }),
    }
    await notifications.dispatchOrderNotifications(admin, order)
    assert.equal(records[0].status, 'failed')
    assert.match(errors.join(' '), /notification failed/)
    assert.doesNotMatch(errors.join(' '), /private provider details/)
  } finally {
    console.error = previous
  }
})
