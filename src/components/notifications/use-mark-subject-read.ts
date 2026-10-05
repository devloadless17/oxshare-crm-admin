'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  adminNotificationsApi,
  type AdminNotificationSubjectKind,
} from '@/lib/api/admin-notifications';
import { keys } from '@/lib/query-keys';

/**
 * Opening the item marks its task SEEN — it stops reading as new in the bell,
 * however the admin got there: the bell, the sidebar queue, a link pasted into
 * a ticket. It does NOT take the task out of the Inbox: only handling the item
 * does that (the owner's rule, 5 Oct 2026).
 *
 * Pass the subject's id only once the screen has actually loaded it, never
 * on a 403 or 404 where the reader saw nothing. Fires once per id. A failed
 * request is swallowed: the task merely keeps reading as new, the safe side
 * of a lost write — and the server scopes the marker anyway, so nothing here
 * decides whose rows it touches.
 */
export function useMarkSubjectRead(
  subjectKind: AdminNotificationSubjectKind,
  subjectId: string | undefined,
): void {
  const queryClient = useQueryClient();
  const marked = useRef<string | null>(null);

  useEffect(() => {
    // Put away (the record closed, another loading): the next showing of the
    // same record is a new look and marks its task again — a new task about
    // the same item may have landed in the meantime.
    if (!subjectId) {
      marked.current = null;
      return;
    }
    if (marked.current === subjectId) return;
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
