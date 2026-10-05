'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { adminNotificationsApi, type AdminNotification } from '@/lib/api/admin-notifications';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { toastSuccess } from '@/lib/toast';
import { displayOf } from './catalogue';

/** `AdminNotificationCloseDto`'s bounds, stated up front so the button never presses into a 400. */
const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * The decision that ends a task WITHOUT its item moving — for a clawback, "the
 * partner keeps the commission". It is as much a decision as a reversal, so it
 * takes a reason (the audit row) and ends the task for EVERY admin holding it
 * (backend `POST /admin/notifications/:id/close`).
 *
 * A refusal stays inline with the dialog open: the likely one is "somebody
 * handled it while you were looking" (409), a sentence to read, not a toast to
 * miss.
 */
export function CloseTaskDialog({
  task,
  onClose,
  onDone,
}: {
  /** The task being decided, or `null` when the dialog is closed. */
  task: AdminNotification | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // A reason written about one task must never carry over to the next.
  const taskId = task?.id ?? null;
  const lastId = React.useRef<string | null>(null);
  if (lastId.current !== taskId) {
    lastId.current = taskId;
    if (reason !== '') setReason('');
    if (error !== null) setError(null);
  }

  const close = useMutation({
    mutationFn: (target: AdminNotification) =>
      adminNotificationsApi.close(target.id, reason.trim()),
    onSuccess: () => {
      onClose();
      onDone();
      toastSuccess(t('notifications.closed'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('notifications.closeFailed'))),
  });

  const decision = task ? displayOf(task.kind).close : undefined;
  const trimmed = reason.trim().length;

  return (
    <Modal
      busy={close.isPending}
      open={task !== null && decision !== undefined}
      onClose={onClose}
      labelledBy="close-task-title"
      title={decision ? t(decision.titleKey) : ''}
      description={
        decision && task
          ? t(decision.introKey, { portalId: task.client.portalId ?? '' })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={close.isPending}
            className="h-9 rounded-lg border border-input bg-card px-4 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => task && close.mutate(task)}
            aria-busy={close.isPending}
            disabled={close.isPending || trimmed < REASON_MIN}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {close.isPending ? t('notifications.closing') : decision ? t(decision.actionKey) : ''}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="close-task-reason" className="text-xs font-semibold">
            {t('notifications.closeReasonLabel')}
          </label>
          <textarea
            id="close-task-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={REASON_MAX}
            placeholder={t('notifications.closeReasonPlaceholder')}
            className="focus-outline mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs"
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {t('notifications.closeReasonHint')}
            </p>
            {trimmed > 0 && trimmed < REASON_MIN && (
              <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                {t('notifications.closeReasonTooShort', { count: REASON_MIN - trimmed })}
              </p>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
