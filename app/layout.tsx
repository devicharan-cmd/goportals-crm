import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'
import 'leaflet/dist/leaflet.css'

const sans = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'GoPortals', template: '%s · GoPortals' },
  description: 'GoPortals — e-commerce & quick-commerce task management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {children}
        <Toaster
          position="top-right"
          containerStyle={{ top: 12, right: 12 }}
          gutter={10}
          toastOptions={{
            duration: 4000,
            style: {
              width: 'auto',
              minWidth: 280,
              maxWidth: 320,
              minHeight: 48,
              borderRadius: 10,
              border: '1px solid #dbe7ed',
              background: '#ffffff',
              color: '#0f172a',
              padding: '10px 12px',
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.35,
              boxShadow: '0 8px 24px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.08)',
            },
            success: {
              style: {
                borderLeft: '4px solid #95C12C',
                background: '#fbfdf7',
              },
              iconTheme: { primary: '#789c20', secondary: '#ffffff' },
            },
            error: {
              style: {
                borderLeft: '4px solid #dc2626',
                background: '#fffafa',
              },
              iconTheme: { primary: '#dc2626', secondary: '#fef2f2' },
            },
          }}
        />
      </body>
    </html>
  )
}
