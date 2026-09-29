'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { adminApi, type CreatedMt5Account, type Mt5Group, type Mt5GroupRow } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Open an MT5 trading account for a client.
 *
 ## The passwords are NOT shown here, and that is the point
 *
 * An earlier version of this dialog displayed them, with copy buttons and a
 * warning that they could not be recovered. That was the wrong design however
 * carefully it was built: the account's owner is the only person who should
 * ever hold its trading password, and this screen is read by a member of staff.
 *
 * They are emailed to the client instead. This dialog confirms the account and
 * says where the credentials went, which is the part an operator actually needs
 * — "did that work, and does the client have what they need".
 *
 * ## The group list is fetched, never hardcoded
 *
 * Groups are the broker's configuration and change without telling us. A
 * hardcoded list opens accounts in a group that no longer exists, and MT5
 * refuses that with an error an operator cannot act on.
 *
 * ## `environment` is asked, not inferred
 *
 * It would be tempting to read "demo" out of the group path. Broker naming is
 * theirs — `demo\` is not a guarantee — and getting it wrong lets a real wallet
 * fund a practice account. `TransfersService` refuses that outright, but only
 * if this field is correct.
 */
export function OpenAccountModal({
  open,
  onClose,
  userId,
  clientLabel,
}: {
  open: boolean;
  onClose: () => void;
  userId: ClientRef;
  clientLabel: string;
}) {
  const queryClient = useQueryClient();
  const [group, setGroup] = React.useState('');
  /** The product to open under — asked only when the group is sold by several. */
  const [productId, setProductId] = React.useState('');
  const [environment, setEnvironment] = React.useState<'live' | 'demo'>('live');
  const [leverage, setLeverage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedMt5Account | null>(null);

  const groups = useResource<Mt5Group[]>(
    keys.tradingAccounts.mt5Groups(),
    (signal) => adminApi.getMt5Groups(signal),
    // Only while the dialog is open: this hits the broker's server, and a
    // background refetch on a closed dialog is a call nobody asked for.
    { enabled: open && created === null },
  );

  /*
   * Which products sell each group, from the synced mirror (`trading.view`,
   * like this dialog's own screen — the product catalogue would need
   * `settings.view`, which an operator opening accounts may not hold).
   *
   * A group may back SEVERAL products since backend 0142, and the product
   * decides the account's commission type — so when the chosen group has more
   * than one, the operator picks; the API refuses to guess.
   */
  const mirror = useResource<Mt5GroupRow[]>(
    keys.mt5Groups.all(),
    (signal) => adminApi.getMt5GroupMirror(signal),
    { enabled: open && created === null },
  );
  const sellers =
    mirror.data?.find((row) => row.name.toLowerCase() === group.toLowerCase())?.products ?? [];
  const mustChooseProduct = sellers.length > 1;

  const create = useMutation({
    mutationFn: () =>
      adminApi.createTradingAccount({
        userId: Number(userId),
        group,
        ...(mustChooseProduct && productId ? { productId } : {}),
        environment,
        // Omitted means "the group's default", which is a real and common
        // choice — not the same as 0, which MT5 would reject.
        ...(leverage.trim() ? { leverage: Number.parseInt(leverage, 10) } : {}),
      }),
    onSuccess: (account) => {
      setError(null);
      setCreated(account);
      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
      // The client's profile lists their accounts, and the dashboard counts them.
      void queryClient.invalidateQueries({ queryKey: keys.clients.all() });
      void queryClient.invalidateQueries({ queryKey: keys.stats.all() });
      toastSuccess(t('tradingAccounts.opened', { login: account.login }));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('tradingAccounts.openFailed'))),
  });

  const reset = () => {
    setGroup('');
    setProductId('');
    setEnvironment('live');
    setLeverage('');
    setError(null);
    setCreated(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  if (created) {
    return (
      <Modal open={open} onClose={close} title={t('tradingAccounts.openedTitle')}>
        <Opened account={created} onDone={close} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title={t('tradingAccounts.openTitle')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!group) return;
          if (mustChooseProduct && !productId) return;
          create.mutate();
        }}
      >
        <p className="text-xs text-muted-foreground">
          {t('tradingAccounts.openFor', { client: clientLabel })}
        </p>

        <AsyncBoundary
          status={groups.status}
          label={t('tradingAccounts.groupsLoading')}
          endpoints={['GET /admin/mt5/groups']}
          onRetry={groups.refetch}
          errorMessage={t('tradingAccounts.groupsFailed')}
          error={groups.error}
        >
          <div className="space-y-1.5">
            <Label htmlFor="mt5-group" className="text-xs">
              {t('tradingAccounts.fieldGroup')}
            </Label>
            <Select
              value={group}
              onValueChange={(value) => {
                setGroup(value);
                // A product chosen for the previous group may not sell this one.
                setProductId('');
                setError(null);
              }}
            >
              <SelectTrigger id="mt5-group" className="h-9 w-full text-xs">
                <SelectValue placeholder={t('tradingAccounts.chooseGroup')} />
              </SelectTrigger>
              <SelectContent>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.name} value={g.name}>
                    {g.name} · {g.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groups.data?.length === 0 && (
              /*
               * A real state worth naming rather than an empty dropdown. The
               * manager account only sees the groups the broker has granted it,
               * and "no groups" means a permissions gap on their side — not a
               * bug here, and not something retrying will fix.
               */
              <p className="text-[11px] text-warning">{t('tradingAccounts.noGroups')}</p>
            )}
          </div>
        </AsyncBoundary>

        {/*
          Only when the chosen group is sold by more than one product. The
          product decides the account's commission type, so the operator states
          it; with one product (or none) there is nothing to choose.
        */}
        {mustChooseProduct && (
          <div className="space-y-1.5">
            <Label htmlFor="mt5-product" className="text-xs">
              {t('tradingAccounts.fieldProduct')}
            </Label>
            <Select
              value={productId}
              onValueChange={(value) => {
                setProductId(value);
                setError(null);
              }}
            >
              <SelectTrigger id="mt5-product" className="h-9 w-full text-xs">
                <SelectValue placeholder={t('tradingAccounts.chooseProduct')} />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{t('tradingAccounts.productHint')}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mt5-environment" className="text-xs">
              {t('tradingAccounts.fieldEnvironment')}
            </Label>
            <Select
              value={environment}
              onValueChange={(value) => setEnvironment(value as 'live' | 'demo')}
            >
              <SelectTrigger id="mt5-environment" className="h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">{t('tradingAccounts.envLiveOption')}</SelectItem>
                <SelectItem value="demo">{t('tradingAccounts.envDemoOption')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t('tradingAccounts.environmentHint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt5-leverage" className="text-xs">
              {t('tradingAccounts.fieldLeverage')}
            </Label>
            <Input
              id="mt5-leverage"
              inputMode="numeric"
              placeholder={t('tradingAccounts.leveragePlaceholder')}
              value={leverage}
              onChange={(e) => setLeverage(e.target.value.replace(/[^\d]/g, ''))}
            />
            <p className="text-[11px] text-muted-foreground">{t('tradingAccounts.leverageHint')}</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={create.isPending}
            disabled={!group || (mustChooseProduct && !productId)}
          >
            {create.isPending ? t('tradingAccounts.opening') : t('tradingAccounts.open')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * What an operator needs after the account exists.
 *
 * The login and its settings, and confirmation that the credentials reached the
 * client. No passwords — see the note at the top of this file.
 */
function Opened({ account, onDone }: { account: CreatedMt5Account; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
        <MailCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-foreground">
          {t('tradingAccounts.credentialsEmailed', { email: account.credentialsSentTo })}
        </p>
      </div>

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <Fact label={t('tradingAccounts.colLogin')} value={account.login} mono />
        <Fact label={t('tradingAccounts.fieldGroup')} value={account.group} />
        <Fact label={t('tradingAccounts.colCurrency')} value={account.currency} />
        <Fact label={t('tradingAccounts.fieldLeverage')} value={`1:${account.leverage}`} />
      </dl>

      {/*
        Said plainly, because it changes what an operator does when a client
        calls saying the mail never arrived. There is no copy to resend — the
        answer is a password reset, not a lookup.
      */}
      <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {t('tradingAccounts.credentialsNoCopy')}
      </p>

      <div className="flex justify-end pt-1">
        <Button type="button" size="sm" onClick={onDone}>
          {t('tradingAccounts.openedDone')}
        </Button>
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`truncate font-medium text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
