'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, TriangleAlert } from 'lucide-react';
import { adminApi, type CreatedMt5Account, type Mt5Group } from '@/lib/api/admin';
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

/**
 * Open an MT5 trading account for a client.
 *
 * ## Two screens, because the second one cannot be reopened
 *
 * The form, and then the credentials. MT5 returns the master and investor
 * passwords exactly once and the API stores neither — the same contract as an
 * API key. Closing this dialog is therefore destructive in a way a form dialog
 * normally is not, which is why the second step has no overlay dismissal and a
 * button that says what is about to be lost.
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
  userId: string;
  clientLabel: string;
}) {
  const queryClient = useQueryClient();
  const [group, setGroup] = React.useState('');
  const [environment, setEnvironment] = React.useState<'live' | 'demo'>('live');
  const [leverage, setLeverage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedMt5Account | null>(null);

  const groups = useResource<Mt5Group[]>(
    ['admin', 'mt5-groups'],
    (signal) => adminApi.getMt5Groups(signal),
    // Only while the dialog is open: this hits the broker's server, and a
    // background refetch on a closed dialog is a call nobody asked for.
    { enabled: open && created === null },
  );

  const create = useMutation({
    mutationFn: () =>
      adminApi.createTradingAccount({
        userId,
        group,
        environment,
        // Omitted means "the group's default", which is a real and common
        // choice — not the same as 0, which MT5 would reject.
        ...(leverage.trim() ? { leverage: Number.parseInt(leverage, 10) } : {}),
      }),
    onSuccess: (account) => {
      setError(null);
      setCreated(account);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'trading-accounts'] });
      toastSuccess(t('tradingAccounts.opened', { login: account.login }));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('tradingAccounts.openFailed'))),
  });

  const reset = () => {
    setGroup('');
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
      <Modal
        open={open}
        // No dismissal by overlay or Escape. The passwords cannot be recovered,
        // so leaving has to be a decision rather than a stray click.
        onClose={() => undefined}
        title={t('tradingAccounts.credentialsTitle')}
      >
        <Credentials account={created} onDone={close} />
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
          errorMessage={apiErrorMessage(groups.error, t('tradingAccounts.groupsFailed'))}
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
          <Button type="submit" size="sm" disabled={!group || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {create.isPending ? t('tradingAccounts.opening') : t('tradingAccounts.open')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The one and only sight of the passwords.
 *
 * Copy buttons rather than expecting them to be transcribed: these are
 * fourteen random characters including symbols, and a mistyped master password
 * locks a client out of an account that was just created for them.
 */
function Credentials({ account, onDone }: { account: CreatedMt5Account; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-foreground">
          {t('tradingAccounts.credentialsWarning')}
        </p>
      </div>

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <Fact label={t('tradingAccounts.colLogin')} value={account.login} mono />
        <Fact label={t('tradingAccounts.fieldGroup')} value={account.group} />
        <Fact label={t('tradingAccounts.colCurrency')} value={account.currency} />
        <Fact label={t('tradingAccounts.fieldLeverage')} value={`1:${account.leverage}`} />
      </dl>

      <div className="space-y-2 border-t border-border pt-3">
        <Secret label={t('tradingAccounts.masterPassword')} value={account.masterPassword} />
        <Secret label={t('tradingAccounts.investorPassword')} value={account.investorPassword} />
      </div>

      <div className="flex justify-end pt-1">
        <Button type="button" size="sm" onClick={onDone}>
          {t('tradingAccounts.credentialsDone')}
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

function Secret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /*
       * Swallowed deliberately. The clipboard API refuses outside a secure
       * context and on some locked-down browsers; the password is on screen
       * either way, so a failed copy is an inconvenience rather than something
       * to interrupt an operator with.
       */
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
    </div>
  );
}
