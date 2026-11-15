/**
 * The original shop catalogue used a handful of curated variety photographs
 * before varieties could store their own image. Keep those photographs as a
 * display-only fallback so the shop and the admin workspace show the same
 * catalogue. A saved variety image always wins.
 */
const LEGACY_VARIETY_IMAGES: Record<string, Record<string, string>> = {
  Almonds: {
    'Blanched Almonds': '/blanched-almonds.jpg',
    'Roasted Almonds': '/roasted-almonds.jpg',
  },
  Cashews: {
    'Cashew W240': '/cashew-w240.jpeg',
    'Cashew W320': '/cashew-w320.webp',
    'Cashew Jumbo Splits': '/cashew-jumbo-splits.webp',
    'Cashew Splits': '/cashew-splits.jpg',
    'Roasted Cashews': '/roasted-cashews.jpg',
    'Chilli Cashews': '/roasted-cashews.jpg',
    'Pepper Cashews': '/pepper-cashews.webp',
    'Salted Cashews': '/salted-cashews.webp',
    'BBQ Cashews': '/bbq-cashews.png',
    'Chilli Garlic Cashews': '/chilli-garlic-cashews.jpeg',
    'Cheese Cashews': '/cheese-cashews.jpg',
    'Tangy Tomato Cashews': '/tangy-tomato-cashews.jpg',
    'Mint Cashews': '/mint-cashews.jpg',
    'Peri Peri Cashews': '/peri-peri-cashews.jpg',
  },
  Pistachios: { 'Salted Pistachios': '/salted-pistachios.jpg' },
  Walnuts: { 'Kashmiri Walnut': '/kashmiri-walnut.jpg' },
  Figs: { 'Figs Bold': '/figs-bold.webp' },
  Raisins: { 'Black Raisins': '/black-raisins.jpg' },
  Dates: {
    'Deseeded Wet Dates': '/deseeded-wet-dates.webp',
    'Mebroom Dates': '/mebroom-dates.jpg',
    'Medjool Dates': '/medjool-dates.jpg',
  },
}

export type VarietyImageCandidate = {
  name?: string
  image?: string
}

export function legacyVarietyImage(productName?: string, varietyName?: string): string | undefined {
  return LEGACY_VARIETY_IMAGES[String(productName || '').trim()]?.[String(varietyName || '').trim()]
}

/** Resolve the image to display without changing the variety payload to save. */
export function resolveVarietyImage(
  productName?: string,
  productImage?: string,
  variety?: VarietyImageCandidate,
): string | undefined {
  const savedImage = String(variety?.image || '').trim()
  if (savedImage) return savedImage

  return legacyVarietyImage(productName, variety?.name) || String(productImage || '').trim() || undefined
}
