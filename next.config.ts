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
  // NOTE: /roles used to redirect to /settings, because it was then a strict
  // subset of the /settings Roles tab — a duplicate that had already drifted.
  // That redirect is gone: /roles is now the canonical roles page and /settings
  // holds only network access and security controls. Deduplicating was right;
  // the fix was to delete the copy, not to make one page own three concerns.
  // `permanent: false` at the time is why no browser cached it.
  // (There is deliberately no `redirects()` key below.)

  /**
   * The same-origin proxy to the API.
   *
   * The destination was hardcoded to `http://localhost:3001`, which meant this
   * app could not be deployed anywhere without editing this file — the kind of
   * blocker that is an hour before there is a production and an incident after.
   *
   * Read from the environment with the dev value as the fallback, so nothing
   * changes locally and a deploy is a variable rather than a diff. The `/api`
   * prefix is stripped here and `/v1` is added, which is why `baseURL` stays
   * `/api` in the client: the app never spells the version, and the API never
   * sees `/api`.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // The `/v1` lives HERE and only here — PLATFORM-CONVENTIONS R-2.1.
        //
        // The API is versioned; this app's axios `baseURL` is still `/api` and
        // no application code knows about the segment. That is deliberate: the
        // root CLAUDE.md instruction "never reintroduce /v1 into a frontend base
        // URL" came from a real incident where the frontends called /api/v1/...
        // against a backend serving bare paths and every request 404'd. Putting
        // the version on the destination rather than the base URL keeps that
        // instruction literally true while the API gains what R-2.1 asks for.
        //
        // /health stays unversioned on the API, so anything probing it must not
        // go through this rewrite.
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:3001'}/v1/:path*`,
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
