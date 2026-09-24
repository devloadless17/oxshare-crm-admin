'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCog,
  FileCheck,
  Coins,
  Boxes,
  Radio,
  Scale,
  Receipt,
  KeyRound,
  ArrowLeftRight,
  Wallet,
  CandlestickChart,
  Gauge,
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
  Banknote,
  Link2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { UserMenu } from './user-menu';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsSheet } from './notifications-sheet';
import { useAdmin } from '@/context/AdminAuthContext';
import api from '@/lib/api';
import type { KycListResponse } from '@/lib/api/admin';
import { canAccess, hasPermission } from '@/lib/permissions';
import { CommandPalette } from '@/components/layout/command-palette';
import { AccessDenied } from '@/components/access-denied';
import { PageLoader } from '@/components/ui/loader';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export interface NavItem {
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
  badge?: string | number;
}

export interface NavSection {
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
/**
 * Exported so the COMMAND PALETTE reads the same list the sidebar renders.
 *
 * Two copies of "where can you go in this console" is how a page ends up
 * reachable from one and not the other — which already happened here once, when
 * /commissions was commented out of the nav and left reachable only by typing
 * its URL. One array, one permission filter (`canAccess`), both surfaces.
 */
export const NAV_SECTIONS: NavSection[] = [
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
      { label: 'nav.kyc', href: '/kyc', query: 'status=needs_review', icon: FileCheck },
      { label: 'nav.partnerApprovals', href: '/approvals/ib', icon: Handshake },
      { label: 'nav.deposits', href: '/approvals/deposits', icon: Banknote },
      { label: 'nav.transactions', href: '/transactions', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'nav.section.partners',
    items: [
      /*
       * `/partners` is GONE, and its route requirement went with it — the two
       * are removed together, because `canAccess` denies an unlisted path and a
       * page left in the nav without one renders the "no access" panel.
       *
       * It listed the same people the clients screen does, from the same
       * `ib_accounts` rows, on a screen that could not also show a partner's
       * KYC, tags or wallets. The clients list can, and its type filter now
       * DERIVES "partner" rather than reading a column nothing maintained — the
       * disagreement that made two screens necessary in the first place (one
       * said 7 partners, the other said 1).
       *
       * Partners are reached at `/clients?type=partner`, which the dashboard
       * tile links to.
       */
      /* The ledger sits between the partners who earn and the ladder that sets
         the rates — the order the questions are actually asked in. (This entry
         was briefly commented out, which left a working, permission-gated
         screen reachable only by typing its URL — the navigation lists places
         an operator can go, and /commissions is one.) */
      { label: 'nav.commissions', href: '/commissions', icon: Coins },
      /* One entry, because there is one catalogue. `nav.ibLevels` pointed at a
         second screen owning "where a partner stands"; 0102 folded that into the
         programme's own tier ladder, so the terms and their reach are configured
         in one place and cannot disagree. */
      { label: 'nav.ibLevels', href: '/ib-levels', icon: Layers },
      /*
       * Agencies sit with the partners rather than with Products, because that
       * is who they are about: a وكالة is the programme a partner is appointed
       * under. Products are the catalogue and live under Finance with the
       * currencies — the same kind of thing, configured by the same people.
       */
      { label: 'nav.agencies', href: '/agencies', icon: Handshake },
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
      /*
         First in the section because it is the section's broadest read: every
         money movement, platform-wide, before the per-object lists below
         narrow to wallets or accounts. Read-only — the desk under Approvals
         still owns the withdrawal actions.
      */
      { label: 'nav.financial', href: '/financial', icon: Banknote },
      { label: 'nav.wallets', href: '/wallets', icon: Wallet },
      { label: 'nav.tradingAccounts', href: '/trading-accounts', icon: CandlestickChart },
      { label: 'nav.paymentMethods', href: '/payment-methods', icon: CreditCard },
      { label: 'nav.products', href: '/products', icon: Boxes },
      { label: 'nav.currencies', href: '/currencies', icon: Coins },
      { label: 'nav.leverages', href: '/leverages', icon: Gauge },
      // Master-admin only (see permissions.ts), so it simply does not render
      // for a sub-admin — `canAccess` filters this list.
      /*
         ADM-13. Beside reconciliation because that is the order the questions
         are asked in: the report says whether the books balance, and the ledger
         is the evidence you read when the answer is no. `Receipt`, not `Scale` —
         one weighs, the other records.
      */
      { label: 'nav.ledger', href: '/ledger', icon: Receipt },
      { label: 'nav.reconciliation', href: '/reconciliation', icon: Scale },
      // Beside reconciliation rather than under trading: both answer "is the
      // machinery working", where the trading entries above answer "what does
      // this client hold".
      { label: 'nav.bridge', href: '/bridge', icon: Radio },
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
      /*
       * The links the portal shows clients in its own sidebar. Administration
       * rather than Finance, beside Settings: it configures what the CONSOLE
       * puts in front of clients, not anything the broker holds or owes.
       *
       * `Link2`, not `ExternalLink` — that icon is the little arrow this app
       * already uses to mean "this opens off-site", and reusing it for a
       * navigation entry that goes to an ordinary internal page would say the
       * wrong thing at a glance.
       */
      { label: 'nav.externalLinks', href: '/external-links', icon: Link2 },
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
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  /*
   * Ctrl/Cmd-K, bound at the WINDOW so it works wherever focus happens to be.
   *
   * Guarded against firing while the operator is typing: the console is full of
   * search fields and note textareas, and a global letter binding that steals K
   * from them is worse than no binding. `metaKey` as well as `ctrlKey` because
   * the combination costs one condition and a Mac reaches for Cmd by reflex.
   *
   * `preventDefault` because Ctrl-K is the browser's own search-bar focus in
   * some builds — without it both fire and the address bar wins.
   */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.ctrlKey || event.metaKey)) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      event.preventDefault();
      setPaletteOpen(true);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    queryKey: keys.ibApplications.pendingCount(),
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
    queryKey: keys.kyc.pendingCount(),
    queryFn: async () =>
      (await api.get<KycListResponse>('/admin/kyc?status=needs_review&limit=1')).data,
    enabled: canReviewKyc,
    refetchInterval: 60_000,
    retry: false,
  });

  const canSeeDeposits = hasPermission(admin, 'deposits.view');
  const pendingDeposits = useQuery({
    queryKey: keys.deposits.pendingCount(),
    // `limit: 1` — this asks for the COUNT, which rides in the response
    // envelope; the row itself is thrown away.
    queryFn: () => api.admin.getTransactions({ direction: 'deposit', state: 'pending', limit: 1 }),
    enabled: canSeeDeposits,
    refetchInterval: 60_000,
    retry: false,
  });

  const canSeeWithdrawals = hasPermission(admin, 'withdrawals.view');
  const pendingWithdrawals = useQuery({
    queryKey: keys.withdrawals.pendingCount(),
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

  /*
   * `needs_review`, served by the API — not summed here.
   *
   * This added `submitted + under_review` itself, which was right, and was the
   * THIRD place that definition lived: the backend filter resolves the same
   * pair, and the queue's own "Needs review" tab read a `counts.needs_review`
   * key that did not exist and so displayed 0 for ever. Three authors, two
   * agreeing by luck and one silently wrong. The API computes it once now, so
   * the badge, the tab and the filter cannot disagree.
   */
  const kycPending = pendingKyc.data?.counts?.['needs_review'] || undefined;

  /*
   * `counts.pending`, not `total`. Both read the same today because the query
   * filters to `state=pending` — but `counts` is the per-state map the endpoint
   * computes over the WHOLE set, so it stays correct if that filter is ever
   * relaxed, while `total` would silently start counting every withdrawal ever
   * made.
   */
  const withdrawalsPending = pendingWithdrawals.data?.counts?.['pending'] || undefined;
  // From `counts`, never `total` — the envelope's count covers the whole
  // filtered set, while `total` here is the page.
  const depositsPending = pendingDeposits.data?.counts?.['pending'] || undefined;

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
              : item.href === '/approvals/deposits'
                ? depositsPending
                : item.href === '/kyc'
                  ? kycPending
                  : item.href === '/transactions'
                    ? withdrawalsPending
                    : undefined;
          return badge ? { ...item, badge } : item;
        }),
      })),
    [ibPending, depositsPending, kycPending, withdrawalsPending],
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
        {/*
          COLLAPSED, the header holds the mark ALONE, centred — and the expand
          control moves onto the sidebar's edge as a small round button.

          It used to keep both in one row: the 31px mark and the 28px toggle in
          an 80px rail with 16px of padding each side is 59px into 48px, so the
          logo link shrank, its `overflow-hidden` clipped the mark, and the
          header read as a broken logo jammed against a chevron (owner's report,
          24 Sep 2026). A control on the edge is the pattern people already know
          from every collapsible sidebar, and it costs the header nothing.
        */}
        <div
          className={`relative flex h-16 items-center border-b border-border ${
            collapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {/*
            NAMED ON THE LINK, not only by the artwork inside it.

            The wordmark used to sit beside the words "Admin Portal", so the link
            had text and announced itself. Dropping that label left a link whose
            only content is an image — and `ux-sweep` flagged it on every page of
            the console, because a control named solely by a child image is one
            step from being named by nothing: swap the artwork for a
            decorative-marked one, or hide it per theme, and the name is gone
            with no visible change. `aria-label` here does not depend on which
            image is showing, or on there being an image at all.
          */}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            aria-label={t('app.name')}
            className="flex items-center gap-3 overflow-hidden focus-outline rounded-md"
          >
            {/*
              THE REAL WORDMARK expanded, the mark alone collapsed.

              The brand name used to be set in the UI font beside the mark,
              which put an approximation of the logo next to the logo — the
              letterforms in the supplied artwork are drawn, not typeset. Both
              files are the brand's own vectors, extracted from the supplied
              PDF rather than redrawn.

              The "Admin Portal" label that sat beside it is gone on the owner's
              call: the logo is the header now. Nothing was relying on it to
              tell the two apps apart — the console is reached at its own host,
              and every screen inside it is one the portal does not have.
            */}
            {/*
              The logo is drawn INLINE (see brand-logo.tsx): no file request, no
              second copy swapped by CSS, and dark mode is the word's colour
              turning white. The link around it carries the accessible name, so
              the drawing itself is decorative.
            */}
            {collapsed ? (
              <BrandLogo variant="mark" className="h-7 w-auto shrink-0" />
            ) : (
              <BrandLogo className="h-7 w-auto shrink-0" />
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
            className={
              collapsed
                ? 'absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-outline lg:flex'
                : 'hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline'
            }
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
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
                      href={item.query ? `${item.href}?${item.query}` : item.href}
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

            {/*
              A BUTTON that opens the palette, not an input.

              It was an `input type="search"` with no state, no handler and no
              results: typing in it did nothing. Shaped like a field, it
              promised a search the console did not have — the same defect as
              the hardcoded status pill and the handler-less bell this header
              has already been cleared of, and worse than either, because an
              operator who types into it concludes the console cannot find
              things rather than that this control is decorative.

              Looking like a field is deliberate and is now honest: it is the
              affordance people reach for, and pressing it reaches a real
              search. The shortcut is printed on it because a palette nobody
              knows the keystroke for is one everybody drives with the mouse.
            */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label={t('nav.searchAria')}
              aria-haspopup="dialog"
              className="relative hidden w-64 cursor-pointer items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted sm:flex md:w-80 h-9 focus-outline"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-start">
                {t('nav.searchPlaceholder')}
              </span>
              {/*
                `Ctrl`, not the platform-correct `⌘` on a Mac. The console is an
                internal desk tool on Windows machines, and detecting the
                platform to render one glyph is machinery for a case this
                deployment does not have — the handler accepts both regardless.
              */}
              <kbd className="hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] md:inline">
                {t('nav.searchShortcut')}
              </kbd>
            </button>
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
            {/*
              Light or dark, one click, BESIDE the bell — the client's call. It
              used to be a Theme ▸ submenu inside the account menu offering
              System as well; the toggle is the whole control now.
            */}
            <ThemeToggle />
            <NotificationsSheet />

            {/*
              The account menu lives HERE, at every breakpoint — the top-right
              placement the product owner asked for, matching the portal. It
              used to sit at the foot of the sidebar on desktop with this
              header copy gated `lg:hidden`; one menu in one place means one
              selector for the tests and no duplicate trigger for a screen
              reader to announce twice.
            */}
            <UserMenu collapsed variant="header" />
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
        {/*
         * The padding moved OFF this element and onto the wrapper inside it.
         *
         * `<main>` is the scroll container, and padding on a scroll container is
         * the fragile place to put it: whether the END-side padding is part of
         * the scrollable overflow region — so it still shows once you have
         * scrolled to the bottom — has differed between engines and between
         * Chrome versions, and it is not something to leave to chance on every
         * page in the console. Padding on a normal in-flow child is drawn on
         * that child's own box and cannot be dropped by anybody.
         *
         * The portal hit the visible half of this and its layout carries the
         * long version of the reasoning, including why the wrapper uses `flex-1`
         * WITHOUT `min-h-0` and why that leaves the `fill` tables alone.
         */}
        <main className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-y-auto">
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
          <div className="flex w-full max-w-full flex-1 flex-col p-4 md:p-5">
            {!canAccess(admin, pathname ?? '') ? <AccessDenied /> : children}
          </div>
        </main>
      </div>

      {/* Outside the content pane, so its backdrop covers the sidebar too —
          inside, the padding transition above would clip it. */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
