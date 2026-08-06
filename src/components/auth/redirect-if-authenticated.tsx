'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/context/AdminAuthContext';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';

/**
 * Keeps a signed-in operator off the screen that exists only for signed-out ones.
 *
 * The console had gating in one direction only. `/login` rendered the sign-in
 * form to a fully authenticated admin — and `app/page.tsx` is an unconditional
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
 * `proxy.ts` cannot do this job. It sees only that a cookie is PRESENT, which is
 * the right level of caution for a gate with no signing key: bouncing on cookie
 * presence is what produced an infinite reload loop in the portal the moment a
 * cookie outlived its session, which is the ordinary end of a session rather
 * than an edge case. So the answer has to come from `/admin/auth/me`, and that
 * means it has to come from here.
 *
 * ## Why this paints first and corrects after
 *
 * The opposite trade from the layout's gate, and deliberately so. The sign-in
 * screen is the most-loaded page in the console and almost every visitor to it
 * has no session; making all of them watch a spinner while `/admin/auth/me`
 * returns a 401 taxes the common case to fix a rare one. The harm is not
 * symmetric either — showing the sign-in form for a moment to somebody already
 * signed in is cosmetic, while showing the console to a stranger is not.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAdmin();
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

  return <>{children}</>;
}
