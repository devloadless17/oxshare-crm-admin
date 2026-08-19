import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH } from '@/lib/return-to';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';

/**
 * The site root, which is what an operator's bookmark actually points at.
 *
 * This was an unconditional `redirect('/login')`, and that is what made "open
 * the console" mean "look at a sign-in form" for everybody who already had a
 * session. It is the single most-typed URL here, so the one page a signed-in
 * admin was guaranteed to be shown was the one page they had no business seeing
 * — and `loginPathFor` excludes `/` from `?next=`, so there was not even a
 * destination to be carried onward with.
 *
 * `proxy.ts` makes the same decision from the same cookie and gets there first,
 * so in practice this file is the fallback — for a request its matcher excludes,
 * and for anyone who reaches this route without passing through it. The two
 * agree because they read one marker and share `LOGIN_PATH` and
 * `DEFAULT_SIGNED_IN_PATH`; a second literal here is how they would stop
 * agreeing.
 *
 * The marker is NOT a session and is not trusted as one — see
 * lib/session-hint.ts. A forged or stale one lands on /dashboard, where the
 * console layout asks `/admin/auth/me`, gets a 401, clears the marker and sends
 * them back here. Nothing private is rendered on the way.
 */
export default async function Home() {
  const signedInBefore = (await cookies()).has(SESSION_HINT_COOKIE);
  redirect(signedInBefore ? DEFAULT_SIGNED_IN_PATH : LOGIN_PATH);
}
