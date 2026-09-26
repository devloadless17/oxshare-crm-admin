'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * An accessible tab strip.
 *
 * NOT a twin file and deliberately not added to `scripts/check-twins.sh` — the
 * portal has no tabbed screen, and listing a file the sibling does not have
 * would make the twin check report a difference that is not a divergence.
 *
 * ── Why this is hand-written rather than `@radix-ui/react-tabs` ────────────
 *
 * `select.tsx` and `label.tsx` wrap Radix because those primitives are genuinely
 * hard: portals, focus traps, collision detection. A tab strip is a roving
 * tabindex and six ARIA attributes. Adding a dependency for it would be the
 * larger change, and the parts that matter are pinned in `tabs.test.tsx`.
 *
 * ── Controlled only ────────────────────────────────────────────────────────
 *
 * There is no internal state and no `defaultValue`. The settings screen keeps
 * the active tab in the URL so a tab is linkable and survives a refresh, and a
 * component holding its own copy would be a second source of truth for the same
 * fact — the two disagree the moment someone hits Back.
 *
 * ── Panels mount only when selected ────────────────────────────────────────
 *
 * `TabPanel` renders nothing when it is not active, rather than hiding it with
 * CSS. Each settings panel owns its own query, and rendering all four would fire
 * four requests on a screen where the operator is going to read one — including
 * the SMTP one, which 403s for every non-master admin and would light up the
 * console on a screen they are entitled to use.
 */

export interface TabDefinition {
  /** Stable machine key. It goes in the URL, so never rename one casually. */
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  idPrefix = 'tabs',
  className,
}: {
  tabs: TabDefinition[];
  value: string;
  onValueChange: (value: string) => void;
  /** Namespaces the generated ids, so two strips on one page do not collide. */
  idPrefix?: string;
  className?: string;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  /**
   * Arrow keys move between tabs, as the ARIA pattern requires.
   *
   * Focus MOVES with the selection (`.focus()` on the newly selected tab)
   * because the roving tabindex below makes the previously focused tab
   * unreachable by Tab once it is no longer selected — without this, an arrow
   * press would leave focus on an element the browser has just taken out of the
   * tab order, and the next Tab would jump to the top of the document.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.value === value);
    if (index === -1) return;

    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;

    const target = tabs[next];
    if (!target) return;

    event.preventDefault();
    onValueChange(target.value);
    refs.current[target.value]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      /*
       * Scrolls rather than wraps on a narrow viewport. A wrapped tab strip
       * changes height as the window resizes and pushes the panel around; the
       * admin console is used on laptops where four tabs plus icons is close to
       * the fold.
       */
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border -mb-px',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[tab.value] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            // Only the SELECTED tab's panel is in the page (`TabPanel` renders
            // nothing for the others), and `aria-controls` must name an element
            // that exists — axe flagged every inactive tab (26 Sep 2026).
            aria-controls={selected ? `${idPrefix}-panel-${tab.value}` : undefined}
            // Roving tabindex: one stop for the whole strip, then arrows within.
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap',
              'border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'motion-reduce:transition-none',
              selected
                ? 'border-link text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  value,
  activeValue,
  idPrefix = 'tabs',
  className,
  children,
}: {
  value: string;
  activeValue: string;
  idPrefix?: string;
  /**
   * For a panel that must FILL the page rather than fit its content.
   *
   * A panel is a flex item of whatever holds the strip, and a page giving its
   * empty state the full height needs the chain unbroken from `<main>` down —
   * so a caller passes `flex min-h-0 flex-1 flex-col` here. Without it the
   * panel is content-height and a `flex-1` child inside it has nothing to fill.
   */
  className?: string;
  children: React.ReactNode;
}) {
  if (value !== activeValue) return null;

  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      /*
       * Focusable, because the panel is the thing a keyboard user arrives at
       * after the tab strip and it may contain no focusable element at all (a
       * loading state, an error card). Without this the ARIA pattern strands
       * them on the strip.
       */
      tabIndex={0}
      className={cn('pt-6 focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}
