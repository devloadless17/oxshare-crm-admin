'use client';

import type { ClientRef } from '@/lib/api/admin';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { apiErrorCode } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/** The API's answer to a change that would take the client out of YOUR view. */
export const TAG_CHANGE_LEAVES_SCOPE = 'TAG_CHANGE_LEAVES_SCOPE';

type TagChange = { tagId: string; attached: boolean; confirmLeavesScope?: boolean };

/**
 * Adding and removing a client's tags from their profile — ANY tag, including
 * one outside the operator's own territory (owner, 28 Sep 2026). That is how a
 * desk hands a client to another desk, and how an admin who sees new clients
 * routes one to the right team.
 *
 * The API answers a change that would take the client out of the operator's
 * OWN view with 409 `TAG_CHANGE_LEAVES_SCOPE`. That is a question, not a
 * failure, so it is asked here — "Hand #1000245 over?" — and the change is sent
 * again with the confirmation. Nothing is written until it is confirmed.
 *
 * Once handed over, the client is outside the operator's territory and this
 * page can no longer be shown, so it goes back to the client list. The caches
 * are marked stale WITHOUT refetching: a refetch of this very profile would
 * answer 404 and flash "client not available" on the way out.
 */
export function useClientTagToggle({
  clientId,
  portalId,
  labelOf,
  onHandedOver,
}: {
  /** The id the page was opened with — a Portal ID. */
  clientId: ClientRef;
  /** The client as operators name them in the question and the toast. */
  portalId: number | undefined;
  labelOf: (tagId: string) => string;
  /** Close whatever is open before the page is left. */
  onHandedOver: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const client = portalId === undefined ? t('clients.unnamed') : `#${portalId}`;

  const mutation = useMutation({
    mutationFn: ({ tagId, attached, confirmLeavesScope }: TagChange) =>
      attached
        ? api.admin.unassignTag(clientId, tagId, { confirmLeavesScope })
        : api.admin.assignTag(clientId, tagId, { confirmLeavesScope }),
    onSuccess: async (result, { tagId, attached }) => {
      if (!result.stillVisible) {
        // Stale, not refetched: this profile is a 404 to us now.
        void queryClient.invalidateQueries({ queryKey: keys.clients.all(), refetchType: 'none' });
        void queryClient.invalidateQueries({ queryKey: keys.tags.all(), refetchType: 'none' });
        onHandedOver();
        toastSuccess(t('clientProfile.tagHandedOver', { client, label: labelOf(tagId) }));
        router.push('/clients');
        return;
      }
      // The tags screen counts clients per tag, and the list renders each
      // client's tags — both move with this.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
        queryClient.invalidateQueries({ queryKey: keys.tags.all() }),
      ]);
      const label = labelOf(tagId);
      toastSuccess(
        attached
          ? t('clientProfile.tagRemoved', { label })
          : t('clientProfile.tagAdded', { label }),
      );
    },
    onError: (error, { confirmLeavesScope }) => {
      // Answered with a question by `toggle`, never shown as a failure.
      if (apiErrorCode(error) === TAG_CHANGE_LEAVES_SCOPE && !confirmLeavesScope) return;
      toastError(error, t('clientProfile.tagFailed'));
    },
  });

  const toggle = async (tagId: string, attached: boolean) => {
    try {
      await mutation.mutateAsync({ tagId, attached });
    } catch (error) {
      // Anything else was already reported by `onError`.
      if (apiErrorCode(error) !== TAG_CHANGE_LEAVES_SCOPE) return;
      const ok = await confirm({
        title: t('clientProfile.tagLeavesScopeTitle', { client }),
        description: t('clientProfile.tagLeavesScopeBody', { client, label: labelOf(tagId) }),
        confirmLabel: t('clientProfile.tagLeavesScopeConfirm'),
      });
      if (!ok) return;
      // A failure here is reported by `onError`; nothing more to do.
      await mutation.mutateAsync({ tagId, attached, confirmLeavesScope: true }).catch(() => {});
    }
  };

  return { toggle, pending: mutation.isPending };
}
