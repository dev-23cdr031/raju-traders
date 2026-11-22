export type WebsiteNavigationItem = {
  label: string
  href: string
  visible: boolean
  sort_order: number
}

export type WebsiteContent = {
  announcement: {
    enabled: boolean
    text: string
    href: string
    color: string
  }
  home: {
    heroEyebrow: string
    heroTitle: string
    heroAccent: string
    heroDescription: string
    heroPrimaryLabel: string
    heroSecondaryLabel: string
    introEyebrow: string
    introTitle: string
    introDescription: string
  }
  about: {
    heading: string
    description: string
    story: string
    mission: string
    vision: string
    quality: string
    customerPromise: string
  }
  footer: {
    description: string
    email: string
    phone: string
    whatsapp: string
    address: string
    instagram: string
    facebook: string
    businessHours: string
  }
  navigation: WebsiteNavigationItem[]
}

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  announcement: {
    enabled: true,
    text: 'Fresh Harvest Batch Arrived Today',
    href: '',
    color: 'green',
  },
  home: {
    heroEyebrow: 'Harvest · 100% Organic',
    heroTitle: 'Goodness',
    heroAccent: 'worth sharing.',
    heroDescription: 'Handpicked California almonds, jumbo golden cashews, Medjool dates and Kashmiri walnuts — curated for daily wellness and royal gifting.',
    heroPrimaryLabel: 'Explore Collection',
    heroSecondaryLabel: 'Our Farm Story',
    introEyebrow: 'The AJR Philosophy',
    introTitle: 'Good food is always worth sharing.',
    introDescription: 'We source generous, delicious dry fruits and nuts that bring authentic nourishment to your daily routine. Every handful starts with careful selection at peak harvest, honest ingredients, and zero artificial processing.',
  },
  about: {
    heading: 'Our Heritage & Sourcing Philosophy',
    description: 'We are on a mission to redefine everyday snacking — bringing unbleached, single-origin dry fruits and nuts straight from accredited family orchards to your home.',
    story: 'AJR began at a family table in Virudhunagar, Tamil Nadu. We noticed that most store-bought dry fruits were dry, over-bleached with sulfur, or sat in open warehouses for over a year before reaching customers.\n\nWe set out to change that by establishing direct fair-trade relationships with orchards in Kashmir, California, Mangalore, and Kerman. By packing in small weekly batches with zero chemical glazes, we preserve the natural essential oils and authentic crunch that nature intended.',
    mission: '',
    vision: '',
    quality: '',
    customerPromise: '',
  },
  footer: {
    description: 'Pure dry fruits, nuts, and handcrafted hampers made for everyday living.',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    instagram: '',
    facebook: '',
    businessHours: '',
  },
  navigation: [
    { label: 'Home', href: '/', visible: true, sort_order: 0 },
    { label: 'About us', href: '/about', visible: true, sort_order: 1 },
    { label: 'Shop', href: '/shop', visible: true, sort_order: 2 },
    { label: 'Contact', href: '/contact', visible: true, sort_order: 3 },
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(source: Record<string, unknown>, key: string, fallback: string) {
  return typeof source[key] === 'string' ? String(source[key]).slice(0, 4_000) : fallback
}

function httpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function whatsappUrl(value: string) {
  const secureUrl = httpsUrl(value)
  if (secureUrl) return secureUrl
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : ''
}

export function mergeWebsiteContent(value: unknown): WebsiteContent {
  const source = isRecord(value) ? value : {}
  const announcement = isRecord(source.announcement) ? source.announcement : {}
  const home = isRecord(source.home) ? source.home : {}
  const about = isRecord(source.about) ? source.about : {}
  const footer = isRecord(source.footer) ? source.footer : {}
  const merged: WebsiteContent = {
    announcement: {
      enabled: announcement.enabled !== false,
      text: stringValue(announcement, 'text', DEFAULT_WEBSITE_CONTENT.announcement.text),
      href: stringValue(announcement, 'href', DEFAULT_WEBSITE_CONTENT.announcement.href),
      color: typeof announcement.color === 'string' && /^#[0-9a-f]{6}$/i.test(announcement.color)
        ? announcement.color
        : announcement.color === 'cream' || announcement.color === 'olive' ? announcement.color : 'green',
    },
    home: {
      heroEyebrow: stringValue(home, 'heroEyebrow', DEFAULT_WEBSITE_CONTENT.home.heroEyebrow),
      heroTitle: stringValue(home, 'heroTitle', DEFAULT_WEBSITE_CONTENT.home.heroTitle),
      heroAccent: stringValue(home, 'heroAccent', DEFAULT_WEBSITE_CONTENT.home.heroAccent),
      heroDescription: stringValue(home, 'heroDescription', DEFAULT_WEBSITE_CONTENT.home.heroDescription),
      heroPrimaryLabel: stringValue(home, 'heroPrimaryLabel', DEFAULT_WEBSITE_CONTENT.home.heroPrimaryLabel),
      heroSecondaryLabel: stringValue(home, 'heroSecondaryLabel', DEFAULT_WEBSITE_CONTENT.home.heroSecondaryLabel),
      introEyebrow: stringValue(home, 'introEyebrow', DEFAULT_WEBSITE_CONTENT.home.introEyebrow),
      introTitle: stringValue(home, 'introTitle', DEFAULT_WEBSITE_CONTENT.home.introTitle),
      introDescription: stringValue(home, 'introDescription', DEFAULT_WEBSITE_CONTENT.home.introDescription),
    },
    about: {
      heading: stringValue(about, 'heading', DEFAULT_WEBSITE_CONTENT.about.heading),
      description: stringValue(about, 'description', DEFAULT_WEBSITE_CONTENT.about.description),
      story: stringValue(about, 'story', DEFAULT_WEBSITE_CONTENT.about.story),
      mission: stringValue(about, 'mission', DEFAULT_WEBSITE_CONTENT.about.mission),
      vision: stringValue(about, 'vision', DEFAULT_WEBSITE_CONTENT.about.vision),
      quality: stringValue(about, 'quality', DEFAULT_WEBSITE_CONTENT.about.quality),
      customerPromise: stringValue(about, 'customerPromise', DEFAULT_WEBSITE_CONTENT.about.customerPromise),
    },
    footer: {
      description: stringValue(footer, 'description', DEFAULT_WEBSITE_CONTENT.footer.description),
      email: stringValue(footer, 'email', DEFAULT_WEBSITE_CONTENT.footer.email),
      phone: stringValue(footer, 'phone', DEFAULT_WEBSITE_CONTENT.footer.phone),
      whatsapp: whatsappUrl(stringValue(footer, 'whatsapp', DEFAULT_WEBSITE_CONTENT.footer.whatsapp)),
      address: stringValue(footer, 'address', DEFAULT_WEBSITE_CONTENT.footer.address),
      instagram: httpsUrl(stringValue(footer, 'instagram', DEFAULT_WEBSITE_CONTENT.footer.instagram)),
      facebook: httpsUrl(stringValue(footer, 'facebook', DEFAULT_WEBSITE_CONTENT.footer.facebook)),
      businessHours: stringValue(footer, 'businessHours', DEFAULT_WEBSITE_CONTENT.footer.businessHours),
    },
    navigation: Array.isArray(source.navigation)
      ? source.navigation
        .filter(isRecord)
        .map((item, index) => ({
          label: String(item.label || '').slice(0, 60),
          href: String(item.href || '/').slice(0, 300),
          visible: item.visible !== false,
          sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
        }))
        .filter((item) => item.label)
        .sort((a, b) => a.sort_order - b.sort_order)
      : DEFAULT_WEBSITE_CONTENT.navigation.map((item) => ({ ...item })),
  }
  return merged
}
