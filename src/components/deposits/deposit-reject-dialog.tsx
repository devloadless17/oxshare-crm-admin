'use client';

import * as React from 'react';
import api from '@/lib/api';
import type { RejectionReason } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/** Radix reserves `''` for "nothing selected", so "no catalogued reason" needs its own value. */
const NO_REASON = '__none__';

/**
 * Refusing an offline deposit.
 *
 * Shaped after `PartnerRejectDialog` — configured reason, optional note, at
 * least one of them — with one sentence that does not appear on any other
 * rejection in this console: NOTHING IS REFUNDED.
 *
 * That line is the whole reason this is a separate component rather than the
 * withdrawal dialog with a different noun. A refused withdrawal posts a
 * compensating credit and the client's balance comes back; a refused deposit
 * never debited anything, so there is no reversal and nothing for the client to
 * wait for. An operator who assumes otherwise tells the client a refund is
 * coming, and the client waits for money that was never taken.
 */
export function DepositRejectDialog({
  open,
  clientName,
  amount,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  clientName: string;
  amount: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (input: { reasonId?: string; reason?: string }) => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={t('deposits.rejectTitle')}>
      {/* Keyed, so reopening on a different row starts empty rather than
          carrying the previous client's note across. */}
      <RejectForm
        key={`${clientName}-${String(open)}`}
        clientName={clientName}
        amount={amount}
        saving={saving}
        error={error}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

function RejectForm({
  clientName,
  amount,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  clientName: string;
  amount: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (input: { reasonId?: string; reason?: string }) => void;
}) {
  const [reasons, setReasons] = React.useState<RejectionReason[]>([]);
  const [selected, setSelected] = React.useState('');
  const [note, setNote] = React.useState('');

  /*
   * Loaded on OPEN, and a failure does not block the rejection: free text alone
   * satisfies the API, so an unreachable list of LABELS must not stop an
   * operator refusing a deposit they can see is wrong.
   */
  React.useEffect(() => {
    let cancelled = false;
    api.admin
      .getRejectionReasons('deposit')
      .then((rows) => {
        if (!cancelled) setReasons(rows);
      })
      .catch(() => {
        if (!cancelled) setReasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API refuses when both are empty. Said here before the click rather than
  // after it.
  const canConfirm = Boolean(selected || note.trim());

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('deposits.rejectIntro', { name: clientName, amount })}
      </p>

      <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground">
        {t('deposits.rejectNoRefund')}
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('deposits.rejectReason')}</span>
        <Select
          value={selected === '' ? NO_REASON : selected}
          onValueChange={(value) => setSelected(value === NO_REASON ? '' : value)}
        >
          <SelectTrigger className="h-10 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_REASON} className="text-xs">
              {t('deposits.rejectReasonNone')}
            </SelectItem>
            {reasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id} className="text-xs">
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('deposits.rejectNote')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t('deposits.rejectNotePlaceholder')}
          className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-xs leading-relaxed focus-outline"
        />
        {/* The client reads the label and the note joined together. */}
        <span className="block text-[11px] text-muted-foreground">
          {t('deposits.rejectNoteHint')}
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg border border-input px-3 text-xs font-medium focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!canConfirm || saving}
          onClick={() =>
            onConfirm({ reasonId: selected || undefined, reason: note.trim() || undefined })
          }
          className="h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50 focus-outline"
        >
          {saving ? t('deposits.rejecting') : t('deposits.confirmReject')}
        </button>
      </div>
    </div>
  );
}
