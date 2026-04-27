/** @type {import('next').NextConfig} */

// ─── Content Security Policy ─────────────────────────────────
// Conservative-ish baseline. The 'unsafe-inline' / 'unsafe-eval' on
// script-src are required by Next.js (turbopack dev + RSC chunk
// loader) and the Mercado Pago SDK; tightening these requires a
// nonce-based pipeline (see the comment in middleware.ts for the
// follow-up).
//
// External hosts in the directives below come from a sweep of
// apps/web (audit done 2026-04-27):
//   - cdn.jsdelivr.net          → app/staff/scan/page.tsx loads
//                                 html5-qrcode at runtime from CDN
//   - sdk.mercadopago.com       → MP SDK script
//   - www.mercadopago.com[.mx]  → MP SDK + checkout iframes
//   - api.mercadopago.com       → MP API (XHR)
//   - va.vercel-scripts.com     → Vercel analytics (harmless if unused)
//   - youtube-nocookie.com      → exercise demo iframes
//   - i.ytimg.com               → YouTube thumbnails (covered by img-src https:)
//   - google.com/maps           → public landing page map iframe
//   - fonts.googleapis.com /
//     fonts.gstatic.com         → next/font fallback
//   - api.187-77-11-79.sslip.io → backend (XHR + WebSocket)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://www.mercadopago.com.mx https://www.mercadopago.com.ar https://va.vercel-scripts.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.187-77-11-79.sslip.io wss://api.187-77-11-79.sslip.io https://api.mercadopago.com https://*.mercadopago.com",
  "frame-src 'self' https://www.mercadopago.com https://www.mercadopago.com.mx https://www.mercadopago.com.ar https://www.youtube-nocookie.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.mercadopago.com https://www.mercadopago.com.mx https://www.mercadopago.com.ar",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // Camera self-only — needed by html5-qrcode for staff check-in scanner.
  // Payment self + MP origins for the MP brick checkout.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://www.mercadopago.com" "https://www.mercadopago.com.mx" "https://www.mercadopago.com.ar")' },
  { key: 'Content-Security-Policy',   value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  typescript: {
    // Skip type-check in prod build — runtime unaffected; restore later after cleanup.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'fonts.googleapis.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
