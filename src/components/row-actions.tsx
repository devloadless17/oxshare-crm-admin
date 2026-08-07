'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';

/**
 * The row-actions menu — one trigger per row, everywhere.
 *
 * This generalises the menu that `rbac/role-row.tsx` and `ib/partner-row.tsx`
 * each grew independently, and it records the reasoning both of them had:
 *
 *  - A row of always-visible buttons puts Delete permanently one mis-click from
 *    Edit, repeated down the list. A menu makes the consequential ones take two
 *    deliberate actions.
 *  - The confirmation dialog belongs to the PAGE, not to the row. A dialog
 *    rendered per row mounts one copy per record and unmounts mid-transition
 *    when the list refetches after the mutation it was confirming.
 *
 * ## No actions means no trigger
 *
 * When `items` is empty — every action filtered out by permissions — this
 * renders nothing at all rather than a disabled trigger. A control that only
 * ever explains why it cannot be used is worse than its absence, and an empty
 * menu is worse still because it costs a click to discover that. Callers that
 * hide the whole column when nobody can act on any row should check that
 * themselves; this handles the per-row case.
 *
 * ## `busy` disables the trigger, not the items
 *
 * The menu is closed while a mutation runs, so disabling items would be
 * invisible. Disabling the trigger and swapping in a spinner is the state the
 * operator can actually see, and it prevents queueing a second mutation on a
 * row whose first one has not landed.
 */
export interface RowAction {
  /** Label shown in the menu. Already translated. */
  label: string;
  /** Lucide icon component, rendered at the item's leading edge. */
  icon?: React.ElementType;
  /** Click handler. Mutually exclusive with `href`. */
  onSelect?: () => void;
  /** Renders the item as a link instead of a button. Mutually exclusive with `onSelect`. */
  href?: string;
  /** Red styling, for actions that destroy or stop something. */
  destructive?: boolean;
  /** Draws a divider ABOVE this item, to group what follows. */
  separatorBefore?: boolean;
  disabled?: boolean;
}

export function RowActions({
  items,
  busy = false,
  label,
  align = 'end',
  menuClassName = 'w-48',
}: {
  items: RowAction[];
  busy?: boolean;
  /** Accessible name for the trigger — name the ROW, not just "actions". */
  label: string;
  align?: 'start' | 'center' | 'end';
  menuClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label={label}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className={menuClassName}>
        {items.map((item, idx) => {
          const Icon = item.icon;
          const destructiveClass = item.destructive
            ? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
            : undefined;

          return (
            <React.Fragment key={`${item.label}-${idx}`}>
              {/* Never a leading separator — a divider above the first item
                  draws a line against the menu's own top edge. */}
              {item.separatorBefore && idx > 0 && <DropdownMenuSeparator />}

              {item.href ? (
                <DropdownMenuItem asChild disabled={item.disabled} className={destructiveClass}>
                  <Link href={item.href}>
                    {Icon && <Icon aria-hidden="true" />}
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={item.onSelect}
                  disabled={item.disabled}
                  className={destructiveClass}
                >
                  {Icon && <Icon aria-hidden="true" />}
                  <span>{item.label}</span>
                </DropdownMenuItem>
              )}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The column definition every table's actions column should use.
 *
 * Pinned, unsortable, narrow, and right-aligned in one place — so a new table
 * gets the same actions affordance without restating four properties that are
 * easy to get subtly wrong (a sortable Actions column turns its header into a
 * sort button on a key the API never heard of).
 */
export function actionsColumn<T>(
  cell: (row: T) => React.ReactNode,
  header: string = t('table.colActions'),
) {
  return {
    header,
    cell,
    sortable: false as const,
    sticky: 'end' as const,
    align: 'right' as const,
    headerClassName: 'w-12',
    cellClassName: 'w-12',
  };
}
