'use client';

import Link from 'next/link';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';

/**
 * A link that becomes plain text when the viewer cannot reach where it points.
 *
 * ── The problem it solves ──────────────────────────────────────────────────
 *
 * The sidebar has always filtered itself on `canAccess`, so an operator without
 * `clients.view` sees no Clients entry. But the client list ITSELF links to
 * `/clients/{id}` from every row, the KYC queue links to `/kyc/{id}`, the
 * partner list links back to `/clients/{id}`, and the dashboard tiles link
 * everywhere. None of those checked anything.
 *
 * So a reviewer who may read the KYC queue and not the client directory saw a
 * console that offered them a client link on every row — and every one of them
 * landed on the "you do not have access" panel. Nav gating that stops at the
 * sidebar is not permission-based navigation; it is a tidy sidebar in front of
 * a console full of dead ends.
 *
 * ── Text, not a disabled link ──────────────────────────────────────────────
 *
 * The label still renders, because it is usually a name the operator is
 * entitled to read — the client list shows a client's name, and the fact they
 * cannot open the PROFILE does not mean the name should vanish from the row
 * they are legitimately looking at. What disappears is the affordance.
 *
 * A visually disabled link would be worse than either: it advertises a
 * destination, invites a click, and answers nothing.
 *
 * ── Still UX, still not security ───────────────────────────────────────────
 *
 * ARCHITECTURE §8.8: the API returns 403 regardless, and `canAccess` blocks the
 * route even if somebody types the URL. This decides what is worth offering, not
 * what is allowed.
 */
export function PermittedLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  /** Applied only when the link renders — plain text keeps the cell's own style. */
  className?: string;
}) {
  const { admin } = useAdmin();

  /*
   * Gate on the PATHNAME alone. `canAccess` matches route prefixes against a
   * path, and a link that carries a query string ("/transactions?state=all")
   * neither equals the prefix nor starts with `prefix + '/'` — so every
   * pre-filtered link melted into text for EVERYONE, including operators who
   * held the permission. The query is presentation; the route is what access
   * is decided on.
   */
  const pathname = href.split(/[?#]/)[0] ?? href;
  if (!canAccess(admin, pathname)) {
    return <>{children}</>;
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
