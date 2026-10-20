import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { LanguageProvider } from '@/components/LanguageProvider'
import RibbonCutIntro from '@/components/RibbonCutIntro'
import './globals.css'

export const metadata: Metadata = {
  title: 'AJR Essence of Nature | Premium Dry Fruits & Nuts',
  description: 'Premium dry fruits and nuts for everyday nourishment, gifting and sharing. Discover AJR Essence of Nature.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f4ed',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="bg-background"><body className="antialiased"><LanguageProvider><RibbonCutIntro />{children}{process.env.NODE_ENV === 'production' && <Analytics />}</LanguageProvider></body></html>
}
