'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Local state that a URL parameter SEEDS — and re-seeds whenever the URL's
 * value changes.
 *
 * For a queue whose search box is deliberately local (typing through the
 * router drops characters — see the Financial page's note) but which must still
 * LAND filtered from a link: a notification's "Review" goes to
 * `/approvals/deposits?q=1000245`. The re-seed is the part that is easy to miss:
 * following a second link while already on the page is a client navigation to
 * the SAME route, nothing remounts, and a state seeded only once would keep the
 * first client's filter while the address bar names the second.
 *
 * `onReseed` runs in the same render, for state that must move with it (a page
 * number, which past the end of a narrower result reads as an empty queue).
 * Callers need a Suspense boundary — `useSearchParams` has to have one.
 */
export function useUrlSeededState(
  name: string,
  onReseed?: () => void,
): [string, (value: string) => void] {
  // Null outside the App Router (a unit render with no router mocked) — an
  // absent URL seeds nothing rather than throwing.
  const fromUrl = useSearchParams()?.get(name) ?? '';
  const [seededFrom, setSeededFrom] = useState(fromUrl);
  const [value, setValue] = useState(fromUrl);
  if (fromUrl !== seededFrom) {
    // Adjusting state during render — React's pattern for "reset when a prop
    // changes", with no effect and no flash of the stale filter.
    setSeededFrom(fromUrl);
    setValue(fromUrl);
    onReseed?.();
  }
  return [value, setValue];
}
