'use client';

import type { ClientRef } from '@/lib/api/admin';

import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { ChangeLevelDialog } from '@/components/clients/profile/client-partner-dialogs';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Open the partner's TERMS dialog from the clients list.
 *
 * ## Why this wrapper exists rather than a second dialog
 *
 * `ChangeLevelDialog` takes an `IbPartnerDetail` — it seeds the picker from the
 * rung the partner stands on today, so it cannot render from a `ClientRow`,
 * which carries a name and a status and nothing about commission. The list
 * therefore has to FETCH that detail before the dialog has anything to say.
 *
 * Fetching here rather than teaching the dialog two modes keeps one control
 * over a partner's terms in one file. Two dialogs that both write
 * `PATCH /admin/ib/partners/:id/level` is how the profile page and the list
 * start disagreeing about which rungs may be offered — the exact thing the
 * dialog's own note about disabled levels is guarding.
 *
 * ## Why the row action is on the list at all
 *
 * Reaching a partner's terms meant opening their profile and finding the
 * partner tab. An operator moving several partners onto a new rung — the
 * ordinary case after the ladder is edited — did that once per person.
 */
export function ChangeLevelFromList({
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
  /*
   * `enabled: open`, so a list of fifty partners costs nothing until somebody
   * actually opens one. Keyed by user so switching rows does not show the
   * previous partner's ladder while the new one loads.
   */
  const detail = useResource(
    keys.ibPartners.detail(userId),
    (signal) => api.admin.getPartnerDetail(userId, signal),
    { enabled: open },
  );

  /*
   * The dialog is mounted only once the detail is in hand — it seeds its
   * `level` state from `partner.level` on first render, so mounting it against
   * a placeholder would leave the picker seeded to the wrong rung after the
   * real data arrived.
   *
   * Until then this renders a modal of its own rather than nothing, because an
   * action that appears to do nothing for a second reads as broken and gets
   * clicked again.
   */
  if (detail.data) {
    return <ChangeLevelDialog open={open} onClose={onClose} partner={detail.data} name={name} />;
  }

  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.changeLevelTitle', { name })}>
      <p className="text-xs text-muted-foreground">
        {detail.error ? t('clientProfile.levelFailed') : t('common.loading')}
      </p>
    </Modal>
  );
}
