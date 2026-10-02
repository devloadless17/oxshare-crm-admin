'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Power } from 'lucide-react';
import { adminApi, type PaymentProvider, type PaymentProviderChannel } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const REASON_MAX = 500;

/**
 * ONE NETWORK, ON OR OFF, IN ONE DIRECTION (backend 0173) — e.g. 3pay's ERC20
 * payouts off while TRC20 stays on.
 *
 * What off does is stated BEFORE the click, because it is the whole decision:
 * the methods on it leave the client's lists and new requests are refused,
 * approving payouts on it pauses — and money already moving still finishes.
 * A reason is required to switch one off (the API refuses a blank one too); it
 * is shown on the desk beside every paused payout, so the operator who meets
 * it later knows why without asking.
 */
export function ChannelSwitch({
  provider,
  channel,
  canManage,
}: {
  provider: PaymentProvider;
  channel: PaymentProviderChannel;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [offOpen, setOffOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const direction =
    channel.direction === 'deposit'
      ? t('providers.direction.deposit')
      : t('providers.direction.payout');
  const methods = provider.methods.filter(
    (m) => m.channelCode === channel.code && m.direction === channel.direction,
  ).length;

  const save = useMutation({
    mutationFn: (body: { enabled: boolean; reason?: string }) =>
      adminApi.setProviderChannel(provider.code, channel.direction, channel.code, body),
    onSuccess: async (_data, body) => {
      setOffOpen(false);
      setReason('');
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() }),
        queryClient.invalidateQueries({ queryKey: keys.paymentMethods.all() }),
        queryClient.invalidateQueries({ queryKey: keys.withdrawalMethods.all() }),
        queryClient.invalidateQueries({ queryKey: keys.withdrawals.all() }),
      ]);
      toastSuccess(
        body.enabled
          ? t('providers.channelOnDone', { channel: channel.label, direction })
          : t('providers.channelOffDone', { channel: channel.label, direction }),
      );
    },
    onError: (e: unknown, body) => {
      // Switching off keeps its dialog open with the refusal inside it.
      if (!body.enabled) setError(apiErrorMessage(e, t('providers.channelSwitchFailed')));
      else toastError(e, t('providers.channelSwitchFailed'));
    },
  });

  const switchOn = async () => {
    const ok = await confirm({
      title: t('providers.channelOnTitle', { channel: channel.label, direction }),
      description: t('providers.channelOnBody', { count: methods }),
      confirmLabel: t('providers.channelSwitchOn'),
    });
    if (ok) save.mutate({ enabled: true });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Badge variant={channel.enabled ? 'success' : 'warning'}>
        {channel.enabled ? t('providers.channelOn') : t('providers.channelOff')}
      </Badge>
      {!channel.enabled && channel.offReason && (
        <span className="text-[11px] text-muted-foreground">
          {channel.offSince
            ? t('providers.channelOffSince', {
                date: new Date(channel.offSince).toLocaleString(),
                reason: channel.offReason,
              })
            : channel.offReason}
        </span>
      )}
      {canManage && channel.bindable && (
        <button
          type="button"
          onClick={() => (channel.enabled ? setOffOpen(true) : void switchOn())}
          disabled={save.isPending}
          className="ms-auto inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-semibold text-foreground hover:bg-accent disabled:opacity-50 focus-outline"
        >
          <Power className="h-3 w-3" aria-hidden="true" />
          {channel.enabled ? t('providers.channelSwitchOff') : t('providers.channelSwitchOn')}
        </button>
      )}

      <Modal
        busy={save.isPending}
        open={offOpen}
        onClose={() => {
          setOffOpen(false);
          setError(null);
        }}
        labelledBy={`channel-off-${channel.direction}-${channel.code}`}
        title={t('providers.channelOffTitle', { channel: channel.label, direction })}
        description={t('providers.channelOffBody', { count: methods })}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOffOpen(false)}
              disabled={save.isPending}
              className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => save.mutate({ enabled: false, reason: reason.trim() })}
              aria-busy={save.isPending}
              disabled={save.isPending || reason.trim() === ''}
              className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {t('providers.channelSwitchOff')}
            </button>
          </>
        }
      >
        <label
          htmlFor={`channel-off-reason-${channel.direction}-${channel.code}`}
          className="text-xs font-semibold"
        >
          {t('providers.channelOffReason')}
        </label>
        <textarea
          id={`channel-off-reason-${channel.direction}-${channel.code}`}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
          rows={2}
          maxLength={REASON_MAX}
          placeholder={t('providers.channelOffReasonPlaceholder')}
          className="focus-outline mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
        />
        {error && (
          <p role="alert" className="mt-2 text-[11px] text-destructive">
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
