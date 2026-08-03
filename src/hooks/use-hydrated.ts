'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during SSR and the hydration pass, true afterwards.
 *
 * The usual `useState(false)` + `useEffect(() => setMounted(true))` does the
 * same job by triggering a second render pass through an effect — which React
 * now flags, because a state update in an effect is indistinguishable from a
 * cascading render bug. `useSyncExternalStore` expresses the same idea as what
 * it actually is: a value that differs between server and client.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
