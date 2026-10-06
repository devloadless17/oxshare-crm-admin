'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { isNavGroup, leafHref, type NavEntry } from './navigation';

/**
 * Prefetch every page the sidebar offers, once, when the console is idle.
 *
 * `<Link>` prefetches only links IN the viewport, and a closed group's links are
 * `invisible` — so a page inside a group was fetched only after the group
 * opened, and a quick open-then-click beat its prefetch: the old page stayed on
 * screen under the new selection until the server answered (found live, 6 Oct
 * 2026). Prefetching the whole menu up front makes every sidebar click swap to
 * the `(console)/loading.tsx` boundary at once.
 *
 * Cheap by construction: every console route is dynamic, so the default ("auto")
 * prefetch fetches only the layout down to that loading boundary — never a full
 * render — and Next keeps it reusable for its `staleTimes.static` period.
 * Production only: `next dev` compiles a route on its first request, so the
 * same loop there would compile the whole console at sign-in.
 */
export function usePrefetchNav(entries: readonly NavEntry[]): void {
  const router = useRouter();
  const hrefs = React.useMemo(
    () => entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry])).map(leafHref),
    [entries],
  );
  const key = hrefs.join('|');

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const run = () => hrefs.forEach((href) => router.prefetch(href));
    // After the page's own first requests, so the menu never competes with them.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1000);
    return () => window.clearTimeout(id);
    // `key` stands for `hrefs`: a new array with the same pages must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);
}
