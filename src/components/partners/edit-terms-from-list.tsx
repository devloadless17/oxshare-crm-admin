'use client';

import type { ClientRef } from '@/lib/api/admin';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { SubPartnerTermsDialog } from '@/components/clients/profile/client-partner-dialogs';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * "Edit commission" from a TABLE row (0197). A row carries only a summary, and
 * the dialog needs the partner detail — their level's defaults and their own
 * shares — so it is fetched first, exactly as `ChangeLevelFromList` does.
 *
 * A main partner has no share of their own to set (they take 100% on their own
 * clients and the rest on their sub-partners'), so for one the dialog says so
 * instead of offering a form the API would refuse.
 */
export function EditTermsFromList({
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

  const partner = detail.data;
  const isSub =
    partner !== undefined &&
    partner !== null &&
    partner.level >= 2 &&
    (partner.parent !== null || partner.parentOutsideTerritory);

  if (partner && isSub) {
    return <SubPartnerTermsDialog open={open} onClose={onClose} partner={partner} name={name} />;
  }

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.termsTitle', { name })}>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {detail.error
          ? t('clientProfile.termsFailed')
          : partner
            ? t('clientProfile.termsMainPartner')
            : t('common.loading')}
      </p>
    </Modal>
  );
}
