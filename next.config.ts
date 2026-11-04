import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

/**
 * Content-Security-Policy. Everything the app loads is its own (fonts are
 * self-hosted by next/font, API calls are same-origin), so third-party sources are
 * simply not allowed. 'unsafe-inline' stays for scripts because Next's bootstrap
 * scripts are inline and a nonce-based policy would force every page to render
 * dynamically, which conflicts with Cache Components. Even so, this policy blocks
 * external scripts, framing, plugins, <base> hijacking and cross-origin form posts.
 * Production only: dev needs eval and websockets for hot reload.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Private application: keep it out of search engines.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  ...(isProd ? [{ key: 'Content-Security-Policy', value: csp }] : []),
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  // CV parsing (pdf-parse -> pdf.js) needs @napi-rs/canvas's native DOMMatrix. Left bundled,
  // the native binary is not packaged into the serverless function ("Cannot polyfill
  // DOMMatrix" -> every PDF fails on Vercel), so keep them external and trace them in.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/upload': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/pdf-parse/**/*',
    ],
    '/api/upload/retry': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/pdf-parse/**/*',
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: baseHeaders },
      // Pages and APIs that carry personal data must never sit in a shared cache.
      {
        source: '/(recruiter|portal|delivery|api)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ]
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
