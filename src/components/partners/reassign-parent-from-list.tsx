'use client';

import type { ClientRef } from '@/lib/api/admin';

import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { ReassignParentDialog } from '@/components/clients/profile/client-partner-dialogs';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The profile's "Reassign parent" dialog, opened from a LIST row.
 *
 * The twin of `ChangeLevelFromList`, for the same reason: the dialog needs the
 * partner's full standing (`GET /admin/ib/partners/:userId` — their current
 * parent among it), which a directory row does not carry. It is read under the
 * same `ibPartners.detail` key the profile uses, so both screens share one
 * cached answer, and the dialog's own save invalidates every partner view.
 */
export function ReassignParentFromList({
  open,
  onClose,
  userId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  userId: ClientRef;
  name: string;
}) {
  const detail = useResource(
    keys.ibPartners.detail(userId),
    (signal) => api.admin.getPartnerDetail(userId, signal),
    { enabled: open },
  );

  if (detail.data) {
    return <ReassignParentDialog open={open} onClose={onClose} partner={detail.data} name={name} />;
  }

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.reassignParentTitle', { name })}>
      <p className="text-xs text-muted-foreground">
        {detail.error ? t('clientProfile.parentFailed') : t('common.loading')}
      </p>
    </Modal>
  );
}
