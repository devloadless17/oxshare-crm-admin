'use client';

import * as React from 'react';
import { usePrefetchRoutes } from '@/lib/use-prefetch-routes';
import { isNavGroup, leafHref, type NavEntry } from './navigation';

/**
 * Every page the console's menu offers, prefetched in full (`usePrefetchRoutes`
 * says why). Closed groups included: their links are invisible, so `<Link>`
 * alone never prefetched them.
 */
export function usePrefetchNav(entries: readonly NavEntry[]): void {
  const hrefs = React.useMemo(
    () => entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry])).map(leafHref),
    [entries],
  );
  usePrefetchRoutes(hrefs);
}
