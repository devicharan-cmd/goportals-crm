import type { MetadataRoute } from 'next'

/** This is a private staff CRM and client portal, not a public search site. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
