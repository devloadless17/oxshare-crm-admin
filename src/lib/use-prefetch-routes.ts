'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';

/**
 * Prefetch these addresses in FULL whenever the app is idle after a navigation —
 * the app's menu, so a menu click renders its page at once. A TWIN: identical in
 * the admin console and the client portal (scripts/check-twins.sh).
 *
 * Why it exists. Every route in both apps is dynamic (the root layout reads
 * `headers()` for the CSP nonce), and Next 16 prefetches a dynamic route only
 * down to its `loading.js` boundary — so even with one, every click showed that
 * loader for a server round trip (42 of 42 clicks, measured). `<Link>` also
 * prefetches only links on screen, so a link inside a closed menu group was not
 * prefetched at all, and a quick open-then-click froze on the old page.
 *
 * FULL carries the page itself, so a click renders it at once: 22 ms median
 * against 320 on a production build with 150 ms of added latency. It is cheap
 * because every page here is a client component: a whole menu costs ~40
 * requests and a few KB, Next dedupes a prefetch that is still fresh, and it
 * also brings the page's JavaScript in the background.
 *
 * Re-run after EVERY navigation: a page you have visited is cached as dynamic
 * (not at all), so the page just left is prefetched again, and every entry's
 * five-minute life restarts while somebody is working. Production only: `next
 * dev` compiles a route on its first request, so the same loop there would
 * compile the whole app at sign-in.
 *
 * `PrefetchKind` comes from an internal path because the router's public type
 * takes it; if an upgrade moves it, the type-check fails rather than anything
 * failing quietly.
 */
export function usePrefetchRoutes(hrefs: readonly string[]): void {
  const router = useRouter();
  const pathname = usePathname();
  const key = hrefs.join('|');

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const run = () =>
      key.split('|').forEach((href) => href && router.prefetch(href, { kind: PrefetchKind.FULL }));
    // After the page's own first requests, so the menu never competes with them.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1000);
    return () => window.clearTimeout(id);
    // `pathname` is the trigger, so the page just left is warm again.
  }, [key, router, pathname]);
}
