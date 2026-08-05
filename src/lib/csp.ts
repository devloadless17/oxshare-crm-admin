/**
 * The per-request `script-src`, with a nonce — the half of the CSP that cannot
 * be a static header.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `next.config.ts` carried `script-src 'self' 'unsafe-inline'`, and the
 * `'unsafe-inline'` was not laziness: Next emits inline bootstrap and hydration
 * scripts on every page, so removing it without a nonce yields a blank screen.
 *
 * But while it is there, the rest of the policy buys very little against the
 * threat it exists for. `'unsafe-inline'` means any injected `<script>` runs —
 * and on this origin that script can act as the signed-in admin: the session
 * cookies are `httpOnly` so it cannot READ them, but the browser attaches them
 * to every request it makes, and the anti-forgery token is deliberately readable
 * by JS. Approving a withdrawal is a fetch away.
 *
 * A nonce closes it: only tags carrying this exact value run, and an attacker
 * injecting markup cannot guess a value minted after their payload was stored.
 *
 * ── Why it must be per REQUEST ─────────────────────────────────────────────
 *
 * A nonce reused across responses is not a nonce. If it were in
 * `next.config.ts` it would be one constant baked at build time, which an
 * attacker reads once from any page and embeds in their payload forever — a
 * policy that looks strict and enforces nothing. That is the whole reason this
 * lives in middleware rather than beside the other headers.
 */

/** 128 bits, base64 — the length CSP implementations and reviewers expect. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // `btoa` rather than Buffer: middleware runs on the Edge runtime, where Node
  // globals are not available.
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The complete `script-src` directive for one response.
 *
 * `'strict-dynamic'` is deliberately ABSENT. It would let a nonced script load
 * further scripts without their own nonce, which is the right trade for an app
 * pulling in third-party bundles — this one pulls in none, `connect-src` is
 * `'self'`, and without it the policy is stricter. Add it only if a real
 * dependency needs it, and say which.
 *
 * `'unsafe-eval'` stays dev-only: the Turbopack dev runtime needs it, and a
 * production build does not.
 */
export function scriptSrc(nonce: string, isProd: boolean): string {
  return `script-src 'self' 'nonce-${nonce}'${isProd ? '' : " 'unsafe-eval'"}`;
}

/**
 * The COMPLETE policy for one response.
 *
 * All of it lives here, not half here and half in `next.config.ts`. Splitting it
 * did not work and failed silently: `headers()` in the config is applied AFTER
 * middleware and replaced the header middleware had set, so every response went
 * out carrying `script-src` alone — no `default-src`, no `frame-ancestors`, no
 * `object-src`. The policy looked stricter than before and was weaker.
 */
export function contentSecurityPolicy(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    // The only per-request directive, and the reason this whole module exists.
    scriptSrc(nonce, isProd),
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
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * The header name Next reads the nonce back out of.
 *
 * Set on the REQUEST (not the response) so Next's own renderer can stamp it onto
 * the inline scripts it generates. This is the documented contract; changing the
 * name silently drops the nonce from those tags and the page goes blank.
 */
export const NONCE_HEADER = 'x-nonce';
