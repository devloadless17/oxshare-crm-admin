'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import {
  groupBadgeTotal,
  groupOf,
  isNavGroup,
  leafHref,
  type NavBadges,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
} from './navigation';

/**
 * Where the menu stands: the page it shows as current, and the main item the
 * operator opened, if they opened one.
 *
 * ## It shows where the operator is GOING, from the click
 *
 * A navigation is not instant. The router keeps the old page on screen until
 * the new one is ready — a round trip in production, seconds while dev compiles
 * a route — and `pathname` changes only when it lands. The menu used to forget
 * the operator's choice on the click and wait for `pathname`, so for that whole
 * window it fell back to the page being LEFT: the main item you had just
 * clicked in folded shut and opened again, or the previous main item lit up
 * before the right one (reported: "it closes the expanded menu then expands it
 * again… makes another main item active for milliseconds"). A click now records
 * where it is going and the menu shows that page at once, so when the page
 * lands, nothing on the menu moves.
 *
 * Recorded from `next/link`'s `onNavigate`, never `onClick`: it runs only when
 * the router really navigates THIS tab, so a Ctrl/⌘-click or a middle click —
 * the page opening in a new tab — leaves this menu describing this tab.
 *
 * A second click before the first page lands OVERTAKES it, and the router can
 * still show the overtaken page on the way (seen live: Deposits, then
 * Withdrawals a moment later, and the Deposits page landed first). That page is
 * an echo of a click the operator already replaced, so the menu keeps showing
 * the latest one instead of flicking back to it.
 *
 * ## A choice lasts until the operator goes somewhere
 *
 * Opening a main item is a choice about the page on screen. Any navigation
 * clears it — a click in this menu, or the page changing under it (the
 * palette, a link in the page, the back button) — so a choice made two pages
 * ago never comes back (reported: "I'm on the dashboard but the old active
 * item keeps showing as active"). One exception: a main item opened while a
 * click's page was on its way is a choice about the page that arrives, and is
 * kept.
 */
interface MenuPosition {
  /** The `pathname` this position was last reconciled with. */
  path: string | null;
  /** The page a click in this menu is taking the operator to, until it lands. */
  heading?: string;
  /** Pages of earlier clicks that `heading` overtook, oldest first — they may still land. */
  overtaken?: readonly string[];
  /** The main item the operator opened; `null` closed them all; absent follows the page. */
  open?: string | null;
}

/**
 * The console's sidebar: main items that open onto their pages.
 *
 * Modelled on the portal's `sidebar-nav.tsx` — the same classes, the same
 * motion, and main items whose name opens a page while the arrow opens the
 * list — so the two apps read as one product. It is not a twin file: this one
 * carries counts, permissions and six groups where the portal has one.
 *
 * ## One group open at a time, and it follows the page
 *
 * The owner's old CRM behaves this way and it is what he asked for. It also
 * keeps the menu short enough to show every main item without scrolling, which
 * is most of what "I know where things are" means.
 *
 * The open group is DERIVED, not synced in an effect — the group holding the
 * page the menu shows, unless the operator opened another (`MenuPosition`) —
 * so arriving anywhere (a link, the command palette, a notification, the back
 * button) renders the right group open on the first paint. An effect keyed on
 * `pathname` would paint the stale group for one frame and then move it under
 * the pointer.
 */
export function SidebarNav({
  entries,
  pathname,
  activeHref,
  collapsed,
  badges,
  onNavigate,
}: {
  /** Already permission-filtered — `visibleNav(admin)`. */
  entries: NavEntry[];
  pathname: string | null;
  /** The current page's leaf, from `activeNavHref` over the WHOLE tree. */
  activeHref: string | null;
  collapsed: boolean;
  badges: NavBadges;
  onNavigate: () => void;
}) {
  const [position, setPosition] = React.useState<MenuPosition>({ path: pathname });
  let here = position;
  if (position.path !== pathname) {
    /*
     * The page changed. Adjusted while rendering — React's pattern for state
     * that resets when a prop changes — so a stale position is never painted,
     * and no effect paints it for a frame first.
     */
    const echo = pathname === null ? -1 : (position.overtaken?.indexOf(pathname) ?? -1);
    here =
      position.heading !== undefined && position.heading === pathname
        ? { path: pathname, open: position.open }
        : echo >= 0
          ? { ...position, path: pathname, overtaken: position.overtaken?.slice(echo + 1) }
          : { path: pathname };
    setPosition(here);
  }

  /* The page the menu shows: where a click in it is going, else the page on screen. */
  const shownHref = here.heading ?? activeHref;
  const activeGroupId = groupOf(shownHref, entries)?.id ?? null;
  const openId = here.open === undefined ? activeGroupId : here.open;
  const toggle = (id: string) => setPosition({ ...here, open: openId === id ? null : id });
  /*
   * A click on any page in the menu — even the page already on screen — hands
   * the selection to that page. Clicking Dashboard on the dashboard after
   * peeking into Trading has to put the highlight back on Dashboard.
   */
  const go = (href: string) => {
    const overtaken =
      here.heading !== undefined && here.heading !== href
        ? [...(here.overtaken ?? []), here.heading]
        : here.overtaken;
    setPosition({ path: here.path, heading: href, overtaken });
    onNavigate();
  };

  /*
   * THE ONE SELECTED ROW — the sidebar highlights exactly one main item.
   *
   * It is the main item the operator OPENED on this page, else the one holding
   * the page, else the page itself when it sits at the top level (Dashboard).
   *
   * It used to follow the PAGE alone, so on the dashboard, opening System left
   * Dashboard filled and System merely hovered — the owner's report: "the old
   * item keeps showing as active". His old CRM moves the highlight to what you
   * pick, and so does this. The page stays `aria-current` throughout: that is
   * the truth a screen reader needs, whatever the operator is looking at.
   *
   * The rail has no accordion to open, so it selects by the page alone.
   */
  const selectedId = collapsed ? activeGroupId : (here.open ?? activeGroupId);

  return (
    <>
      {entries.map((entry) => {
        if (!isNavGroup(entry)) {
          const current = entry.href === shownHref;
          return (
            <NavLink
              key={entry.href}
              item={entry}
              current={current}
              selected={current && selectedId === null}
              collapsed={collapsed}
              onNavigate={() => go(entry.href)}
              badge={badges[entry.href]}
            />
          );
        }

        if (collapsed) {
          return (
            <RailGroupMenu
              key={entry.id}
              group={entry}
              selected={selectedId === entry.id}
              activeHref={shownHref}
              badges={badges}
              onNavigate={go}
            />
          );
        }

        return (
          <NavGroupPanel
            key={entry.id}
            group={entry}
            open={openId === entry.id}
            selected={selectedId === entry.id}
            onToggle={() => toggle(entry.id)}
            activeHref={shownHref}
            badges={badges}
            onNavigate={go}
          />
        );
      })}
    </>
  );
}

/*
 * ONE look for "selected", wherever it appears — the Dashboard row, a main item,
 * a main item on the rail. The Dashboard used to be a SOLID fill while every
 * other selection was a tint, so the two read as different states (reported).
 *
 * Hover is NEUTRAL (`bg-muted`), never the brand tint: a hovered row painted in
 * the selection's colour was the second "active" item in the report's
 * screenshot — the pointer resting on the System row it had just clicked.
 */
const SELECTED_ROW = 'bg-primary/10 font-semibold text-foreground';
const IDLE_ROW = 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground';
const SELECTED_ICON = 'text-link';
const IDLE_ICON = 'text-muted-foreground group-hover:text-foreground';

/**
 * A red count, because it is WORK WAITING rather than a label — the only thing
 * in this nav that should pull the eye.
 *
 * `min-w-5` with `px-1.5` keeps a single digit round and lets three digits grow
 * into a pill instead of being clipped; `tabular-nums` stops it changing width
 * as a count ticks, which reads as the nav twitching.
 */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-destructive-foreground">
      {count}
    </span>
  );
}

/**
 * One page.
 *
 * At the top level (Dashboard) it is a row that can be THE selected row. As a
 * SUB-page, the current one is marked in the brand colour with no fill of its
 * own: the main item above it carries the fill, so the eye reads "in Finance, on
 * Deposits" — one selection and a place within it, not two selections.
 */
function NavLink({
  item,
  current,
  selected = false,
  collapsed,
  onNavigate,
  badge,
  nested = false,
}: {
  item: NavLeaf;
  /**
   * This link IS the page — the one on screen, or the one a click in the menu
   * is taking the operator to — so `aria-current`, whatever is selected.
   */
  current: boolean;
  /** This top-level row is the sidebar's one selected row. */
  selected?: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badge?: number;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const sub = nested && !collapsed;
  const marked = sub ? current : selected;
  const tone = sub
    ? current
      ? 'font-semibold text-link hover:bg-muted'
      : IDLE_ROW
    : selected
      ? SELECTED_ROW
      : IDLE_ROW;

  return (
    <Link
      href={leafHref(item)}
      /* Not `onClick` — see `MenuPosition`: a click that opens a new tab is not a navigation here. */
      onNavigate={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      /*
       * Which page you are on, said rather than only shown — the one thing a
       * screen reader actually reads here. On the LEAF only, never on a group:
       * the group is where you are, the leaf is what you are on, and two
       * `aria-current`s in one nav is the sidebar contradicting itself.
       */
      aria-current={current ? 'page' : undefined}
      data-selected={!sub && selected ? 'true' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg text-sm transition-colors duration-150 focus-outline ${
        sub ? 'py-2 ps-4 pe-3' : 'px-3 py-2.5'
      } ${tone} ${collapsed ? 'justify-center px-0' : ''}`}
    >
      <Icon
        className={`shrink-0 transition-colors duration-150 ${sub ? 'h-4 w-4' : 'h-5 w-5'} ${
          marked ? SELECTED_ICON : IDLE_ICON
        }`}
        aria-hidden="true"
      />
      {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
      {!collapsed && badge ? <CountBadge count={badge} /> : null}
    </Link>
  );
}

/**
 * A main item and its pages, in the expanded sidebar and the phone drawer.
 *
 * ## Two controls in one row — the owner's call (25 Sep 2026)
 *
 * The NAME is a link to the section's main page — its first page this admin
 * can open: Clients to All clients, Finance to All transactions, Security to
 * the Audit log — and arriving there opens the list, because the list follows
 * the page. The ARROW is a button that only opens or closes the list, so a
 * section can still be looked into without leaving the page on screen.
 *
 * One click to each section's front door, where the header used to be a
 * button only (two clicks to anywhere) — and none of the daily queues that sit
 * second in a group (KYC review, Withdrawals, Applications) costs a detour
 * through the first page, which a header that ONLY navigated would impose.
 *
 * The row is one selectable surface (`data-selected` on the row), so the
 * highlight reads as one main item, not as two controls.
 */
function NavGroupPanel({
  group,
  open,
  selected,
  onToggle,
  activeHref,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  /** This main item is the sidebar's one selected row. */
  selected: boolean;
  onToggle: () => void;
  activeHref: string | null;
  badges: NavBadges;
  onNavigate: (href: string) => void;
}) {
  const Icon = group.icon;
  const panelId = `nav-group-${group.id}`;
  const label = t(group.label);
  /*
   * The section's main page: its first page this admin can open (NAV's
   * order). `visibleNav` drops a group with no page left, so there is one.
   */
  const home = group.items[0];
  if (!home) return null;
  /*
   * Only while CLOSED: open, the pages below carry their own counts, and the
   * sum beside them would say the same thing twice.
   */
  const waiting = open ? undefined : groupBadgeTotal(group, badges);

  return (
    <div>
      <div
        data-selected={selected ? 'true' : undefined}
        className={`group flex items-center rounded-lg text-sm transition-colors duration-150 ${
          selected ? SELECTED_ROW : IDLE_ROW
        }`}
      >
        <Link
          href={leafHref(home)}
          onNavigate={() => onNavigate(home.href)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 ps-3 pe-1 focus-outline"
        >
          <Icon
            className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
              selected ? SELECTED_ICON : IDLE_ICON
            }`}
            aria-hidden="true"
          />
          <span className="flex-1 truncate text-start">{label}</span>
        </Link>
        {/*
          Named for what it opens, starting with the section's name — "Finance
          pages, 5 waiting, collapsed" to a screen reader. The closed group's
          count rides HERE, not on the name: it says there is work inside, and
          this is the control that shows where (Deposits 2, Withdrawals 3); on
          the name it would have taken the operator to the main page instead,
          and read as "Finance 5, link". Its own hover is a shade stronger than
          the row's, so the pointer can see it is a second, separate target.
        */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            waiting
              ? t('nav.groupPagesWaiting', { group: label, count: String(waiting) })
              : t('nav.groupPages', { group: label })
          }
          className="me-1 flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 transition-colors duration-150 hover:bg-foreground/10 focus-outline"
        >
          {waiting ? <CountBadge count={waiting} /> : null}
          {/*
            `motion-slide`: the menu opening is STRUCTURAL motion, so it keeps
            its 300ms under "reduce motion", like the sidebar's own collapse
            (see globals.css). Without it the blanket reduced-motion rule makes
            the arrow and the list snap.
          */}
          <ChevronDown
            className={`motion-slide h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              open ? 'rotate-180 text-foreground' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>
      {/*
        ALWAYS MOUNTED, animated by its row height — mounting on open snaps,
        because there is nothing to transition FROM. A grid whose one row goes
        `0fr` → `1fr` animates to the content's real height without measuring
        it.

        Closed, it is `inert` AND `invisible`, and both are needed:
        - `inert` takes the links out of the tab order the moment it closes.
        - `invisible` (visibility: hidden) takes them out of the accessibility
          tree. `inert` alone does not do that for every consumer — Playwright's
          role engine ignores it, so a link folded to zero height still answered
          `getByRole('link', { name: /clients/i })` and won `.first()` over the
          visible one on the page.
        `visibility` is in the transition list, and it is a discrete property:
        it flips to visible at the START of opening and to hidden at the END of
        closing, so the fold is still seen.
      */}
      <div
        id={panelId}
        inert={!open}
        className={`motion-slide grid transition-[grid-template-rows,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* The guide line that ties the pages to their main item. */}
          <div className="relative ms-5 mt-1 space-y-0.5 border-s border-border ps-2">
            {group.items.map((item, index) => (
              <div
                key={item.href}
                className={`motion-slide transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                }`}
                /*
                 * Opening unfolds top to bottom; closing folds together. A
                 * shorter step than the portal's 40ms, because Finance has eight
                 * pages where the portal's one group has four, and the last row
                 * should not trail the arrow by half a second.
                 */
                style={{ transitionDelay: open ? `${40 + index * 25}ms` : '0ms' }}
              >
                <NavLink
                  item={item}
                  current={item.href === activeHref}
                  collapsed={false}
                  onNavigate={() => onNavigate(item.href)}
                  badge={badges[item.href]}
                  nested
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A main item on the collapsed 80px rail: one icon, opening its pages as a menu
 * beside it.
 *
 * The portal FLATTENS its one group into four icons on the rail. That does not
 * survive six groups: two dozen unlabelled icons in a column is a sidebar nobody
 * can read, which is the complaint this whole change answers. A menu keeps the rail
 * at seven rows and puts every page's NAME one click away.
 *
 * Click, not hover — a touch screen has no hover, and a menu that opens as the
 * pointer crosses the rail on its way somewhere else is a menu in the way. The
 * content is portalled (see `dropdown-menu.tsx`), so the sidebar's overflow
 * cannot clip it.
 */
function RailGroupMenu({
  group,
  selected,
  activeHref,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  /** Holds the page — the rail's one selected row. */
  selected: boolean;
  activeHref: string | null;
  badges: NavBadges;
  onNavigate: (href: string) => void;
}) {
  const Icon = group.icon;
  const label = t(group.label);
  const waiting = groupBadgeTotal(group, badges);
  /*
   * The dot is `aria-hidden`, so the count it stands for is SAID in the name —
   * otherwise a screen reader hears "Finance, button" over a queue of fourteen.
   */
  const name = waiting ? t('nav.groupWaiting', { group: label, count: String(waiting) }) : label;
  /*
   * The menu opens TOWARDS the page, and reads in the page's direction. The
   * rail sits on the inline START edge — the right-hand side under
   * `dir="rtl"` — and Radix places `side` physically. Radix also stamps its
   * own `dir` on the menu, defaulting to "ltr" with no provider, so without
   * the prop an Arabic console got a mirrored rail opening a left-to-right
   * menu. Both are read from the document rather than assumed.
   */
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const side = rtl ? 'left' : 'right';

  return (
    <DropdownMenu dir={rtl ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={name}
          title={name}
          data-selected={selected ? 'true' : undefined}
          className={`group relative flex w-full cursor-pointer items-center justify-center rounded-lg py-2.5 transition-colors duration-150 focus-outline ${
            selected ? SELECTED_ROW : IDLE_ROW
          }`}
        >
          <Icon
            className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
              selected ? SELECTED_ICON : IDLE_ICON
            }`}
            aria-hidden="true"
          />
          {/* A dot, not a number: 80px has no room for a count that means
              anything, and the menu it opens carries the counts. */}
          {waiting ? (
            <span
              className="absolute end-4 top-2 h-2 w-2 rounded-full bg-destructive"
              aria-hidden="true"
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" sideOffset={12} className="min-w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map((item) => {
          const ItemIcon = item.icon;
          const active = item.href === activeHref;
          const badge = badges[item.href];
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={leafHref(item)}
                onNavigate={() => onNavigate(item.href)}
                aria-current={active ? 'page' : undefined}
                className={active ? 'bg-primary/10 font-semibold text-foreground' : undefined}
              >
                <ItemIcon className={active ? 'text-link' : undefined} aria-hidden="true" />
                <span className="flex-1 truncate">{t(item.label)}</span>
                {badge ? <CountBadge count={badge} /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
