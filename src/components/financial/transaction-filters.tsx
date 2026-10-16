'use client';

import type { Currency } from '@/lib/api/admin';
import { MOVEMENT_TYPES, type MovementType, type TransactionState } from '@/lib/api/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { DateRangePicker } from '@/components/date-range-picker';
import { StateFilter } from '@/components/financial/state-filter';
import { AmountRangeFilter } from '@/components/financial/amount-range-filter';
import { MethodFilter, type MethodOption } from '@/components/financial/method-filter';
import type { DateRangeState } from '@/hooks/use-date-range';
import { typeLabel } from '@/components/movements/movement-vocabulary';
import { t } from '@/lib/i18n';

/**
 * The Financial page's secondary filter row — kind, state, currency, the
 * period and the payment method. (Direction is the PRIMARY read and lives on the QueueToolbar
 * tabs beside the search, not here.)
 *
 * Dumb by design: it renders the URL's current values and reports changes;
 * the page owns the URL write, and writes `page: undefined` with every change
 * (the rule every queue screen follows — a filter that keeps the reader on
 * page 4 of a two-page result renders as an empty list).
 */
export function TransactionFilters({
  type,
  types = MOVEMENT_TYPES,
  states,
  amountMin = '',
  amountMax = '',
  currency,
  period,
  periodBy = 'created',
  methods,
  methodOptions,
  attention,
  currencies,
  isFiltered,
  onChange,
  onClear,
}: {
  /** The accounting type chosen within the active tab (`movement-type.ts`), or ''. */
  type: string;
  /** The types the active tab holds — the select offers only these. */
  types?: readonly MovementType[];
  /** The chosen states, several at once (audit R4-G3). */
  states: TransactionState[];
  /** The amount range, as the URL holds it. */
  amountMin?: string;
  amountMax?: string;
  currency: string;
  /** The period — `hooks/use-date-range.ts` owns its URL write. */
  period: DateRangeState;
  /**
   * Which date the period reads (backend 0231): when the movement was CREATED (the default, the
   * daily desk view) or when it SETTLED (month-end: a closed month's figures never move).
   */
  periodBy?: 'created' | 'settled';
  /** Selected payment method keys. */
  methods: string[];
  /** Every method the reader may filter by; empty hides the control. */
  methodOptions: MethodOption[];
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
        value={type || 'all'}
        onValueChange={(value) => onChange({ type: value === 'all' ? undefined : value })}
      >
        <SelectTrigger className="h-9 w-48" aria-label={t('movement.filterType')}>
          <SelectValue placeholder={t('movement.typeAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('movement.typeAll')}</SelectItem>
          {types.map((value) => (
            <SelectItem key={value} value={value}>
              {typeLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <StateFilter
        selected={states}
        onChange={(next) => onChange({ state: next.length ? next.join(',') : undefined })}
      />

      <AmountRangeFilter
        key={`${amountMin}|${amountMax}`}
        min={amountMin}
        max={amountMax}
        onChange={onChange}
      />

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

      <Select
        value={periodBy}
        onValueChange={(value) =>
          onChange({ periodBy: value === 'settled' ? 'settled' : undefined })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[9rem]" aria-label={t('financial.periodBy')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created">{t('financial.periodByCreated')}</SelectItem>
          <SelectItem value="settled">{t('financial.periodBySettled')}</SelectItem>
        </SelectContent>
      </Select>

      <DateRangePicker
        choice={period.choice}
        custom={period.custom}
        defaultChoice={period.defaultChoice}
        onChange={period.set}
      />

      {methodOptions.length > 0 && (
        <MethodFilter
          options={methodOptions}
          selected={methods}
          onChange={(next) => onChange({ method: next.length ? next.join(',') : undefined })}
        />
      )}

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
