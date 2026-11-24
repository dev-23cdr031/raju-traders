export type AssistantCartQuote = {
  productId: number
  pack: string
  variety: string
  price: number
}

export type AssistantCartResult = { ok: true } | { ok: false; message: string }

export function assistantSettings(data: unknown): { enabled: boolean; welcome: string } {
  if (!data || typeof data !== 'object') return { enabled: false, welcome: '' }
  const settings = data as Record<string, unknown>
  return {
    enabled: settings.enabled === true,
    welcome: typeof settings.welcome_message === 'string' ? settings.welcome_message.trim().slice(0, 1000) : '',
  }
}

export function assistantRouteAllowed(pathname: string): boolean {
  return !/^\/(?:admin|api|cart|checkout)(?:\/|$)/.test(pathname)
}

export function assistantRequestHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function createAssistantRequestScope() {
  let generation = 0
  return {
    begin: () => ++generation,
    invalidate: () => { generation += 1 },
    isCurrent: (request: number) => request === generation,
  }
}

export function isCurrentOrderRequest(
  scope: ReturnType<typeof createAssistantRequestScope>,
  request: number,
  token: string,
  readToken: () => string,
): boolean {
  return Boolean(token) && scope.isCurrent(request) && readToken() === token
}

export function validateAssistantQuote<P extends { varieties?: Array<{ name: string }> }>(
  quote: AssistantCartQuote,
  row: { id?: unknown; active?: unknown; stock?: unknown; status?: unknown } | undefined,
  product: P | undefined,
  helpers: {
    packs: (product: P) => readonly string[]
    varieties: (product: P) => Array<{ name: string }>
    price: (product: P, pack: string, variety: string) => number
  },
): AssistantCartResult {
  const fail: AssistantCartResult = { ok: false, message: 'This selection or price has changed. Please view the product and try again.' }
  if (!row || !product || !Number.isSafeInteger(quote.productId) || Number(row.id) !== quote.productId ||
      row.active !== true || row.stock == null || !Number.isFinite(Number(row.stock)) || Number(row.stock) <= 0 ||
      String(row.status || '').toLowerCase() === 'out of stock' ||
      !Number.isFinite(quote.price) || quote.price < 0 ||
      !helpers.packs(product).includes(quote.pack)) return fail
  const variants = helpers.varieties(product)
  if (product.varieties?.length ? !variants.some((item) => item.name === quote.variety) : quote.variety !== '') return fail
  const currentPrice = helpers.price(product, quote.pack, quote.variety)
  if (!Number.isFinite(currentPrice) || Math.abs(currentPrice - quote.price) > 0.001) return fail
  return { ok: true }
}

export function requestAssistantCartAdd(
  target: EventTarget,
  quote: AssistantCartQuote,
  timeoutMs = 12000,
): Promise<AssistantCartResult> {
  return new Promise((resolve) => {
    let finished = false
    const timer = setTimeout(() => finish({ ok: false, message: 'Could not verify the cart. Please view the product and try again.' }), timeoutMs)
    const finish = (result: AssistantCartResult) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(result)
    }
    target.dispatchEvent(new CustomEvent('ajr-assistant-add-to-cart', {
      detail: { ...quote, respond: finish, isPending: () => !finished },
    }))
  })
}
