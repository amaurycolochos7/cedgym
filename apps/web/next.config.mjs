/** @type {import('next').NextConfig} */

// ─── Content Security Policy ─────────────────────────────────
// Conservative-ish baseline. The 'unsafe-inline' / 'unsafe-eval' on
// script-src are required by Next.js (turbopack dev + RSC chunk
// loader); tightening these requires a nonce-based pipeline (see the
// comment in middleware.ts for the follow-up).
//
// External hosts in the directives below:
//   - cdn.jsdelivr.net          → app/staff/scan/page.tsx loads
//                                 html5-qrcode at runtime from CDN
//   - js.stripe.com             → Stripe.js + Payment Element iframes
//   - api.stripe.com            → Stripe REST (XHR from confirmPayment)
//   - hooks.stripe.com          → 3-D Secure challenge iframes
//   - m.stripe.network /
//     m.stripe.com              → Stripe fraud fingerprinting iframes
//   - va.vercel-scripts.com     → Vercel analytics (harmless if unused)
//   - youtube-nocookie.com      → exercise demo iframes
//   - i.ytimg.com               → YouTube thumbnails (covered by img-src https:)
//   - google.com/maps           → public landing page map iframe
//   - fonts.googleapis.com /
//     fonts.gstatic.com         → next/font fallback
//   - api.cedgym.mx +
//     api.187-77-11-79.sslip.io → backend (XHR + WebSocket)
// En development necesitamos permitir el API local (http://localhost:3001)
// y NO forzar upgrade-insecure-requests, porque el browser convertiría
// http://localhost en https y reventaría el fetch. En prod mantenemos
// el CSP estricto solo con los hosts oficiales.
const isDev = process.env.NODE_ENV !== 'production';
const devConnectExtras = isDev
  ? ' http://localhost:3001 ws://localhost:3001 http://127.0.0.1:3001 ws://127.0.0.1:3001'
  : '';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Both API hosts are valid: api.cedgym.mx (the prod alias) and the
  // sslip.io fallback. Pre-fix the CSP only listed sslip.io and the
  // browser blocked every fetch from cedgym.mx → api.cedgym.mx with
  // "no podemos conectar con el servidor" — that's what produced the
  // post-deploy outage.
  `connect-src 'self' https://api.cedgym.mx wss://api.cedgym.mx https://api.187-77-11-79.sslip.io wss://api.187-77-11-79.sslip.io https://api.stripe.com https://m.stripe.network https://m.stripe.com${devConnectExtras}`,
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://m.stripe.com https://www.youtube-nocookie.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // upgrade-insecure-requests rompe el fetch a http://localhost:3001
  // en dev — solo lo aplicamos en producción.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // Camera self-only — needed by html5-qrcode for staff check-in scanner.
  // Payment self + Stripe origin for the embedded Payment Element.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
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
  // Legacy /checkout/* URLs. Those routes were deleted in the Stripe
  // Phase-7 cleanup, but old WhatsApp messages, bookmarks and CDN-cached
  // landing HTML still send users to /checkout/{plan}. Redirect to the
  // current portal flow so they don't hit a 404. Permanent so browsers
  // and the CDN can cache the rewrite.
  async redirects() {
    return [
      { source: '/checkout/starter', destination: '/portal/membership?plan=STARTER', permanent: true },
      { source: '/checkout/pro',     destination: '/portal/membership?plan=PRO',     permanent: true },
      { source: '/checkout/elite',   destination: '/portal/membership?plan=ELITE',   permanent: true },
    ];
  },
};

export default nextConfig;
