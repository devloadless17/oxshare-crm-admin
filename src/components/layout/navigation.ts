import type * as React from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BadgePercent,
  Boxes,
  Building2,
  CandlestickChart,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Contact,
  CreditCard,
  FileCheck,
  Gauge,
  Globe,
  HandCoins,
  Handshake,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  Network,
  Radio,
  Receipt,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdminProfile } from '@/context/AdminAuthContext';
import type { MessageKey } from '@/lib/i18n';
import { canAccess } from '@/lib/permissions';

/**
 * WHERE YOU CAN GO IN THIS CONSOLE — one tree, read by the sidebar AND the
 * command palette.
 *
 * Two copies of that list is how a page ends up reachable from one and not the
 * other, which already happened here once: `/commissions` was commented out of
 * the nav and left reachable only by typing its URL. One tree, one permission
 * filter (`visibleNav`), both surfaces.
 *
 * ## Main items with sub-items (25 Sep 2026)
 *
 * This was six flat titled sections — Overview, Clients, Approvals, Partners,
 * Finance, Administration — with every link on screen at once. The broker's
 * owner asked for his old CRM's shape instead: a short list of MAIN items, each
 * opening its own sub-items, and said plainly that he got lost in the flat one.
 *
 * The groups follow WHAT A PAGE IS ABOUT, which is the question an operator
 * brings to the sidebar ("where do deposits live?"), not which team works it:
 *
 *   Clients              — the people, their verification, their accounts
 *   Introducing brokers  — the partner programme end to end
 *   Finance              — money: the two desks and the books
 *   Trading              — what the MT5 side offers, and whether it is up
 *   System               — how the console is set up: its settings, who
 *                          operates it and with what rights, and the payment
 *                          methods and forms it puts in front of clients
 *   Security             — machine access, and the record of what was done
 *
 * Admin users, roles and payment methods sit under System on the owner's call
 * (25 Sep 2026) — in his old CRM that is where the people who run the console,
 * and the configuration they run it with, were found.
 *
 * ## Approvals is gone, and the signal it carried is not
 *
 * The three queues (KYC, partner applications, deposits + withdrawals) used to
 * share an Approvals section, because an operator starting their day wants the
 * total of waiting work in one place. Each now lives with its subject, and a
 * CLOSED group shows the sum of its children's counts — so "Finance 4" still
 * says there is work in Finance without the group being open. See
 * `groupBadgeTotal`.
 *
 * ## Every leaf is a page that EXISTS
 *
 * No "Soon" rows: the navigation lists places an operator can go, not a roadmap.
 * `navigation.test.ts` pins that every leaf has a `page.tsx` and a route
 * requirement, and that every console page is reachable from here — adding a
 * page therefore means adding its leaf, in the same change as its entry in
 * `ROUTE_REQUIREMENTS` (`canAccess` denies an unlisted path, so a leaf without
 * one renders the "no access" panel instead of itself).
 */

export interface NavLeaf {
  /** A message key, not a string — resolved through t() at render time. */
  label: MessageKey;
  /**
   * The ROUTE, and only the route. Active-state matching and the badge lookup
   * both key on this, and `usePathname()` carries no query string — so a
   * filter belongs in `query` below, never appended here.
   */
  href: string;
  /**
   * A default filter the LINK carries, when the item's badge counts something
   * narrower than the page's own default view. `/kyc` opens on `submitted`
   * while the badge counts `submitted + under_review`, so clicking a badge
   * reading 17 used to open a list of 12 — the five a reviewer had already
   * picked up simply fell off the daily sweep.
   */
  query?: string;
  icon: React.ElementType;
}

export interface NavGroup {
  /** Stable — the panel's DOM id and the open-state key. Never shown. */
  id: string;
  label: MessageKey;
  icon: React.ElementType;
  items: NavLeaf[];
}

/** A top-level row: a page on its own (Dashboard), or a group that opens. */
export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

export const NAV: readonly NavEntry[] = [
  /*
   * Alone at the top, outside every group: it is the landing page and belongs
   * to no category. Wrapping one link in a group would be a click that says
   * nothing.
   */
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    id: 'clients',
    label: 'nav.group.clients',
    icon: Users,
    items: [
      { label: 'nav.clients', href: '/clients', icon: Contact },
      /*
       * The REVIEW QUEUE. The builder that configures what it asks is under
       * System — it is configuration, not a decision waiting on somebody.
       */
      { label: 'nav.kyc', href: '/kyc', query: 'status=needs_review', icon: FileCheck },
      /*
       * A trading account is something a client HOLDS, so it is read from here.
       * What the MT5 side offers to open one on is under Trading. `LineChart`
       * is the portal's icon for the same accounts.
       */
      { label: 'nav.tradingAccounts', href: '/trading-accounts', icon: LineChart },
    ],
  },
  {
    id: 'introducing-brokers',
    label: 'nav.group.introducingBrokers',
    icon: Network,
    items: [
      /*
       * In the order the questions are asked: who the partners are, who wants
       * in, what the partners earned, the ladder that sets the rates, and the
       * agencies (وكالة) a partner is appointed under — which decide what their
       * clients may trade.
       *
       * The DIRECTORY first, as "All clients" is first under Clients. It is
       * back on the owner's request; `app/(console)/partners/page.tsx` records
       * why it was once removed and why that reason no longer holds.
       */
      { label: 'nav.partners', href: '/partners', icon: Handshake },
      { label: 'nav.partnerApprovals', href: '/approvals/ib', icon: ClipboardCheck },
      { label: 'nav.commissions', href: '/commissions', icon: HandCoins },
      { label: 'nav.commissionTypes', href: '/commission-types', icon: BadgePercent },
      { label: 'nav.ibLevels', href: '/ib-levels', icon: Layers },
      { label: 'nav.agencies', href: '/agencies', icon: Building2 },
    ],
  },
  {
    id: 'finance',
    label: 'nav.group.finance',
    icon: Landmark,
    items: [
      /*
       * The two desks first, because they are cleared daily — then the reads,
       * then the configuration. The arrows are the portal's own Deposit and
       * Withdraw icons, so the same money movement looks the same in both apps.
       */
      { label: 'nav.deposits', href: '/approvals/deposits', icon: ArrowDownToLine },
      { label: 'nav.withdrawals', href: '/transactions', icon: ArrowUpFromLine },
      /* Every money movement, platform-wide — read-only; the desks above act. */
      { label: 'nav.financial', href: '/financial', icon: ArrowLeftRight },
      { label: 'nav.wallets', href: '/wallets', icon: Wallet },
      /*
       * ADM-13, beside reconciliation because that is the order the questions
       * are asked in: the report says whether the books balance, and the ledger
       * is the evidence you read when the answer is no.
       */
      { label: 'nav.ledger', href: '/ledger', icon: Receipt },
      { label: 'nav.reconciliation', href: '/reconciliation', icon: Scale },
      /*
       * A currency is not presentation config: disabling one stops wallets
       * opening in it across the whole product. Hence Finance, not System.
       */
      { label: 'nav.currencies', href: '/currencies', icon: Coins },
    ],
  },
  {
    id: 'trading',
    label: 'nav.group.trading',
    icon: CandlestickChart,
    items: [
      { label: 'nav.products', href: '/products', icon: Boxes },
      { label: 'nav.leverages', href: '/leverages', icon: Gauge },
      /* Whether the machinery behind every trading figure is actually up. */
      { label: 'nav.bridge', href: '/bridge', icon: Radio },
    ],
  },
  {
    id: 'system',
    label: 'nav.group.system',
    icon: Settings,
    items: [
      { label: 'nav.settings', href: '/settings', icon: SlidersHorizontal },
      /* Who operates the console, and what each of them may do. */
      { label: 'nav.adminUsers', href: '/admin-users', icon: UserCog },
      { label: 'nav.roles', href: '/roles', icon: ShieldCheck },
      /* The deposit methods the portal offers — configuration, not a desk. */
      { label: 'nav.paymentMethods', href: '/payment-methods', icon: CreditCard },
      { label: 'nav.kycBuilder', href: '/kyc/builder', icon: ClipboardList },
      /*
       * ADM-14. The tag CATALOGUE — creating, renaming, recolouring. Tagging a
       * client happens on the client; limiting an admin to tags happens under
       * Security. What lives here is the list both of those choose from.
       */
      { label: 'nav.tags', href: '/tags', icon: Tags },
      /*
       * The links the portal shows clients in its own sidebar. `Link2`, not
       * `ExternalLink` — that icon already means "this opens off-site" here, and
       * this entry is an ordinary internal page.
       */
      { label: 'nav.externalLinks', href: '/external-links', icon: Link2 },
    ],
  },
  {
    id: 'security',
    label: 'nav.group.security',
    icon: Shield,
    items: [
      /* Machine credentials for the admin API: who may reach this console. */
      { label: 'nav.apiKeys', href: '/api-keys', icon: KeyRound },
      /*
       * And FROM WHERE: the RBAC-08 network allowlist. It was a tab on Settings
       * and moved here on the owner's call (25 Sep 2026) — it is a security
       * control, and an operator looking for "who can reach the console"
       * looks under Security, not beside the SMTP form.
       */
      { label: 'nav.networkAccess', href: '/network-access', icon: Globe },
      { label: 'nav.auditLog', href: '/audit-log', icon: Activity },
    ],
  },
];

/** Every page the tree names, in order. */
export function navLeaves(entries: readonly NavEntry[] = NAV): NavLeaf[] {
  return entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
}

/** Where a leaf's link goes — its route plus the default filter it carries. */
export function leafHref(leaf: NavLeaf): string {
  return leaf.query ? `${leaf.href}?${leaf.query}` : leaf.href;
}

/**
 * The tree as THIS admin may see it: leaves filtered by `canAccess`, and a
 * group dropped entirely once none of its pages is left.
 *
 * Nothing at all while `admin` is null. The sidebar used to fall back to the
 * UNFILTERED list for the length of the GET /admin/auth/me round trip, so every
 * sub-admin saw the complete menu on each page load and then watched it shrink —
 * not a privilege leak (the API answers 403 and `canAccess` blocks the page
 * body), but it advertised every section a restricted admin is not meant to
 * reach.
 *
 * An empty group is dropped rather than drawn: a heading that opens onto
 * nothing is a door with a wall behind it.
 */
export function visibleNav(
  admin: AdminProfile | null,
  entries: readonly NavEntry[] = NAV,
): NavEntry[] {
  if (!admin) return [];
  return entries.flatMap((entry): NavEntry[] => {
    if (!isNavGroup(entry)) return canAccess(admin, entry.href) ? [entry] : [];
    const items = entry.items.filter((item) => canAccess(admin, item.href));
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

/** The group holding `href`, or null for a top-level page (or no page). */
export function groupOf(href: string | null, entries: readonly NavEntry[] = NAV): NavGroup | null {
  if (!href) return null;
  for (const entry of entries) {
    if (isNavGroup(entry) && entry.items.some((item) => item.href === href)) return entry;
  }
  return null;
}

/**
 * Which nav entry is the current page — the MOST SPECIFIC match, not every match.
 *
 * This was `pathname === href || pathname.startsWith(href + '/')`, evaluated per
 * item in isolation. On `/kyc/builder` that is true for BOTH `/kyc` (a prefix)
 * and `/kyc/builder` (exact), so two sidebar entries lit up at once and the
 * sidebar stopped answering the only question it exists to answer: where am I.
 *
 * Nested routes are the normal case here, not an edge one — `/kyc` and
 * `/kyc/builder` are separate screens behind separate permissions, and since the
 * regrouping they are not even in the same group — so the rule compares the
 * candidates against each other rather than testing each alone. Longest match
 * wins, which is what a router does. Resolved across the WHOLE tree, never per
 * group, for exactly that reason.
 *
 * Exported and pure so the nesting is asserted directly. The bug was invisible
 * until somebody opened the nested page and looked at the sidebar.
 */
export function activeNavHref(pathname: string | null, hrefs: string[]): string | null {
  if (!pathname) return null;
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(h + '/'));
  return matches.reduce<string | null>(
    (best, h) => (!best || h.length > best.length ? h : best),
    null,
  );
}

/** Live counts of work waiting, by leaf href. Absent means "draw nothing". */
export type NavBadges = Readonly<Partial<Record<string, number>>>;

/**
 * What a CLOSED group shows: the work waiting anywhere inside it.
 *
 * Summed over the group as the caller holds it — pass the `visibleNav` copy, so
 * a count from a page this admin cannot open never reaches the total. (The
 * queries behind the counts are permission-gated as well; this is the second
 * lock on the same door.)
 *
 * `undefined` for zero, the same rule as a leaf's badge: a red `0` beside a
 * cleared queue is an alarm about the absence of work.
 */
export function groupBadgeTotal(group: NavGroup, badges: NavBadges): number | undefined {
  const total = group.items.reduce((sum, item) => sum + (badges[item.href] ?? 0), 0);
  return total > 0 ? total : undefined;
}
