'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce a value used as part of a query key.
 *
 * Search boxes fired one request per keystroke. React Query now cancels the
 * superseded ones, but the requests were still made — this stops them being
 * made at all.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
