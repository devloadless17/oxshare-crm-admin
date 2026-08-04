import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Security headers — PLATFORM-CONVENTIONS R-7.5.
 *
 * `helmet()` protects the API, whose responses are JSON. This app is the one that
 * renders HTML, holds the admin session cookie and displays client PII and KYC
 * documents, and it shipped with no CSP and no clickjacking protection at all.
 * That is backwards: the API is the surface that needed it least.
 *
 * TWIN-ADJACENT: the portal's copy is the same policy with two deliberate
 * differences, each marked there — it needs camera access for the KYC selfie and
 * blob/data image sources for the capture preview. This app needs neither, so it
 * denies them.
 *
 * Honest note on `'unsafe-inline'` in script-src: Next inlines its own bootstrap
 * and next-themes inlines the no-flash theme script, so a nonce-based policy
 * would require rendering every page dynamically through middleware. That is a
 * real trade — this policy still blocks loading script from ANY other origin,
 * which is what stops a compromised dependency exfiltrating a session to an
 * attacker's host. Tighten to nonces if the app ever moves off static rendering.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-eval' is dev-only: the Turbopack/webpack dev runtime needs it.
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'", // Tailwind and Next inject style tags
      "img-src 'self' data:", // KYC documents load same-origin via the /api rewrite
      "font-src 'self' data:",
      // Same-origin only: the API is reached through the /api rewrite, so the
      // browser never needs to talk to :3001 directly. Anything else is exfiltration.
      `connect-src 'self'${isProd ? '' : ' ws: http://localhost:*'}`,
      "frame-ancestors 'none'", // no OxShare site should embed the admin panel
      "base-uri 'self'", // stops an injected <base> retargeting every relative URL
      "form-action 'self'", // stops an injected form posting credentials elsewhere
      "object-src 'none'",
      ...(isProd ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
  // Legacy companion to frame-ancestors, for anything that predates CSP level 2.
  { key: 'X-Frame-Options', value: 'DENY' },
  // A mislabelled KYC upload must never be sniffed into active content.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Never leak a path containing a client id in a Referer to another origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The admin panel needs none of these. The portal deliberately allows camera.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // HSTS only where TLS exists; on localhost it would pin http://localhost to
  // https and lock the developer out of their own dev server.
  ...(isProd
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Three sibling repos each have a lockfile; pin the root so Next doesn't guess.
  turbopack: { root: __dirname },
  // /roles was a strict subset of the /settings Roles tab — six byte-identical
  // blocks, two sidebar entries, one feature, and already drifting (only
  // /settings gained delete and reassignment). One page owns roles now.
  async redirects() {
    return [{ source: '/roles', destination: '/settings', permanent: false }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
  // Applied to every route, including the /api rewrite — a KYC document fetched
  // through the proxy inherits nosniff and the CSP from here as well as from the
  // API's own response.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
