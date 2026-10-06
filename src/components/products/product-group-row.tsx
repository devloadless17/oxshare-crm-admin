'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LimitInput } from '@/components/currencies/limit-input';
import { t } from '@/lib/i18n';

/** A group the form is holding, whether or not the server has it yet. */
export interface StagedGroup {
  /** The row id, absent while the group is only staged in this form. */
  id?: string;
  environment: 'live' | 'demo';
  mt5Group: string;
  currency: string;
  /**
   * The minimum per transfer, AS TYPED — `''` is none (backend 0201). A string
   * end to end (§6.1); the save hook turns `''` into `null` on the wire.
   */
  minDeposit: string;
}

/**
 * One MT5 group on the product form, with its minimum deposit.
 *
 * The minimum is the GROUP's because a group is one currency of the product and
 * the platform has no exchange rates: "100" means 100 of this group's currency.
 * Live groups only — demo accounts are never funded from the wallet, and the
 * API refuses a minimum on a demo group.
 */
export function ProductGroupRow({
  group,
  index,
  onRemove,
  onMinDepositChange,
}: {
  group: StagedGroup;
  /** Gives the minimum box an id; a group path carries backslashes. */
  index: number;
  onRemove: () => void;
  onMinDepositChange: (value: string) => void;
}) {
  return (
    <li className="space-y-2 rounded-lg border border-border px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={group.environment === 'live' ? 'default' : 'tag'}>
          {group.environment === 'live' ? t('products.live') : t('products.demo')}
        </Badge>
        <span className="font-mono">{group.mt5Group}</span>
        <span className="text-muted-foreground">{group.currency || '—'}</span>
        {/* Staged rows say so. Detaching one that is already saved takes effect
          on Save, and the operator should be able to tell which of the two a
          row is. */}
        {group.id === undefined && (
          <span className="text-[10px] text-muted-foreground">{t('products.pending')}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('products.detach')}
          className="ml-auto cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-outline"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {group.environment === 'live' && (
        <LimitInput
          id={`product-group-min-deposit-${index}`}
          label={`${t('products.minDeposit')} · ${group.currency || '—'}`}
          value={group.minDeposit}
          onChange={onMinDepositChange}
          currency={group.currency}
          hint={t('products.minDepositHint')}
          placeholder={t('products.minDepositNone')}
        />
      )}
    </li>
  );
}
