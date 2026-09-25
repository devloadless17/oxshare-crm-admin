'use client';

import * as React from 'react';
import { CheckCheck, Inbox } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AsyncBoundary } from '@/components/async-boundary';
import { useInfiniteResource } from '@/hooks/use-infinite-resource';
import {
  adminNotificationsApi,
  type AdminNotification,
  type AdminNotificationQuery,
} from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { toastError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { groupByDay } from './day-groups';
import { NotificationItem } from './notification-item';

type FeedQuery = Pick<AdminNotificationQuery, 'view' | 'q'>;

/**
 * The list of tasks — the bell's panel and the notifications page both render
 * this, so the two cannot drift into two behaviours for one feed.
 *
 * ## What disappears, and when
 *
 * The Inbox holds what still waits on the reader: unread AND not yet handled by
 * anybody. A row leaves it three ways, and each is immediate:
 *
 *  - OPENED — the reader followed it to the item; it is marked read.
 *  - CLEARED with ✓ — marked read in place, with an Undo (the one mistake worth
 *    making reversible: "I cleared that too soon").
 *  - HANDLED by anyone — the backend resolves it for every admin at once and
 *    the socket tells this tab; nothing here has to ask.
 *
 * A row cleared from the Inbox is hidden AT ONCE and restored if the server
 * refuses, so the list never lags the click. History keeps every row, with how
 * it ended.
 *
 * "Mark all as read" marks only up to the newest row ON SCREEN (`upTo`) — a
 * task that arrived after the list rendered stays unread.
 */
export function NotificationFeed({
  query,
  pageSize = 20,
  comfortable = false,
  onNavigate,
  emptyAction,
  filtered = false,
}: {
  query: FeedQuery;
  pageSize?: number;
  comfortable?: boolean;
  /** A row was opened — the sheet closes here. */
  onNavigate?: () => void;
  /** Offered under an empty Inbox — "see history". */
  emptyAction?: React.ReactNode;
  /** A search narrowed the list — changes what "empty" means. */
  filtered?: boolean;
}) {
  const queryClient = useQueryClient();
  const feed = useInfiniteResource(keys.notifications.feed(query), (cursor, signal) =>
    adminNotificationsApi.list({ ...query, cursor, limit: pageSize }, signal),
  );
  // Cleared from the Inbox and hidden until the server's answer replaces the list.
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());
  const hide = (id: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.notifications.all() });

  const markUnread = useMutation({
    mutationFn: (item: AdminNotification) => adminNotificationsApi.markUnread(item.id),
    onSuccess: (_data, item) => hide(item.id, false),
    onError: (error) => toastError(error, t('notifications.markUnreadFailed')),
    onSettled: () => void refresh(),
  });

  const markRead = useMutation({
    mutationFn: ({ item }: { item: AdminNotification; undoable: boolean }) =>
      adminNotificationsApi.markRead(item.id),
    onMutate: ({ item }) => {
      if (query.view === 'inbox') hide(item.id, true);
    },
    onSuccess: (_data, { item, undoable }) => {
      if (!undoable) return;
      toast(t('notifications.markedRead'), {
        action: { label: t('notifications.undo'), onClick: () => markUnread.mutate(item) },
      });
    },
    // An opened row fails silently — the navigation the reader asked for must
    // not be interrupted by a marker that simply retries on the next visit.
    onError: (error, { item, undoable }) => {
      hide(item.id, false);
      if (undoable) toastError(error, t('notifications.markReadFailed'));
    },
    onSettled: () => void refresh(),
  });

  const visible = feed.items.filter((item) => !hidden.has(item.id));

  const markAll = useMutation({
    mutationFn: () => adminNotificationsApi.markAllRead({ upTo: visible[0]?.createdAt }),
    onError: (error) => toastError(error, t('notifications.markAllReadFailed')),
    onSettled: () => void refresh(),
  });

  const hasUnread = visible.some((item) => !item.readAt);
  const groups = groupByDay(visible);

  return (
    <AsyncBoundary
      status={feed.status}
      label={t('notifications.loading')}
      endpoints={['GET /admin/notifications']}
      onRetry={feed.refetch}
      errorMessage={t('notifications.loadFailed')}
      error={feed.error}
      fill
    >
      {visible.length === 0 ? (
        <EmptyFeed view={query.view} filtered={filtered} action={emptyAction} />
      ) : (
        <div className="space-y-4">
          {(hasUnread || feed.refreshFailed) && (
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-[11px] text-muted-foreground"
                role={feed.refreshFailed ? 'status' : undefined}
              >
                {feed.refreshFailed ? t('notifications.refreshFailed') : ''}
              </p>
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="cursor-pointer text-xs font-medium text-primary hover:underline disabled:opacity-50 focus-outline"
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>
          )}
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`notifications-day-${group.key}`}>
              <h3
                id={`notifications-day-${group.key}`}
                className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {group.label}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    comfortable={comfortable}
                    onOpen={(opened) => {
                      if (!opened.readAt) markRead.mutate({ item: opened, undoable: false });
                      onNavigate?.();
                    }}
                    onMarkRead={(cleared) => markRead.mutate({ item: cleared, undoable: true })}
                    onMarkUnread={
                      query.view === 'history' ? (row) => markUnread.mutate(row) : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
          {feed.hasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={feed.loadMore}
                disabled={feed.isLoadingMore}
                className={cn(
                  'cursor-pointer rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground',
                  'transition-colors hover:bg-muted disabled:opacity-50 focus-outline',
                )}
              >
                {feed.isLoadingMore ? t('notifications.loadingMore') : t('notifications.loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}

function EmptyFeed({
  view,
  filtered,
  action,
}: {
  view: 'inbox' | 'history';
  filtered: boolean;
  action?: React.ReactNode;
}) {
  const inbox = view === 'inbox';
  const Icon = inbox ? CheckCheck : Inbox;
  const title = filtered
    ? t('notifications.filteredEmptyTitle')
    : inbox
      ? t('notifications.inboxEmptyTitle')
      : t('notifications.historyEmptyTitle');
  const body = filtered
    ? t('notifications.filteredEmptyBody')
    : inbox
      ? t('notifications.inboxEmptyBody')
      : t('notifications.historyEmptyBody');
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
