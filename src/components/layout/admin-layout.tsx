'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCog,
  FileCheck,
  Coins,
  Scale,
  KeyRound,
  ArrowLeftRight,
  Wallet,
  CandlestickChart,
  CreditCard,
  Handshake,
  Layers,
  ClipboardList,
  ShieldCheck,
  Lock,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  X,
  Shield,
  Tags,
  Activity,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { UserMenu } from './user-menu';
import { NotificationsSheet } from './notifications-sheet';
import { useAdmin } from '@/context/AdminAuthContext';
import api from '@/lib/api';
import type { KycListResponse } from '@/lib/api/admin';
import { canAccess, hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { PageLoader } from '@/components/ui/loader';
import { t, type MessageKey } from '@/lib/i18n';

interface NavItem {
  /** A message key, not a string — resolved through t() at render time. */
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
}

interface NavSection {
  title: MessageKey;
  items: NavItem[];
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
 * `/kyc/builder` are separate screens behind separate permissions — so the rule
 * has to compare the candidates against each other rather than test each alone.
 * Longest match wins, which is what a router does.
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

/**
 * Every entry here is a page that EXISTS and is implemented.
 *
 * ── The "Soon" entries are gone ────────────────────────────────────────────
 *
 * `/trading-accounts` and `/payouts` had no `page.tsx` at all, so they were
 * rendered as disabled placeholders carrying a "Soon" badge. That was a
 * deliberate earlier decision — they were committed scope, and the badge was
 * how the sidebar admitted the gap rather than 404ing. This pass reverses it on
 * instruction: an operator reading the navigation should be reading a list of
 * places they can go, not a roadmap. Both entries, the `comingSoon` flag, the
 * branch that rendered it, and `nav.comingSoon*` are removed together.
 *
 * If either page gets built, it comes back as a plain entry.
 *
 * ⚠️ `admin/CLAUDE.md` still says these links are committed scope and must not
 * be deleted. That instruction is now stale and is updated in the same change.
 *
 * ── The grouping ──────────────────────────────────────────────────────────
 *
 * Three sections, split by WHAT THE OBJECT IS rather than by which team owns
 * it, because the sidebar's job is to answer "where does this thing live":
 *
 *   Clients      — the people, and everything that describes them. KYC and Tags
 *                  belong here rather than in an admin bucket: both are read as
 *                  properties OF a client, and an operator looking for either
 *                  starts from the client list.
 *   Finance      — what the platform can hold. Withdrawals, the ledger and
 *                  commission plans left with the money teardown, so this is
 *                  currencies alone until deposits and withdrawals return. A
 *                  currency is not presentation config; disabling one stops
 *                  wallets opening in it across the whole product.
 *   Administration — the console configuring ITSELF. Who may sign in, what they
 *                  may do, what they did, and the settings behind it. Nothing
 *                  here is about a client.
 *
 * Dashboard sits alone at the top, outside any group: it is the landing page
 * and belongs to no category. A one-item "Main" heading above it was a label
 * that said nothing.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'nav.section.overview',
    items: [{ label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'nav.section.clients',
    items: [
      { label: 'nav.clients', href: '/clients', icon: Users },
      /*
       * The KYC REVIEW QUEUE moved to Approvals; this is the BUILDER, which is
       * configuration rather than a decision waiting on somebody.
       */
      { label: 'nav.kycBuilder', href: '/kyc/builder', icon: ClipboardList },
      // ADM-14. A tag decides which admins can SEE a client, so it is a
      // property of the client rather than a console-level object.
      { label: 'nav.tags', href: '/tags', icon: Tags },
    ],
  },
  /*
   * Decisions waiting on somebody, grouped by the fact that they are WAITING
   * rather than by what they are about.
   *
   * A section rather than a sub-menu under Partners. The plan called for a
   * collapsible group, and every section here already is one — heading plus
   * permission-filtered items, hidden entirely when nothing is visible, with a
   * collapsed-rail answer already solved. Adding a third nesting level and a
   * DropdownMenuSub for a single link would be machinery serving one entry.
   *
   * It sits above Partners because a queue is checked daily and a payout ladder
   * is edited rarely.
   *
   * ALL THREE QUEUES LIVE HERE NOW — KYC review came from Clients and the
   * withdrawal desk from Finance. What they have in common is not their subject
   * but their shape: each is a list of things a person must decide, each one
   * counted in the badge beside it, and an operator starting their day wants
   * the total of that in one place rather than assembled from three sections.
   *
   * `activeNavHref` matches on longest prefix across every section, so moving a
   * route between groups needs no other change — `/kyc/builder` stays under
   * Clients and still highlights correctly, because `/kyc` here is an exact
   * entry and the builder's own path is longer.
   */
  {
    title: 'nav.section.approvals',
    items: [
      { label: 'nav.kyc', href: '/kyc', icon: FileCheck },
      { label: 'nav.partnerApprovals', href: '/approvals/ib', icon: Handshake },
      { label: 'nav.transactions', href: '/transactions', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'nav.section.partners',
    items: [
      { label: 'nav.partners', href: '/partners', icon: Handshake },
      /* The ledger sits between the partners who earn and the ladder that sets
         the rates — the order the questions are actually asked in. */
      { label: 'nav.commissions', href: '/commissions', icon: Coins },
      { label: 'nav.ibLevels', href: '/ib-levels', icon: Layers },
    ],
  },
  /*
   * Finance, in the order the work happens: the queue an operator clears daily
   * first, then the things that configure it.
   *
   * Wallets and Trading accounts have no endpoint behind them and render
   * BackendPending. They are listed because they are pages that EXIST and say
   * what they are waiting for — which is the opposite of the `comingSoon`
   * badges removed above, where the link led nowhere at all.
   */
  {
    title: 'nav.section.finance',
    items: [
      /*
       * The withdrawal desk is NOT here any more — it moved to Approvals, with
       * the other two queues. What remains under Finance is the things an
       * operator reads or configures rather than decides: balances, accounts,
       * the methods and currencies the desk operates in.
       */
      { label: 'nav.wallets', href: '/wallets', icon: Wallet },
      { label: 'nav.tradingAccounts', href: '/trading-accounts', icon: CandlestickChart },
      { label: 'nav.paymentMethods', href: '/payment-methods', icon: CreditCard },
      { label: 'nav.currencies', href: '/currencies', icon: Coins },
      // Master-admin only (see permissions.ts), so it simply does not render
      // for a sub-admin — `canAccess` filters this list.
      { label: 'nav.reconciliation', href: '/reconciliation', icon: Scale },
    ],
  },
  {
    title: 'nav.section.administration',
    items: [
      { label: 'nav.adminUsers', href: '/admin-users', icon: UserCog },
      { label: 'nav.roles', href: '/roles', icon: ShieldCheck },
      { label: 'nav.auditLog', href: '/audit-log', icon: Activity },
      // Lock, not Settings: that icon reads as "configuration of a thing", and
      // this is the console's own configuration.
      // Machine credentials for the admin API. In Administration rather than
      // Finance: it configures who may reach this console, not what it holds.
      { label: 'nav.apiKeys', href: '/api-keys', icon: KeyRound },
      { label: 'nav.settings', href: '/settings', icon: Lock },
    ],
  },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, isLoading, isUnreachable, retry } = useAdmin();
  /*
   * Resolved across EVERY section, not per section.
   *
   * Specificity is a property of the whole nav: `/kyc` and `/kyc/builder` happen
   * to share a section today, but a nested route whose parent lived in another
   * group would light up both again if each section decided on its own.
   */
  const activeHref = activeNavHref(
    pathname,
    NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)),
  );
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  /*
   * How many partner applications are waiting, for the badge on that nav item.
   *
   * `useQuery` directly rather than `useResource`: this is a NUMBER on a nav
   * item, and the 4-state Resource exists so a screen can distinguish loading
   * from unavailable from error. None of those have a rendering here — a badge
   * that cannot be counted is a badge that is not drawn, which is what
   * `undefined` already means to `NavItem.badge`.
   *
   * Gated on `ib.view` so a restricted admin does not fire a request that will
   * 403 on every page load. Refetched on an interval rather than on focus: a
   * queue count going stale by a minute costs nothing, and this runs behind
   * every screen in the console.
   */
  const canSeeApprovals = hasPermission(admin, 'ib.view');
  const pendingApplications = useQuery({
    queryKey: ['admin', 'ib-applications', 'pending-count'],
    queryFn: () => api.admin.getIbApplications({ status: 'pending', limit: 1 }),
    enabled: canSeeApprovals,
    refetchInterval: 60_000,
    // A failed count must not surface as an error anywhere — the nav simply
    // shows no badge, which is the same as none pending.
    retry: false,
  });

  /*
   * The other two queues, counted the same way and for the same reason.
   *
   * `limit: 1` on all three: the count comes from the response envelope, so a
   * page of rows nobody will render is pure waste on every screen in the
   * console. Each is gated on the permission its endpoint requires, so a
   * restricted admin fires no request that would 403 on every page load.
   *
   * KYC counts `submitted` AND `under_review` together — both mean a reviewer
   * has to look, and counting only the first understates the queue by
   * everything already picked up.
   */
  const canReviewKyc = hasPermission(admin, 'kyc.review') || hasPermission(admin, 'kyc.view');
  const pendingKyc = useQuery({
    queryKey: ['admin', 'kyc', 'pending-count'],
    queryFn: async () =>
      (await api.get<KycListResponse>('/admin/kyc?status=submitted&limit=1')).data,
    enabled: canReviewKyc,
    refetchInterval: 60_000,
    retry: false,
  });

  const canSeeWithdrawals = hasPermission(admin, 'withdrawals.view');
  const pendingWithdrawals = useQuery({
    queryKey: ['admin', 'withdrawals', 'pending-count'],
    queryFn: () => api.admin.getWithdrawals({ state: 'pending', limit: 1 }),
    enabled: canSeeWithdrawals,
    refetchInterval: 60_000,
    retry: false,
  });

  /*
   * One href → count map, so the nav does not grow a conditional per queue.
   * A zero is left out entirely: `NavItem.badge` treats `undefined` as "draw
   * nothing", and a red `0` beside a cleared queue is an alarm about nothing.
   */
  const ibPending = pendingApplications.data?.counts.pending || undefined;

  const kycPending =
    (pendingKyc.data?.counts?.['submitted'] ?? 0) +
      (pendingKyc.data?.counts?.['under_review'] ?? 0) || undefined;

  /*
   * `counts.pending`, not `total`. Both read the same today because the query
   * filters to `state=pending` — but `counts` is the per-state map the endpoint
   * computes over the WHOLE set, so it stays correct if that filter is ever
   * relaxed, while `total` would silently start counting every withdrawal ever
   * made.
   */
  const withdrawalsPending = pendingWithdrawals.data?.counts?.['pending'] || undefined;

  /**
   * The nav, with live values applied.
   *
   * `NAV_SECTIONS` is a module constant so it can be flattened for
   * `activeNavHref` without re-deriving it per render — and a badge is not a
   * property of the route, it is a property of right now. This is where the two
   * meet. The KYC nav badge in the portal records what happens otherwise: it
   * was baked into the constant, evaluated once at import, and told an approved
   * client their verification was "Required" forever.
   */
  const sections = React.useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          /*
           * A zero is left out entirely: `NavItem.badge` treats `undefined` as
           * "draw nothing", and a red `0` beside a cleared queue is an alarm
           * about the absence of work.
           */
          const badge =
            item.href === '/approvals/ib'
              ? ibPending
              : item.href === '/kyc'
                ? kycPending
                : item.href === '/transactions'
                  ? withdrawalsPending
                  : undefined;
          return badge ? { ...item, badge } : item;
        }),
      })),
    [ibPending, kycPending, withdrawalsPending],
  );

  // Sign-out and its failure message moved into `UserMenu` with the rest of the
  // account controls, which is why none of that state lives here any more.

  // The mobile drawer closes where it is opened from — on the click that
  // navigates. Doing it in an effect keyed on `pathname` meant React ran a
  // second render pass after every navigation just to flip a boolean.
  const closeMobile = () => setMobileOpen(false);

  /*
   * ── The three states that render INSTEAD of the console ──────────────────
   *
   * These used to render inside `<main>`, so the sidebar, the header, the nav
   * and the account menu all painted around a spinner — a full console frame
   * for a visitor who may have no session at all, drawn before anything had
   * confirmed there was one.
   *
   * That is the same bug the content-area comment below describes, one level
   * out: it held back the CHILDREN and let the chrome through. The chrome is
   * the part that enumerates what exists — every section this admin may reach,
   * and by omission the ones they may not — so drawing it first and correcting
   * it afterwards is a UI leak on a shared back-office machine, and it
   * contradicts the deny-by-default posture in permissions.ts.
   *
   * The portal reached the same conclusion for the same reason; `RequireAuth`
   * returns a full-screen loader rather than the portal shell, and its comment
   * records that a flash of chrome behind a redirect undoes the point of
   * holding the paint.
   *
   * The PERMISSION denial stays inside the shell further down, deliberately.
   * By then the operator is signed in and the nav is theirs to see — the
   * refusal is about one route, not about whether they belong here at all.
   */
  if (isLoading) {
    // `srOnly`: this screen is deliberately anonymous. A visible "loading your
    // session" is a claim about a session that, for some of the people looking
    // at it, does not exist.
    return <PageLoader label={t('session.loading')} srOnly fullScreen />;
  }

  if (isUnreachable) {
    return <SessionUnreachable onRetry={() => void retry()} />;
  }

  if (!admin) {
    /*
     * The 401 interceptor is already navigating to /login; this is what the
     * frame shows in the meantime.
     *
     * Reachable because proxy.ts admits a request on the mere PRESENCE of the
     * refresh cookie — it has no signing key and cannot verify one — so a dead
     * cookie gets past the gate, `GET /admin/auth/me` 401s, and `admin` settles
     * as null. `admin` is the only authoritative signal here: it is the one
     * that came from the server.
     */
    return <PageLoader label={t('session.loading')} srOnly fullScreen />;
  }

  return (
    /*
     * `h-screen`, not `min-h-screen`.
     *
     * A table that fills the page and scrolls INSIDE itself needs a bounded
     * height to fill, and `min-height` does not bound anything — it sets a
     * floor and lets content grow past it. With `min-h-screen` a `h-full` chain
     * below resolves against `auto` and collapses to content height, so the
     * table grew the document and the page scrolled instead of the table.
     *
     * The cost of bounding it is that `<main>` becomes the scroll container for
     * ordinary pages, which is why it carries `overflow-y-auto` below.
     *
     * `h-dvh` over `h-screen` on the small breakpoint would be the better unit
     * on mobile browsers whose toolbars retract; it is deliberately not used
     * yet because `dvh` reflows on every toolbar transition and this app's
     * sticky table header visibly jitters through it.
     */
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      {/*
        `transition-[width,transform]`, not `transition-all`.

        Two properties actually move here: the WIDTH on desktop collapse, and
        the TRANSFORM on the mobile drawer. `transition-all` animated those and
        also every colour on the panel — so switching theme with the sidebar on
        screen faded the background over 300ms while the rest of the page
        changed instantly, and every hover inside it was competing with a
        300ms transition it did not ask for.

        `motion-slide` keeps the slide alive under `prefers-reduced-motion` —
        see the note in globals.css. Snapping between 16rem and 5rem does not
        read as the same panel getting narrower; it reads as a replacement.
      */}
      <aside
        className={`motion-slide fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card text-card-foreground transition-[width,transform] duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-3 overflow-hidden focus-outline rounded-md"
          >
            <Image
              src="/oxshare-mark.svg"
              // See the note on the sign-in page: Next refuses to optimize SVG
              // without `dangerouslyAllowSVG`, and a vector needs no optimizing.
              unoptimized
              alt={t('app.name')}
              width={28}
              height={26}
              className="h-7 w-7 shrink-0 object-contain"
              priority
            />
            {!collapsed && (
              <div className="flex flex-col">
                <span
                  suppressHydrationWarning
                  className="text-sm font-semibold tracking-wider text-foreground"
                >
                  {t('app.name')}
                </span>
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {t('app.adminName')}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            /* Icon-only, so it needs a name. Without one a screen reader
               announces "button" for the control that widens the entire
               navigation — the portal's copy of this had the same gap. */
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!collapsed}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={closeMobile}
            className="flex lg:hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation — items filtered by the admin's permissions (RBAC-03 nav half) */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section) => {
            /*
             * Nothing is shown until we know who is asking.
             *
             * This used to fall back to `section.items` — the UNFILTERED list —
             * while `admin` was null, which is the whole of the GET
             * /admin/auth/me round trip. So every sub-admin saw the complete
             * master-admin navigation on each page load, then watched it shrink.
             * Not a privilege leak (the API returns 403 and `canAccess` blocks
             * the page body), but it advertises the existence and paths of every
             * section a restricted admin is not meant to reach, and it looks like
             * a bug to the person it happens to.
             */
            const visibleItems = admin
              ? section.items.filter((item) => canAccess(admin, item.href))
              : [];
            if (visibleItems.length === 0) return null;
            return (
              <div key={t(section.title)} className="space-y-1">
                {!collapsed && (
                  <h3 className="px-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {t(section.title)}
                  </h3>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === activeHref;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      title={collapsed ? t(item.label) : undefined}
                      /*
                       * Which page you are on, said rather than only shown.
                       *
                       * Active state was carried entirely by colour and font
                       * weight, so a screen reader announced eleven identical
                       * links and anyone who cannot separate those two colours
                       * got nothing either. `aria-current="page"` is the one
                       * thing assistive technology actually reads here, and it
                       * costs an attribute.
                       */
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-outline ${
                        isActive
                          ? 'bg-primary/10 font-semibold text-link'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      } ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 ${
                          isActive
                            ? 'text-link'
                            : 'text-muted-foreground group-hover:text-foreground'
                        }`}
                      />
                      {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                      {/*
                       * A red circle, because it counts WORK WAITING rather
                       * than labelling the item — the queue badges are the only
                       * thing in this nav that should pull the eye.
                       *
                       * `min-w-5` with `px-1.5` keeps a single digit perfectly
                       * round and lets three digits grow into a pill instead of
                       * being clipped. `tabular-nums` stops the badge changing
                       * width as a count ticks between digits of different
                       * widths, which reads as the nav twitching.
                       */}
                      {!collapsed && item.badge && (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Account menu — identity, theme and sign-out, behind one trigger.
            Matches the portal's sidebar foot; see layout/user-menu.tsx. */}
        <UserMenu collapsed={collapsed} />
      </aside>

      {/* Main Content Area */}
      <div
        /*
         * `min-w-0` is load-bearing, not tidying.
         *
         * A flex child's default `min-width: auto` refuses to shrink below its
         * CONTENT, so a wide table inside pushes this column — and therefore the
         * whole page — past the viewport. `DataTable` already wraps itself in
         * `overflow-x-auto`, and that does nothing while its ancestor is free to
         * grow: the scrollbar appears on the document instead of on the table,
         * and the sidebar and header scroll away with it.
         *
         * `ux-sweep.spec.ts` caught this the moment the client list gained a
         * Tags column and the admin directory a Scope column — 77px and 36px of
         * horizontal page scroll respectively.
         */
        /*
         * The content pane's left inset tracks the sidebar's width, so the two
         * must animate over the SAME duration and easing or the content visibly
         * lags behind the panel it is supposed to be attached to. Only
         * `padding` moves here — `transition-all` was also animating the
         * background on a theme switch.
         */
        className={`motion-slide flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur-md px-4 lg:px-8">
          {/* Left: Mobile Toggle & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Quick Search Bar */}
            <div className="relative hidden sm:block w-64 md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                /*
                 * An explicit name, distinct from the client list's own search.
                 *
                 * It had none at all — a screen reader announced "search" with
                 * no indication of what it searched — and the placeholder it
                 * fell back to ("Search clients, deals, IBs…") is close enough
                 * to the list's label that they were indistinguishable to
                 * anything querying by accessible name, tests included.
                 */
                aria-label={t('nav.searchAria')}
                placeholder={t('nav.searchPlaceholder')}
                className="h-9 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-4 text-xs focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/*
              The "System Operational" pill is gone. It was a hardcoded green
              badge with a pulsing icon — nothing measured it, no health check
              fed it, and it read as an assurance the console was in a position
              to give. A status indicator that cannot say "degraded" is worse
              than none: it is only ever seen agreeing with itself, so when
              something IS wrong it is still there, green, being wrong.
            */}

            {/*
              The bell used to be a `<button>` with no handler and a permanent
              unread dot — a control that did nothing beside an indicator that
              always said there was something. Both are gone: it opens a panel
              now, and the panel is honest that notifications are not live.
            */}
            <NotificationsSheet />

            {/*
              The theme toggle used to live here — a two-button light/dark
              control with no way to say "follow the OS". It is now Light / Dark
              / System inside the account menu at the foot of the sidebar, which
              is where a personal preference belongs rather than beside system
              status and notifications.

              `lg:hidden` because on desktop the sidebar footer already carries
              it; on mobile the sidebar is a drawer, so the account menu needs a
              second home in the header.
            */}
            <div className="lg:hidden">
              <UserMenu collapsed variant="header" />
            </div>
          </div>
        </header>

        {/*
         * Page Content Container — uniform small padding, edge-to-edge layout.
         *
         * `min-h-0` is the twin of the `min-w-0` above and fails the same way.
         * A flex child's default `min-height: auto` refuses to shrink below its
         * content, so without this `flex-1` cannot actually bound this element:
         * a tall page pushes `<main>` past the viewport, `overflow-y-auto` finds
         * nothing to clip, and any `h-full` descendant resolves against a height
         * that is really "as tall as the content". That is precisely the state
         * where a full-height table silently becomes a full-LENGTH one.
         */}
        <main className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-y-auto p-4 md:p-5">
          {/*
           * ONE state here now, not four.
           *
           * `isLoading`, `isUnreachable` and `!admin` moved ABOVE the shell —
           * see the block before this component's `return`. They are answers to
           * "is there a session at all", and rendering the console frame around
           * them drew a back-office for a visitor who might not have one.
           *
           * What is left is the one refusal that belongs inside the frame: a
           * signed-in operator reaching a route their role does not cover. The
           * nav is legitimately theirs to see; only this page is not.
           */}
          {/*
           * One component, so the refusal reads the same wherever it appears —
           * this route gate, and any page that denies a section of itself.
           */}
          {!canAccess(admin, pathname ?? '') ? <AccessDenied /> : children}
        </main>
      </div>
    </div>
  );
}

/**
 * The API did not answer, and the operator is told so rather than signed out.
 *
 * Full screen rather than inside the console, for the same reason the loading
 * state is: this is a pre-session state, and drawing a back-office frame around
 * "we cannot reach the server" claims a session nobody has confirmed.
 *
 * Deliberately says nothing about the session being invalid. `!admin` below
 * assumes the 401 interceptor is on its way to /login, which is true when the
 * answer was 401 and false for every other failure — the API down, a 500, a
 * timeout, an offline moment — because there is no 401 to intercept. Those all
 * used to land in the spinner and stay there: no error, no retry, no way to
 * reach the sign-in page. Stopping the backend was enough to reproduce it.
 *
 * The distinction is made in `AdminAuthContext`, which is the only place that
 * can see WHY the request failed.
 */
function SessionUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center"
      role="alert"
    >
      <Shield className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-bold text-foreground">{t('session.unreachableTitle')}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t('session.unreachableBody')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded-sm text-sm font-semibold text-link hover:underline focus-outline"
      >
        {t('session.retry')}
      </button>
    </div>
  );
}
