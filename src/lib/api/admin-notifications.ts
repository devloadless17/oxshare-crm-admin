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
export type AdminNotificationsMarkAllRead =
  components['schemas']['NotificationsMarkAllReadResponseDto'];
export type AdminNotificationSubjectKind =
  components['schemas']['AdminNotificationsReadSubjectDto']['subjectKind'];

export interface AdminNotificationQuery {
  /** `inbox`: unread AND not yet handled by anyone. `history`: everything. */
  view: 'inbox' | 'history';
  /** History only: `open` = still waiting on somebody, `handled` = resolved. */
  status?: 'open' | 'handled';
  category?: AdminNotificationCategory;
  /** A client — Portal ID (exact) or part of a name or email. */
  q?: string;
  cursor?: string;
  limit?: number;
}

export const adminNotificationsApi = {
  async list(query: AdminNotificationQuery, signal?: AbortSignal): Promise<AdminNotificationPage> {
    const params = new URLSearchParams({ view: query.view });
    if (query.status) params.set('status', query.status);
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

  /** The badge: tasks waiting on the reader, in total and per category. */
  async summary(signal?: AbortSignal): Promise<AdminNotificationSummary> {
    const { data } = await apiClient.get<AdminNotificationSummary>(
      '/admin/notifications/unread-count',
      { signal },
    );
    return data;
  },

  async markRead(id: string): Promise<AdminNotificationMark> {
    const { data } = await apiClient.post<AdminNotificationMark>(`/admin/notifications/${id}/read`);
    return data;
  },

  /** The undo of a mark-read. */
  async markUnread(id: string): Promise<AdminNotificationMark> {
    const { data } = await apiClient.post<AdminNotificationMark>(
      `/admin/notifications/${id}/unread`,
    );
    return data;
  },

  /**
   * Clear the reader's unread markers — every category, or one — never past
   * `upTo`, the `createdAt` of the newest row they were shown. A task that
   * arrived after the list rendered stays unread.
   */
  async markAllRead(
    options: { category?: AdminNotificationCategory; upTo?: string } = {},
  ): Promise<AdminNotificationsMarkAllRead> {
    const { data } = await apiClient.post<AdminNotificationsMarkAllRead>(
      '/admin/notifications/read-all',
      options,
    );
    return data;
  },

  /** The reader opened the item itself (a KYC review) — clear their tasks about it. */
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
