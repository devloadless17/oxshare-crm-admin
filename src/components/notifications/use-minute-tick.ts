'use client';

import { useEffect, useState } from 'react';

/**
 * Re-render once a minute while mounted, so "just now" becomes "5 min ago" and
 * a row from before midnight leaves "Today" without anybody reloading. Paused
 * with the tab: a hidden list is re-rendered on return, by the focus refetch.
 */
export function useMinuteTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(id);
  }, []);
}
