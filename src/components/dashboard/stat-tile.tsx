'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * One headline number.
 *
 * The standard's stat-tile contract: a sentence-case label, a value, and an
 * optional line of context. There is no sparkline and no delta on these, and
 * that is a decision rather than an omission — the endpoint returns a counter,
 * not a history, so a trend line here would either be invented or would need a
 * second request per tile. The trends that DO exist are the charts below.
 *
 * The value uses proportional figures, not `tabular-nums`: equal-width digits
 * make a standalone number look loose at this size. `tabular` is for columns.
 *
 * A tile is a LINK when there is somewhere to act on it. A count of pending
 * withdrawals that does not reach the queue is a number on a screen.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  href,
  loading = false,
  accent = false,
}: {
  label: string;
  /**
   * Already formatted — a string, so a monetary tile can pass `formatMoney`
   * output and a count can pass its own separator formatting. This component
   * never formats and never converts.
   */
  value: string;
  hint: string;
  icon: LucideIcon;
  href?: string;
  loading?: boolean;
  /**
   * Draw attention to a number that means work is waiting.
   *
   * The accent is the app's brand amber as a hairline and a tinted icon, not a
   * status colour: "twelve things in the queue" is not an error state, and
   * spending a reserved status colour on it would make a real alarm mean less.
   */
  accent?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <Icon
          className={`h-4 w-4 shrink-0 ${accent ? 'text-link' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />
      </div>
      <p className="text-2xl font-semibold mt-2 text-foreground">
        {loading ? <Spinner size="md" className="text-muted-foreground" /> : value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>
      {loading && <span className="sr-only">{t('common.loading')}</span>}
    </>
  );

  const shell = `rounded-xl border bg-card p-4 shadow-xs block ${
    accent ? 'border-primary/40' : 'border-border'
  }`;

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={`${shell} hover:bg-accent/40 focus-outline`}>
      {body}
    </Link>
  );
}
