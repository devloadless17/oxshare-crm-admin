'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/context/AdminAuthContext';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * Keeps a signed-in operator off the screen that exists only for signed-out ones.
 *
 * The console had gating in one direction only. `/login` rendered the sign-in
 * form to a fully authenticated admin — and `app/page.tsx` was an unconditional
 * `redirect('/login')`, so **typing the bare host or clicking a `/` bookmark
 * landed a signed-in operator on an empty login form**. Not a flash: permanent,
 * until they navigated by hand, and `loginPathFor` deliberately excludes `/`
 * from `?next=` so there was not even a destination to recover.
 *
 * The portal has had this component for a while and its comment lists the three
 * consequences, in rising order of seriousness. All three are worse here:
 *
 *  1. It reads as broken.
 *  2. Submitting the form mints a SECOND session over the first. The old refresh
 *     family is not revoked by a new login, so the account quietly accumulates
 *     live thirty-day token families.
 *  3. On a shared back-office machine it is a sign-in form sitting under a live
 *     session, inviting credentials to be typed into a page that will replace
 *     whoever is currently signed in — on a console that approves payouts.
 *
 * ## It no longer paints the form first
 *
 * It used to, and the comment here defended it: the sign-in screen is the
 * most-loaded page in the console, almost every visitor to it has no session,
 * and making all of them watch a spinner while `/admin/auth/me` returns a 401
 * taxes the common case to fix a rare one.
 *
 * The reasoning was sound and the conclusion was wrong, because the "rare" case
 * is what a returning operator sees EVERY time they open the console. `/`
 * redirected here, so an admin with a live session met a painted sign-in form
 * held for a whole round trip. That is long enough to read and long enough to
 * start typing a password that was not needed.
 *
 * What was missing was a way to tell the two visitors apart before asking. There
 * is one now: `lib/session-hint.ts` — a non-sensitive marker cookie written on
 * THIS host whenever `/admin/auth/me` says "signed in", read server-side in
 * `app/layout.tsx` so it is known before the first byte of HTML. So the trade
 * does not have to be made at all:
 *
 *   - no marker  → paint the form immediately, exactly as before. The signed-out
 *                  visitor waits for nothing.
 *   - marker     → hold the paint. This browser has been signed in; showing it
 *                  the form is either wrong or about to be.
 *
 * A marker that turns out to be stale costs a spinner and then the form — the
 * old behaviour, for the one visitor whose session died between loads.
 *
 * ## Why the loader and not the form once `signedIn` is known
 *
 * `router.replace` is not instantaneous, and returning `children` during it puts
 * the sign-in form on screen for precisely the operator this component exists to
 * keep away from it — the bug, one line further down.
 *
 * This remains the BACKSTOP rather than the gate. `proxy.ts` reads the same
 * marker and answers before any HTML is generated, so most signed-in operators
 * never reach this component; it covers the ones who arrive with a marker and a
 * session that disagree.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { admin, isLoading, hadSession } = useAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();

  const signedIn = !isLoading && admin !== null;
  /*
   * Where they were going before they were bounced here.
   *
   * Attacker-reachable — anybody can send an operator a link carrying any `next`
   * at all — so it is never navigated to without `safeReturnTo`, which is where
   * the open-redirect reasoning lives.
   */
  const destination = safeReturnTo(searchParams.get(RETURN_TO_PARAM));

  React.useEffect(() => {
    if (signedIn) router.replace(destination);
  }, [signedIn, destination, router]);

  /*
   * `hadSession` is the marker while the answer is in flight and the answer once
   * it lands, so this stops holding the moment `/admin/auth/me` says 401 — a
   * browser with a stale marker gets the form, not a spinner with no end.
   */
  if (signedIn || (isLoading && hadSession)) {
    return (
      // srOnly: this is painted for someone about to be moved to the console, and
      // a visible "Loading your session" on a screen they never asked for reads
      // as an error. The label stays for screen readers, which otherwise get an
      // unannounced page that changes under them.
      <PageLoader label={t('session.loading')} srOnly fullScreen />
    );
  }

  return <>{children}</>;
}
