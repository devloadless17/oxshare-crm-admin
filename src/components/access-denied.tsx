'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref, navLeaves } from '@/components/layout/navigation';
import { ShieldOff } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * The screen a signed-in operator gets when their role does not cover a route.
 *
 * ── Why this is not a 401 or a redirect ────────────────────────────────────
 *
 * A 401 means "we do not know who you are", and the console's answer to that is
 * already the sign-in screen. This is the other refusal: we know exactly who you
 * are, your session is fine, and this page is not yours. Signing someone out for
 * clicking a link they were shown would be a bug wearing the costume of
 * security.
 *
 * Redirecting silently to the dashboard is the other tempting answer and it is
 * worse. The operator asked for a page and got a different one with no
 * explanation, which reads as the console being broken — and they try again.
 * The refusal is stated, and the way back is offered rather than taken.
 *
 * ── What it deliberately does not say ──────────────────────────────────────
 *
 * It does not name the permission required. That is a small disclosure with no
 * upside: the operator cannot grant it to themselves, and "you need
 * `withdrawals.view`" invites them to ask for that key by name rather than
 * describe what they were trying to do. Whoever administers roles can see the
 * catalog; this person needs to know who to ask.
 */
export function AccessDenied({
  /** Shown in place of the generic body when the caller knows something useful. */
  reason,
}: {
  reason?: string;
}) {
  const pathname = usePathname();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-24 text-center"
      role="alert"
    >
      <div className="rounded-full border border-border bg-muted p-4">
        <ShieldOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-foreground">{t('session.deniedTitle')}</h2>
        <p className="max-w-sm text-sm text-muted-foreground text-pretty">
          {reason ?? deniedSentence(pathname)}
        </p>
      </div>

      <Link
        href="/dashboard"
        className="focus-outline inline-flex h-9 items-center rounded-lg border border-input bg-card px-4 text-xs font-semibold hover:bg-muted"
      >
        {t('session.backToDashboard')}
      </Link>
    </div>
  );
}

/**
 * Names the page the reader was refused (Oct 2026 audit). The sentence told
 * every refused operator to "ask a master admin" — a tier that no longer
 * exists — and never said which page their role lacked.
 */
function deniedSentence(pathname: string | null): string {
  const leaves = navLeaves();
  const href = activeNavHref(
    pathname,
    leaves.map((leaf) => leaf.href),
  );
  const leaf = leaves.find((l) => l.href === href);
  return leaf ? t('session.deniedPage', { page: t(leaf.label) }) : t('session.deniedBody');
}
