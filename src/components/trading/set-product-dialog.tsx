'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Mt5GroupRow, TradingAccountRow } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { toastSuccess } from '@/lib/toast';

const NONE = '__none__';

/**
 * SET THE PRODUCT an account's trades pay under (owner, 29 Sep 2026) — for an
 * account linked or opened with none, or under the wrong one.
 *
 * The choices are the products that SELL the account's MT5 group, read from the
 * mirrored groups list (no live MT5 call). The server refuses anything else. It
 * applies to trades not yet decided: accruals already written keep the terms
 * that priced them.
 */
export function SetProductDialog({
  account,
  onClose,
}: {
  account: TradingAccountRow | null;
  onClose: () => void;
}) {
  return (
    <Modal open={account !== null} onClose={onClose} title={t('setProduct.title')}>
      {account && <SetProductForm key={account.id} account={account} onClose={onClose} />}
    </Modal>
  );
}

function SetProductForm({ account, onClose }: { account: TradingAccountRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const groups = useResource<Mt5GroupRow[]>(keys.mt5Groups.all(), (signal) =>
    api.admin.getMt5GroupMirror(signal),
  );
  const group = (account.mt5Group ?? '').toLowerCase();
  const sellers = groups.data?.find((row) => row.name.toLowerCase() === group)?.products ?? [];
  const current = sellers.find((product) => product.name === account.product)?.id ?? NONE;
  const [choice, setChoice] = React.useState<string | null>(null);
  const value = choice ?? current;
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.admin.setTradingAccountProduct(account.id, value === NONE ? null : value);
      toastSuccess(t('setProduct.saved', { login: account.login ?? account.id }));
      await queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('setProduct.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('setProduct.intro', {
          login: account.login ?? '—',
          group: account.mt5Group ?? '—',
        })}
      </p>
      {groups.status === 'ready' && sellers.length === 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {t('setProduct.noSellers', { group: account.mt5Group ?? '—' })}
        </p>
      ) : (
        <Select value={value} onValueChange={setChoice}>
          <SelectTrigger aria-label={t('setProduct.label')}>
            <SelectValue placeholder={t('setProduct.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('setProduct.none')}</SelectItem>
            {sellers.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-[11px] text-muted-foreground">{t('setProduct.hint')}</p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => void save()}
          loading={saving}
          disabled={sellers.length === 0 || value === current}
        >
          {t('setProduct.save')}
        </Button>
      </div>
    </div>
  );
}
