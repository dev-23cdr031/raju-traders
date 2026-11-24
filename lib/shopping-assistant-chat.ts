type Faq = { id: string | number; question: string; answer: string }
type CatalogProduct = { id: number; name: string; type: string }

export type LocalChatResult =
  | { kind: 'greeting' | 'thanks' | 'orders' | 'support' | 'catalog' | 'compare' | 'unknown' }
  | { kind: 'faq'; answer: string }
  | { kind: 'products'; productIds: number[] }
  | { kind: 'intent'; intent: 'recommend' | 'gift' | 'offers' }

const aliases: Record<string, string> = {
  shipping: 'delivery', ship: 'delivery', delivered: 'delivery', deliver: 'delivery',
  delivery: 'delivery', டெலிவரி: 'delivery', செலவு: 'cost', கட்டணம்: 'cost',
  charge: 'cost', charges: 'cost', price: 'cost',
  prices: 'cost', cost: 'cost', much: 'cost', rate: 'cost',
  badam: 'almond', almonds: 'almond', பாதாம்: 'almond',
  cashews: 'cashew', mundhiri: 'cashew', முந்திரி: 'cashew',
  dates: 'date', pericham: 'date', பேரீச்சம்: 'date', பேரிச்சம்பழம்: 'date',
  walnuts: 'walnut', akhrot: 'walnut', pistachios: 'pistachio', pista: 'pistachio',
  return: 'returns', refund: 'refund', வணக்கம்: 'vanakkam',
}
const stopWords = new Set([
  'a', 'an', 'the', 'is', 'are', 'do', 'does', 'you', 'your', 'i', 'me', 'my',
  'we', 'our', 'what', 'how', 'can', 'could', 'would', 'please', 'tell', 'about', 'some',
  'for', 'of', 'to', 'in', 'on', 'and', 'or', 'have', 'has', 'any', 'there',
  'ajr', 'unga', 'ungal', 'irukku', 'irukka', 'enna', 'என்ன', 'enakku', 'pannunga',
])
const genericProductWords = new Set([
  'product', 'products', 'item', 'items', 'buy', 'shop', 'shopping', 'online',
  'cost', 'delivery', 'policy', 'returns', 'refund', 'order', 'orders', 'gift',
])
const productQueryWords = new Set([
  ...genericProductWords, 'show', 'find', 'want', 'need', 'available', 'availability',
  'looking', 'look', 'search', 'list', 'get', 'sell', 'selling', 'stock', 'in',
  'venum', 'iruka', 'irukka', 'கிடைக்குமா', 'இருக்கா', 'வேண்டும்',
])

function normalized(text: string): string {
  return text.toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function tokens(text: string): string[] {
  return normalized(text).split(' ').filter(Boolean).map((word) => aliases[word] || word)
}

function keywords(text: string): string[] {
  return [...new Set(tokens(text).filter((word) => !stopWords.has(word)))]
}

export function classifyLocalChat(text: string, faqs: Faq[], catalog: CatalogProduct[]): LocalChatResult {
  const clean = normalized(text)
  if (!clean) return { kind: 'unknown' }
  if (/^(hi|hello|hey|good morning|good evening|vanakkam|வணக்கம்|namaste|hi how are you|hello how are you|vanakkam eppadi irukinga|வணக்கம் எப்படி இருக்கீங்க)$/.test(clean)) {
    return { kind: 'greeting' }
  }
  if (/^(thanks|thank you|thank you so much|nandri|நன்றி)$/.test(clean)) return { kind: 'thanks' }

  const queryWords = keywords(text)
  const matches = faqs.filter((faq) => {
    if (normalized(faq.question) === clean) return true
    const faqWords = keywords(faq.question)
    return !tokens(text).some((word) => word === 'my' || word === 'என்' || /^\d+$/.test(word)) &&
      queryWords.length >= 2 && queryWords.length === faqWords.length &&
      queryWords.every((word) => faqWords.includes(word))
  })
  if (matches.length === 1) return { kind: 'faq', answer: matches[0].answer }
  if (matches.length > 1) return { kind: 'unknown' }

  if (/^(my orders?|where is my order|how (do|can) i (track|see|view) my orders?|track my order|order status|என் ஆர்டர்|என் ஆர்டர்கள்|en order|en orders)$/.test(clean)) return { kind: 'orders' }
  if (/^(contact|contact us|how (do|can) i contact (you|ajr)|support|human|talk to (a )?(human|person|ajr)|help from (a )?person|தொடர்பு|உதவி|team kitta pesu)$/.test(clean)) return { kind: 'support' }
  if (/^(how (do|can) i (find|search for|browse) products|what (products do you|do you) sell|browse products|catalog|catalogue|products|தயாரிப்புகள்|products eppadi search pannuradhu)$/.test(clean)) return { kind: 'catalog' }
  if (/^(how (do|can) i compare products|compare products|products compare eppadi|தயாரிப்புகளை ஒப்பிடு)$/.test(clean)) return { kind: 'compare' }

  const directIntents: Array<[RegExp, 'recommend' | 'gift' | 'offers']> = [
    [/^(recommend|recommendations|recommend products|recommend something|can you recommend products|suggest (some )?products|suggest something|find my match|products suggest pannunga|எனக்கான தேர்வு)$/, 'recommend'],
    [/^(gift|gifts|gift guide|gift ideas|gift suggestions|i need a gift|suggest me a gift|gift ideas sollunga|பரிசு|பரிசு வழிகாட்டி)$/, 'gift'],
    [/^(offers|offer|show (me )?offers|any offers|what offers do you have|current offers|offers irukka|சலுகைகள்|சலுகை)$/, 'offers'],
  ]
  for (const [pattern, intent] of directIntents) if (pattern.test(clean)) return { kind: 'intent', intent }

  // Policy and account questions must not be answered with unrelated product matches.
  if (queryWords.some((word) => ['delivery', 'returns', 'refund', 'policy', 'order', 'orders', 'address', 'payment', 'shipping'].includes(word))) {
    return { kind: 'unknown' }
  }
  const productWords = queryWords.filter((word) => word.length >= 3 && !genericProductWords.has(word) && !/^\d+$/.test(word))
  const knownProductWords = new Set(catalog.flatMap((product) => tokens(`${product.name} ${product.type}`)))
  if (queryWords.some((word) => !knownProductWords.has(word) && !productQueryWords.has(word))) return { kind: 'unknown' }
  const productIds = catalog.filter((product) => {
    const publicWords = tokens(`${product.name} ${product.type}`)
    return productWords.some((word) => publicWords.includes(word))
  }).map((product) => product.id).slice(0, 8)
  return productIds.length ? { kind: 'products', productIds } : { kind: 'unknown' }
}
