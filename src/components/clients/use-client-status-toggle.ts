'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ClientRow } from '@/lib/api/admin';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Suspending and reactivating a client from a LIST row — the clients directory
 * and a partner's "Referred clients" tab (owner, 26 Sep 2026) — so both lists
 * confirm, report and refresh the same way. Moved verbatim from
 * `clients/page.tsx`.
 */
export function useClientStatusToggle() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const mutation = useMutation({
    mutationFn: ({ client, next }: { client: ClientRow; next: 'active' | 'suspended' }) =>
      api.admin.setClientStatus(client.id, next),
    onSuccess: async (_data, { client, next }) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients.all() });
      // The Portal ID when a role hides the email — never the uuid.
      const who = client.email ?? `#${client.portalId}`;
      toastSuccess(
        next === 'suspended'
          ? t('clients.suspendSucceeded', { email: who })
          : t('clients.reactivateSucceeded', { email: who }),
      );
    },
    /*
     * A refusal — the API declines to suspend a client outside the operator's
     * tag scope — left the row exactly as it was, which is indistinguishable
     * from the click not registering. So it is said.
     */
    onError: (error) => toastError(error, t('clients.statusFailed')),
  });

  const toggle = async (client: ClientRow) => {
    const next = client.status === 'suspended' ? 'active' : 'suspended';
    // Suspension bites immediately server-side — live sessions die on the next
    // request — so confirm before pulling the trigger. Reactivating is not
    // confirmed: it restores access rather than removing it.
    if (next === 'suspended') {
      const email = client.email ?? `#${client.portalId}`;
      const ok = await confirm({
        title: t('clients.confirmSuspendTitle', { email }),
        description: t('clients.confirmSuspend', { email }),
        confirmLabel: t('clients.suspend'),
        destructive: true,
      });
      if (!ok) return;
    }
    mutation.mutate({ client, next });
  };

  /** The row mid-mutation, so its menu shows busy rather than every row's. */
  const actingId = mutation.isPending ? mutation.variables?.client.id : null;

  return { toggle, actingId, mutation };
}
