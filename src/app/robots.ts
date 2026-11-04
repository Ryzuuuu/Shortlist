import type { MetadataRoute } from 'next'

/** A private application holding personal data: ask crawlers to stay out entirely. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
