import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const sans    = Inter({ subsets: ['latin'], variable: '--font-sans' })
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700', '800'] })

export const metadata: Metadata = {
  title: { default: 'GoPortals', template: '%s · GoPortals' },
  description: 'GoPortals — e-commerce & quick-commerce task management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  )
}
