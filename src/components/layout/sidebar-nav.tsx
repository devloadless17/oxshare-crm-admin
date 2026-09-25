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
  isNavGroup,
  leafHref,
  type NavBadges,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
} from './navigation';

/**
 * The console's sidebar: main items that open onto their pages.
 *
 * Modelled on the portal's `sidebar-nav.tsx` — the same classes, the same
 * motion, the same rule that a group is a BUTTON and never a link — so the two
 * apps read as one product. It is not a twin file: this one carries counts,
 * permissions and six groups where the portal has one.
 *
 * ## One group open at a time, and it follows the page
 *
 * The owner's old CRM behaves this way and it is what he asked for. It also
 * keeps the menu short enough to show every main item without scrolling, which
 * is most of what "I know where things are" means.
 *
 * The open group is DERIVED, not synced in an effect:
 *
 *     open = choice made on this path ? that choice : the group holding the page
 *
 * so arriving anywhere — a link, the command palette, a notification, the back
 * button — renders the right group open on the first paint, and a click only
 * overrides it until the next navigation. An effect keyed on `pathname` would
 * paint the stale group for one frame and then move it under the pointer.
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
  const activeGroupId =
    entries.find(
      (entry): entry is NavGroup =>
        isNavGroup(entry) && entry.items.some((item) => item.href === activeHref),
    )?.id ?? null;

  const [choice, setChoice] = React.useState<{ path: string | null; open: string | null } | null>(
    null,
  );
  const openId = choice && choice.path === pathname ? choice.open : activeGroupId;

  return (
    <>
      {entries.map((entry) => {
        if (!isNavGroup(entry)) {
          return (
            <NavLink
              key={entry.href}
              item={entry}
              active={entry.href === activeHref}
              collapsed={collapsed}
              onNavigate={onNavigate}
              badge={badges[entry.href]}
            />
          );
        }

        if (collapsed) {
          return (
            <RailGroupMenu
              key={entry.id}
              group={entry}
              activeHref={activeHref}
              badges={badges}
              onNavigate={onNavigate}
            />
          );
        }

        const open = openId === entry.id;
        return (
          <NavGroupPanel
            key={entry.id}
            group={entry}
            open={open}
            onToggle={() => setChoice({ path: pathname, open: open ? null : entry.id })}
            activeHref={activeHref}
            badges={badges}
            onNavigate={onNavigate}
          />
        );
      })}
    </>
  );
}

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
 * One page. At the top level (Dashboard) the current one is a solid fill; as a
 * SUB-page it is a tint with its icon in the accent colour, so a group's header
 * and the page under it never read as two competing selections — "in Finance,
 * on Deposits".
 */
function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
  badge,
  nested = false,
}: {
  item: NavLeaf;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badge?: number;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const sub = nested && !collapsed;
  const tone = active
    ? sub
      ? 'bg-primary/10 font-semibold text-foreground'
      : 'bg-primary font-semibold text-primary-foreground'
    : 'text-muted-foreground hover:bg-accent hover:text-foreground';

  return (
    <Link
      href={leafHref(item)}
      onClick={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      /*
       * Which page you are on, said rather than only shown — the one thing a
       * screen reader actually reads here. On the LEAF only, never on a group:
       * the group is where you are, the leaf is what you are on, and two
       * `aria-current`s in one nav is the sidebar contradicting itself.
       */
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-outline ${
        sub ? 'py-2 ps-4 pe-3' : 'px-3 py-2.5'
      } ${tone} ${collapsed ? 'justify-center px-0' : ''}`}
    >
      <Icon
        className={`shrink-0 transition-colors duration-150 ${sub ? 'h-4 w-4' : 'h-5 w-5'} ${
          active
            ? sub
              ? 'text-link'
              : 'text-primary-foreground'
            : 'text-muted-foreground group-hover:text-link'
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
 * The header is a BUTTON with `aria-expanded`: the group is not a place, and a
 * header that navigated on the same click that opens it would take the operator
 * somewhere they did not choose.
 */
function NavGroupPanel({
  group,
  open,
  onToggle,
  activeHref,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  activeHref: string | null;
  badges: NavBadges;
  onNavigate: () => void;
}) {
  const Icon = group.icon;
  const containsActive = group.items.some((item) => item.href === activeHref);
  const panelId = `nav-group-${group.id}`;
  /*
   * Only while CLOSED: open, the pages below carry their own counts, and the
   * sum beside them would say the same thing twice.
   */
  const waiting = open ? undefined : groupBadgeTotal(group, badges);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-outline ${
          containsActive
            ? 'bg-accent font-semibold text-foreground hover:bg-accent/80'
            : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <Icon
          className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
            containsActive ? 'text-link' : 'text-muted-foreground group-hover:text-link'
          }`}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-start">{t(group.label)}</span>
        {waiting ? <CountBadge count={waiting} /> : null}
        {/*
          `motion-slide`: the menu opening is STRUCTURAL motion, so it keeps its
          300ms under "reduce motion", like the sidebar's own collapse (see
          globals.css). Without it the blanket reduced-motion rule makes the
          arrow and the list snap.
        */}
        <ChevronDown
          className={`motion-slide h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'rotate-180 text-foreground' : 'rotate-0'
          }`}
          aria-hidden="true"
        />
      </button>
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
                  active={item.href === activeHref}
                  collapsed={false}
                  onNavigate={onNavigate}
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
  activeHref,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  activeHref: string | null;
  badges: NavBadges;
  onNavigate: () => void;
}) {
  const Icon = group.icon;
  const label = t(group.label);
  const containsActive = group.items.some((item) => item.href === activeHref);
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
          className={`group relative flex w-full cursor-pointer items-center justify-center rounded-lg py-2.5 transition-colors duration-150 focus-outline ${
            containsActive
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Icon
            className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
              containsActive ? 'text-link' : 'text-muted-foreground group-hover:text-link'
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
                onClick={onNavigate}
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
