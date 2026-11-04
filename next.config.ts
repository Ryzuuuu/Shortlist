import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
  // Baseline hardening. A strict CSP is left out on purpose: Next's inline
  // bootstrap scripts need per-request nonces, which is a separate piece of work.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
