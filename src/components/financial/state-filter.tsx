'use client';

import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TRANSACTION_STATES, type TransactionState } from '@/lib/api/admin';
import { stateLabel } from '@/components/financial/transaction-badges';
import { t } from '@/lib/i18n';

/**
 * Filter movements by STATE — several at once (backend: `?state=a,b`, audit R4-G3), e.g. every
 * movement still pending or approved. The same shape as the method filter beside it.
 */
export function StateFilter({
  selected,
  onChange,
}: {
  selected: TransactionState[];
  onChange: (next: TransactionState[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(selected);
  const label =
    selected.length === 0
      ? t('financial.stateAll')
      : selected.length === 1
        ? stateLabel(selected[0] as TransactionState)
        : t('financial.stateCount', { count: selected.length });
  const toggle = (state: TransactionState, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(state);
    else next.delete(state);
    // In the catalogue's order, so a URL reads the same however it was clicked.
    onChange(TRANSACTION_STATES.filter((value) => next.has(value)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={t('financial.filterState')}
        className={`focus-outline inline-flex h-9 max-w-48 cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm active:!scale-100 ${
          selected.length ? 'border-primary/40 bg-primary/5' : 'border-input bg-card'
        }`}
      >
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 [--tw-enter-scale:1] [--tw-exit-scale:1]" align="start">
        {TRANSACTION_STATES.map((state) => (
          <label
            key={state}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={chosen.has(state)}
              onCheckedChange={(checked) => toggle(state, checked === true)}
            />
            <span>{stateLabel(state)}</span>
          </label>
        ))}
        {selected.length > 0 && (
          <div className="mt-1 flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className="focus-outline rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
            >
              {t('financial.methodClear')}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
