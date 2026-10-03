'use client';

import { KeyRound, Laptop, ShieldCheck, UserCircle } from 'lucide-react';
import { useAdmin } from '@/context/AdminAuthContext';
import { AdminIdentityPanel } from '@/components/profile/admin-identity-panel';
import { AdminPasswordPanel } from '@/components/profile/admin-password-panel';
import { AdminSessionsPanel } from '@/components/profile/admin-sessions-panel';
import { AdminGooglePanel } from '@/components/profile/admin-google-panel';
import { t } from '@/lib/i18n';

/**
 * The administrator's own account — identity, photo, password and sessions.
 *
 * ## The one console page with no permission
 *
 * Every other route in `ROUTE_REQUIREMENTS` names a key. This one is
 * `requirement: null`, and each endpoint behind it is `@AnyAdmin` on the server
 * for the same reason: everything here belongs to the caller. An administrator
 * whose role is one screen wide still has a credential to rotate and a stolen
 * laptop to sign out, and "who may change their own password" is not a decision
 * anybody should be in a position to make on somebody else's behalf.
 *
 * It is still LISTED rather than left to fall through — `canAccess` denies an
 * unlisted path, so omitting the entry would have made the profile unreachable
 * for everyone.
 *
 * ## Three panels, three independent writes
 *
 * Unlike the settings screen, nothing here saves together. Changing a photo and
 * changing a password are unrelated acts with very different consequences, and
 * one "Save" over both would mean a rejected password leaves the photo
 * unapplied — or worse, the reverse.
 *
 * ## Not tabbed
 *
 * The settings screen is tabbed because its three panels are alternatives an
 * operator visits one at a time. These three are a single answer to "what is
 * the state of my account": the sessions list is the thing somebody checks
 * immediately after changing a password, and putting them behind separate tabs
 * would hide that relationship at exactly the moment it matters.
 */
export default function ProfilePage() {
  const { admin } = useAdmin();

  /*
   * `admin` cannot be null here — `AdminLayout` renders its own pre-session
   * states above this component and never reaches `children` without one. The
   * guard is for the TYPE, not for the case: returning null rather than an
   * empty-state panel keeps this page from claiming to handle a state the shell
   * has already handled, which is how two components end up drawing two
   * different answers to "are you signed in".
   */
  if (!admin) return null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <UserCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {t('profile.title')}
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('profile.subtitle')}</p>
      </header>

      {/*
       * Two columns on desktop, because the identity panel is short and the
       * sessions list grows: stacking them puts the most-scrolled panel
       * furthest from the top on the screen where there is room for both.
       */}
      <div className="grid gap-5 lg:grid-cols-2">
        <AdminIdentityPanel admin={admin} icon={ShieldCheck} />
        <AdminPasswordPanel icon={KeyRound} />
      </div>

      <AdminGooglePanel admin={admin} />

      <AdminSessionsPanel icon={Laptop} />
    </div>
  );
}
