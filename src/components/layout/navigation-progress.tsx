'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

/**
 * A slim bar along the top edge while a navigation is still on its way. A TWIN:
 * identical in the admin console and the client portal (scripts/check-twins.sh).
 *
 * Menu pages are prefetched in FULL (`use-prefetch-nav.ts`), so nearly every
 * click renders the new page at once and this never appears. The exception is
 * a click that lands before the page's JavaScript has finished downloading:
 * Next then keeps the OLD page on screen until it has, with nothing saying so —
 * the "the sidebar moved but the page did not" moment that was reported. A
 * loading screen cannot cover it (the navigation is a transition, which never
 * swaps settled content for a fallback), so this is the signal instead.
 *
 * Driven by EXPLICIT starts, never by sniffing clicks: `<Link>` cancels its own
 * click, and so does a group's name when it folds the group, so "was the click
 * prevented" cannot tell a navigation from a non-navigation — a sniffer would
 * leave the bar hanging. Starts come from the sidebar's `onNavigate` (fired only
 * when Next really navigates), the command palette, and back/forward. Other
 * links are not prefetched in full, so they show `(console)/loading.tsx` at once
 * and need no bar.
 *
 * Shown only after `SHOW_AFTER_MS`: a fast navigation shows nothing, so nothing
 * flickers. It finishes when the pathname changes, and gives up after
 * `GIVE_UP_MS` so a navigation that never lands cannot leave it behind.
 */
const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 10_000;

type Listener = (href: string) => void;
const listeners = new Set<Listener>();

/** Announce a client-side navigation to `href` that is about to start. */
export function startNavigationProgress(href: string): void {
  listeners.forEach((listener) => listener(href));
}

type Phase = 'idle' | 'waiting' | 'running' | 'finishing';

/** `label`: the app's own words for "loading", read to screen readers. */
export function NavigationProgress({ label }: { label: string }) {
  const pathname = usePathname();
  const [phase, setPhase] = React.useState<Phase>('idle');
  /** Held so a navigation's timers can be cancelled by the next one, and on unmount. */
  const showTimer = React.useRef<number | null>(null);
  const giveUpTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (giveUpTimer.current !== null) window.clearTimeout(giveUpTimer.current);
      showTimer.current = null;
      giveUpTimer.current = null;
    };
    const start: Listener = (href) => {
      const target = new URL(href, window.location.href);
      if (target.pathname === window.location.pathname) return; // nothing to wait for
      clearTimers();
      setPhase('waiting');
      showTimer.current = window.setTimeout(
        () => setPhase((p) => (p === 'waiting' ? 'running' : p)),
        SHOW_AFTER_MS,
      );
      giveUpTimer.current = window.setTimeout(() => setPhase('idle'), GIVE_UP_MS);
    };
    const onPopState = () => start('/__history__');
    listeners.add(start);
    window.addEventListener('popstate', onPopState);
    return () => {
      listeners.delete(start);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  /*
   * The new page is in: finish (visibly only if the bar was showing). Adjusted
   * while rendering — the sidebar's pattern for state that follows a prop — so
   * no effect paints a stale frame first. A pending show/give-up timer is then
   * harmless: both only act on a navigation still in flight, and the next start
   * clears them.
   */
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setPhase((p) => (p === 'running' ? 'finishing' : 'idle'));
  }
  React.useEffect(() => {
    if (phase !== 'finishing') return;
    const id = window.setTimeout(() => setPhase('idle'), 250);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === 'idle' || phase === 'waiting') return null;
  return <Bar finishing={phase === 'finishing'} label={label} />;
}

/** Mounted at 0 width, eased towards 80% while waiting; on arrival it fills and fades. */
function Bar({ finishing, label }: { finishing: boolean; label: string }) {
  const [width, setWidth] = React.useState('0%');
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setWidth('80%'));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const still =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      role="progressbar"
      aria-label={label}
      aria-busy={!finishing}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: finishing ? '100%' : width,
          opacity: finishing ? 0 : 1,
          transition: still
            ? 'none'
            : finishing
              ? 'width 150ms ease-out, opacity 200ms ease-out 100ms'
              : 'width 2500ms cubic-bezier(0.1, 0.6, 0.3, 1)',
        }}
      />
    </div>
  );
}
