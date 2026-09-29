'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  adminNotificationsApi,
  type AdminNotificationSubjectKind,
} from '@/lib/api/admin-notifications';
import { keys } from '@/lib/query-keys';

/**
 * Opening the item reads its task — the owner's rule that a notification
 * disappears once the admin has LOOKED at the thing it is about, however they
 * got there: the bell, the sidebar queue, a link pasted into a ticket.
 *
 * Pass the subject's id only once the screen has actually loaded it, never
 * on a 403 or 404 where the reader saw nothing. Fires once per id. A failed
 * request is swallowed: the task stays in the inbox, which is the safe side of
 * a lost write — and the server scopes the marker anyway, so nothing here
 * decides whose rows it touches.
 */
export function useMarkSubjectRead(
  subjectKind: AdminNotificationSubjectKind,
  subjectId: string | undefined,
): void {
  const queryClient = useQueryClient();
  const marked = useRef<string | null>(null);

  useEffect(() => {
    if (!subjectId || marked.current === subjectId) return;
    marked.current = subjectId;
    adminNotificationsApi
      .markSubjectRead(subjectKind, subjectId)
      .then(({ updated }) =>
        // Nothing to move when nothing was waiting — no refetch for a no-op.
        updated > 0
          ? queryClient.invalidateQueries({ queryKey: keys.notifications.all() })
          : undefined,
      )
      .catch(() => undefined);
  }, [queryClient, subjectKind, subjectId]);
}
