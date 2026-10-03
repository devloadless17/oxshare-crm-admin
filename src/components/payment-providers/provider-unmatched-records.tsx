'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import type { UnmatchedProviderRecord } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatMoney } from '@/lib/money';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const NOTE_MAX = 500;

/**
 * WHAT THE PROVIDER HOLDS THAT NOTHING HERE EXPLAINS (backend 0174).
 *
 * The backend reads the provider's own records, two hours behind, and files
 * every movement no transaction accounts for: a payout somebody made by hand
 * in the provider's dashboard, a deposit on a link this platform never made, a
 * payout given up on that turned up after all. Each is paged when found. Here
 * a person either finds the transaction it belongs to (it then disappears on
 * its own) or acknowledges it as a company movement, with a note — the owner's
 * ruling: manual moves are "mostly no", so none is waved through silently.
 */
export function ProviderUnmatchedRecords({
  code,
  canManage,
}: {
  code: string;
  canManage: boolean;
}) {
  const records = useResource<UnmatchedProviderRecord[]>(
    keys.paymentProviders.unmatched(code),
    (signal) => api.admin.getUnmatchedProviderRecords(code, signal),
  );
  const [target, setTarget] = React.useState<UnmatchedProviderRecord | null>(null);

  const columns: Column<UnmatchedProviderRecord>[] = [
    {
      header: t('providers.col.when'),
      cell: (r) => (
        <span className="whitespace-nowrap text-xs">{new Date(r.occurredAt).toLocaleString()}</span>
      ),
    },
    {
      header: t('providers.col.movement'),
      cell: (r) => (
        <Badge variant={r.subject === 'payout' ? 'warning' : 'default'}>
          {t(r.subject === 'payout' ? 'providers.unmatched.payout' : 'providers.unmatched.payment')}
        </Badge>
      ),
    },
    {
      header: t('providers.col.amount'),
      cell: (r) => <span className="text-xs tabular-nums">{amountLabel(r)}</span>,
    },
    {
      header: t('providers.col.counterparty'),
      cell: (r) => (
        <span className="break-all font-mono text-[11px] text-muted-foreground">
          {r.counterparty ?? '—'}
        </span>
      ),
    },
    {
      header: t('providers.col.providerId'),
      cell: (r) => (
        <span className="break-all font-mono text-[11px]" title={r.reference ?? undefined}>
          {r.providerId}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            header: '',
            cell: (r: UnmatchedProviderRecord) => (
              <button
                type="button"
                onClick={() => setTarget(r)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-semibold hover:bg-accent focus-outline"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {t('providers.acknowledge')}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <AsyncBoundary
      status={records.status}
      label={t('providers.unmatchedLoading')}
      endpoints={['GET /admin/payment-providers/:code/unmatched-records']}
      onRetry={records.refetch}
      errorMessage={t('providers.unmatchedLoadFailed')}
      error={records.error}
    >
      <DataTable
        caption={t('providers.unmatchedCaption')}
        columns={columns}
        rows={records.data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={ShieldCheck} message={t('providers.unmatchedEmpty')} />}
      />
      {target && <AcknowledgeDialog code={code} record={target} onClose={() => setTarget(null)} />}
    </AsyncBoundary>
  );
}

function AcknowledgeDialog({
  code,
  record,
  onClose,
}: {
  code: string;
  record: UnmatchedProviderRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.admin.acknowledgeProviderRecord(code, record.id, note.trim()),
    onSuccess: async () => {
      // The list here, and the provider's count on both provider screens.
      await queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() });
      toastSuccess(t('providers.acknowledgeDone'));
      onClose();
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('providers.acknowledgeFailed'))),
  });

  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      labelledBy={`acknowledge-${record.id}`}
      title={t('providers.acknowledgeTitle')}
      description={t('providers.acknowledgeBody', {
        movement: t(
          record.subject === 'payout'
            ? 'providers.unmatched.payout'
            : 'providers.unmatched.payment',
        ),
        amount: amountLabel(record),
        providerId: record.providerId,
      })}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            aria-busy={save.isPending}
            disabled={save.isPending || note.trim() === ''}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {t('providers.acknowledge')}
          </button>
        </>
      }
    >
      <label htmlFor={`acknowledge-note-${record.id}`} className="text-xs font-semibold">
        {t('providers.acknowledgeNote')}
      </label>
      <textarea
        id={`acknowledge-note-${record.id}`}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setError(null);
        }}
        rows={2}
        maxLength={NOTE_MAX}
        placeholder={t('providers.acknowledgeNotePlaceholder')}
        className="focus-outline mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
      />
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** "500.00 USDT-TRC20" — the asset is the provider's own word; never a float. */
function amountLabel(record: UnmatchedProviderRecord): string {
  if (!record.amount) return '—';
  return `${formatMoney(record.amount, 'USD').replace(/^\$/, '')} ${record.asset ?? ''}`.trim();
}
