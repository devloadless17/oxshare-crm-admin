'use client';

import type { Currency } from '@/lib/api/admin';
import { TRANSACTION_KINDS, TRANSACTION_STATES } from '@/lib/api/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { DateRangeFilter } from '@/components/financial/date-range-filter';
import { kindLabel, stateLabel } from '@/components/financial/transaction-badges';
import { t } from '@/lib/i18n';

/**
 * The Financial page's secondary filter row — kind, state, currency and the
 * date range. (Direction is the PRIMARY read and lives on the QueueToolbar
 * tabs beside the search, not here.)
 *
 * Dumb by design: it renders the URL's current values and reports changes;
 * the page owns the URL write, and writes `page: undefined` with every change
 * (the rule every queue screen follows — a filter that keeps the reader on
 * page 4 of a two-page result renders as an empty list).
 */
export function TransactionFilters({
  kind,
  state,
  currency,
  from,
  to,
  attention,
  currencies,
  isFiltered,
  onChange,
  onClear,
}: {
  kind: string;
  state: string;
  currency: string;
  from: string;
  to: string;
  /** Only payments flagged for a person to reconcile. */
  attention: boolean;
  /** From the currencies endpoint, never from the rows on screen. */
  currencies: Currency[];
  isFiltered: boolean;
  onChange: (patch: Record<string, string | undefined>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <Select
        value={kind || 'all'}
        onValueChange={(value) => onChange({ kind: value === 'all' ? undefined : value })}
      >
        <SelectTrigger className="h-9 w-44" aria-label={t('financial.filterKind')}>
          <SelectValue placeholder={t('financial.kindAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('financial.kindAll')}</SelectItem>
          {TRANSACTION_KINDS.map((value) => (
            <SelectItem key={value} value={value}>
              {kindLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={state || 'all'}
        onValueChange={(value) => onChange({ state: value === 'all' ? undefined : value })}
      >
        <SelectTrigger className="h-9 w-40" aria-label={t('financial.filterState')}>
          <SelectValue placeholder={t('financial.stateAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('financial.stateAll')}</SelectItem>
          {TRANSACTION_STATES.map((value) => (
            <SelectItem key={value} value={value}>
              {stateLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currency || 'all'}
        onValueChange={(value) => onChange({ currency: value === 'all' ? undefined : value })}
      >
        <SelectTrigger className="h-9 w-40" aria-label={t('financial.filterCurrency')}>
          <SelectValue placeholder={t('financial.filterCurrencyAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('financial.filterCurrencyAll')}</SelectItem>
          {currencies.map((entry) => (
            <SelectItem key={entry.code} value={entry.code}>
              {entry.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateRangeFilter
        from={from}
        to={to}
        onChange={(next) => onChange({ from: next.from, to: next.to })}
      />

      {/*
        A toggle, not a select: "only what needs a person" is on or off. The
        same filter an attention task's link lands on, so an operator who
        arrived from the bell can see why the list is short — and undo it.
      */}
      <button
        type="button"
        aria-pressed={attention}
        title={t('attention.filterTitle')}
        onClick={() => onChange({ attention: attention ? undefined : 'true' })}
        className={`focus-outline inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
          attention
            ? 'border-warning/40 bg-warning/10 text-warning'
            : 'border-input bg-card text-foreground hover:bg-muted'
        }`}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {t('attention.filter')}
      </button>

      {isFiltered && (
        <button
          type="button"
          onClick={onClear}
          className="focus-outline h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
        >
          {t('financial.clearFilters')}
        </button>
      )}
    </div>
  );
}
