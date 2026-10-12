'use client';

/*
 * The idle rule, as the administrator meets it (12 Oct 2026).
 *
 * Nobody touches the console for the idle window → signed out. Somebody does →
 * never. This component is the two halves of that: it FEEDS the clock in
 * lib/idle.ts with every mouse, key, scroll and touch, and it ACTS on the clock —
 * a quiet notice in the last minute, then the sign-out.
 *
 * Mounted once, at the root, so activity counts on every page; it does nothing
 * visible until somebody is signed in and the server has said how long the
 * window is.
 *
 * The notice is a corner card, not a modal, on purpose: it must never take
 * focus from a form, and it needs no answer — any movement IS the answer, and
 * the card goes the moment the clock hears it. The button is for the person who
 * wants something to click.
 */

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/context/AdminAuthContext';
import { authApi } from '@/lib/api/auth';
import { clearAdminSession, refreshAdminToken } from '@/lib/api/client';
import {
  IDLE_WARNING_MS,
  idleRemainingMs,
  markActivity,
  needsReport,
  withIdleReason,
} from '@/lib/idle';
import { t } from '@/lib/i18n';
import { isPublicPath } from '@/lib/public-paths';
import { loginPathFor } from '@/lib/return-to';
import { announceSessionEvent } from '@/lib/session-channel';

/** What counts as "somebody is here". `scroll` does not bubble, hence capture. */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

/** An unreachable API is not asked again on every mouse move. */
const REPORT_NO_MORE_OFTEN_THAN_MS = 10_000;

export function IdleGuard() {
  const { admin } = useAdmin();
  const signedIn = admin !== null;
  const signedInRef = useRef(signedIn);
  const leaving = useRef(false);
  /** Seconds until the sign-out while the notice shows; `null` = no notice. */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  // Feeding the clock. Always on: typing a password is activity too.
  useEffect(() => {
    let lastAskedAt = 0;
    const onActivity = () => {
      const now = Date.now();
      markActivity(now);
      if (!signedInRef.current || leaving.current) return;
      // Back near the end of the window: the server must hear NOW, or the tokens
      // it issued run out under somebody who is working — see `needsReport`.
      if (now - lastAskedAt < REPORT_NO_MORE_OFTEN_THAN_MS || !needsReport(now)) return;
      lastAskedAt = now;
      void refreshAdminToken();
    };
    const options = { capture: true, passive: true } as const;
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, options);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, options);
    };
  }, []);

  // Acting on it.
  useEffect(() => {
    if (!signedIn) return;

    const leave = async () => {
      if (leaving.current) return;
      leaving.current = true;
      try {
        // The server call: it revokes the session, so the access token stops
        // with it rather than running out its last minute.
        await authApi.logout();
      } catch {
        // Unreachable. The tokens end on the server's own deadline regardless;
        // what must not happen is the console staying on screen.
        clearAdminSession();
      }
      announceSessionEvent('signed-out');
      // The emailed-link pages work signed out; nobody is evicted from them.
      if (isPublicPath(window.location.pathname)) return;
      // A HARD navigation, as every other way out of a session — see
      // `endDeadSession` in lib/api/client.ts.
      window.location.href = withIdleReason(
        loginPathFor(window.location.pathname, window.location.search),
      );
    };

    const check = () => {
      if (leaving.current) return;
      // Wall-clock time, read fresh: a laptop that slept is judged the instant
      // it wakes, not a timer's worth later.
      const remaining = idleRemainingMs();
      if (remaining === null) return;
      if (remaining <= 0) {
        void leave();
        return;
      }
      setSecondsLeft(remaining <= IDLE_WARNING_MS ? Math.ceil(remaining / 1000) : null);
    };

    check();
    const timer = window.setInterval(check, 1000);
    // Background tabs have their timers throttled; coming back asks at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  if (!signedIn || secondsLeft === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg"
    >
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">{t('idle.title')}</p>
        <p className="text-sm text-muted-foreground">{t('idle.body', { seconds: secondsLeft })}</p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          markActivity();
          setSecondsLeft(null);
        }}
      >
        {t('idle.stay')}
      </Button>
    </div>
  );
}
