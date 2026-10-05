import { apiClient } from './client';
import type { components } from './types.gen';

/**
 * The admin bell — a list of TASKS: things the reader must handle.
 *
 * Every type is an ALIAS of the generated schema (the `lib/api/admin.ts` rule),
 * so a backend change to the feed is a compile error here rather than a field
 * that silently reads `undefined`. In particular `kind` is the backend
 * catalogue's closed enum: `components/notifications/catalogue.ts` is keyed by
 * it, so a kind the backend adds without this app learning it fails the build.
 *
 * What the server guarantees, so no screen re-checks it: every row is the
 * reader's own, of a kind they can act on NOW, about a client inside their
 * territory NOW — re-evaluated on every request (backend migration 0140). The
 * client's name arrives already masked for the reader's role; `maskedFields`
 * says which parts were withheld.
 */
export type AdminNotification = components['schemas']['AdminNotificationDto'];
export type AdminNotificationKind = AdminNotification['kind'];
export type AdminNotificationCategory = AdminNotification['category'];
export type AdminNotificationPage = components['schemas']['AdminNotificationListResponseDto'];
export type AdminNotificationSummary = components['schemas']['AdminNotificationSummaryDto'];
export type AdminNotificationMark = components['schemas']['AdminNotificationMarkResponseDto'];
export type AdminNotificationClosed = components['schemas']['AdminNotificationCloseResponseDto'];
export type AdminNotificationsMarkAllRead =
  components['schemas']['NotificationsMarkAllReadResponseDto'];
export type AdminNotificationSubjectKind =
  components['schemas']['AdminNotificationsReadSubjectDto']['subjectKind'];

export interface AdminNotificationQuery {
  /**
   * `inbox`: not yet handled by anyone, opened or not. `history`: handled, with
   * how it ended. A task is in exactly one of the two.
   */
  view: 'inbox' | 'history';
  category?: AdminNotificationCategory;
  /** A client — Portal ID (exact) or part of a name or email. */
  q?: string;
  cursor?: string;
  limit?: number;
}

export const adminNotificationsApi = {
  async list(query: AdminNotificationQuery, signal?: AbortSignal): Promise<AdminNotificationPage> {
    const params = new URLSearchParams({ view: query.view });
    if (query.category) params.set('category', query.category);
    if (query.q?.trim()) params.set('q', query.q.trim());
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit) params.set('limit', String(query.limit));
    const { data } = await apiClient.get<AdminNotificationPage>(
      `/admin/notifications?${params.toString()}`,
      { signal },
    );
    return data;
  },

  /** The badge: every task still waiting on the reader, in total and per category. */
  async summary(signal?: AbortSignal): Promise<AdminNotificationSummary> {
    const { data } = await apiClient.get<AdminNotificationSummary>(
      '/admin/notifications/unread-count',
      { signal },
    );
    return data;
  },

  /** The reader opened the task — it stops reading as new. It stays until handled. */
  async markRead(id: string): Promise<AdminNotificationMark> {
    const { data } = await apiClient.post<AdminNotificationMark>(`/admin/notifications/${id}/read`);
    return data;
  },

  /**
   * End a task by the decision its kind declares for leaving the item as it is
   * (a clawback: the partner keeps the commission). Ends it for every admin;
   * 409 when somebody handled it first.
   */
  async close(id: string, reason: string): Promise<AdminNotificationClosed> {
    const { data } = await apiClient.post<AdminNotificationClosed>(
      `/admin/notifications/${id}/close`,
      { reason },
    );
    return data;
  },

  /** The reader opened the item itself (a KYC review) — their tasks about it are seen. */
  async markSubjectRead(
    subjectKind: AdminNotificationSubjectKind,
    subjectId: string,
  ): Promise<AdminNotificationsMarkAllRead> {
    const { data } = await apiClient.post<AdminNotificationsMarkAllRead>(
      '/admin/notifications/read-subject',
      { subjectKind, subjectId },
    );
    return data;
  },
};
