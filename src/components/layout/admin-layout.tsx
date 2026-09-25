'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, Menu, X, Shield } from 'lucide-react';
import { UserMenu } from './user-menu';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsSheet } from './notifications-sheet';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';
import { CommandPalette } from '@/components/layout/command-palette';
import { AccessDenied } from '@/components/access-denied';
import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';
import { activeNavHref, navLeaves, visibleNav } from './navigation';
import { SidebarNav } from './sidebar-nav';
import { useNavBadges } from './use-nav-badges';

/*
 * The navigation itself lives in three files beside this one, and this layout
 * only places it:
 *
 *   navigation.ts      the tree — main items and their pages — and the pure
 *                      rules over it (active page, permission filter, counts)
 *   sidebar-nav.tsx    how it draws: groups that open, the collapsed rail
 *   use-nav-badges.ts  the live queue counts
 *
 * It was one 300-line constant and a render loop in here, as flat titled
 * sections. The owner asked for his old CRM's shape instead — main items that
 * open onto their pages (25 Sep 2026) — and `navigation.ts` records why the
 * groups are what they are, including why "Approvals" is gone.
 */

/** Every href the tree names — for `activeNavHref`, which must see them ALL. */
const NAV_HREFS = navLeaves().map((leaf) => leaf.href);

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, isLoading, isUnreachable, retry } = useAdmin();
  /*
   * Resolved across the WHOLE tree, never per group.
   *
   * Specificity is a property of the whole nav, and the regrouping made that
   * concrete: `/kyc` is under Clients and `/kyc/builder` under System, so a
   * group deciding on its own would light up both again.
   */
  const activeHref = activeNavHref(pathname, NAV_HREFS);
  /* Filtered once per admin — the permission check is the expensive half. */
  const entries = React.useMemo(() => visibleNav(admin), [admin]);
  const badges = useNavBadges(admin);
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

        {/*
          Sidebar navigation — filtered by the admin's permissions (RBAC-03 nav
          half), and drawn only once we know who is asking: the states above
          return before this, so no unfiltered menu is ever painted.

          The ONE `<nav>` on the page. Specs count it (auth-correctness), and a
          second one — a breadcrumb, say — would make "the navigation" ambiguous
          to a screen reader as well as to them.
        */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <SidebarNav
            entries={entries}
            pathname={pathname}
            activeHref={activeHref}
            collapsed={collapsed}
            badges={badges}
            onNavigate={closeMobile}
          />
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
