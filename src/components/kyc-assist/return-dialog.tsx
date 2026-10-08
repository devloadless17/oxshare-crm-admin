'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

/**
 * "Return to edit": a KYC waiting for review goes back to open so staff can
 * complete it for the client. A return like any on the record — with a reason
 * — but the client is not emailed, because staff are handling it.
 */
export function ReturnDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState(() => t('kycAssist.returnReasonDefault'));
  const blank = reason.trim() === '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={t('kycAssist.returnTitle')}
      description={t('kycAssist.returnBody')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || blank}
            className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
          >
            {t('kycAssist.returnConfirm')}
          </button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label htmlFor="assist-return-reason" className="text-xs font-semibold text-foreground">
          {t('kycAssist.returnReason')} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="assist-return-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs focus-outline"
        />
      </div>
    </Modal>
  );
}
