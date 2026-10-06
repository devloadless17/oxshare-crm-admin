'use client';

import * as React from 'react';
import { CheckCheck, Inbox } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AsyncBoundary } from '@/components/async-boundary';
import { useInfiniteResource } from '@/hooks/use-infinite-resource';
import {
  adminNotificationsApi,
  type AdminNotification,
  type AdminNotificationQuery,
} from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { groupByDay } from './day-groups';
import { refreshNotifications } from './refresh';
import { useMinuteTick } from './use-minute-tick';
import { CloseTaskDialog } from './close-task-dialog';
import { NotificationItem } from './notification-item';

type FeedQuery = Pick<AdminNotificationQuery, 'view' | 'q' | 'from' | 'to'>;

/**
 * The list of tasks — the bell's panel and the notifications page both render
 * this, so the two cannot drift into two behaviours for one feed.
 *
 * ## A task leaves the Inbox when it is HANDLED, and only then
 *
 * The owner's rule (5 Oct 2026, from the buyer's old CRM): the Inbox is every
 * task nobody has handled yet, and History is the handled ones, with who did
 * what. Opening a task marks it SEEN — the row stops reading as new — and
 * nothing more: it stays until somebody approves, rejects or resolves the
 * item. The backend resolves it for every admin at once and the socket tells
 * this tab, so nothing here has to ask.
 *
 * There is deliberately no clear (✓), "mark all as read" or "mark unread". Each
 * existed to take a task out of the Inbox unhandled — clicking a deposit filed
 * it under History although nobody had approved it, the reported complaint.
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
  // Relative times and day groups move on with the clock while the list is open.
  useMinuteTick();

  // Opening a task marks it seen. Silent on failure: the navigation the reader
  // asked for must not be interrupted by a marker that retries on the next
  // visit, and the row stays in the Inbox either way.
  const markSeen = useMutation({
    mutationFn: (item: AdminNotification) => adminNotificationsApi.markRead(item.id),
    onSettled: () => refreshNotifications(queryClient),
  });

  const groups = groupByDay(feed.items);
  // The task whose "leave it as it is" decision is being taken (a kept clawback).
  const [deciding, setDeciding] = React.useState<AdminNotification | null>(null);

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
      {feed.items.length === 0 ? (
        <EmptyFeed view={query.view} filtered={filtered} action={emptyAction} />
      ) : (
        <div className="space-y-4">
          {/* Mounted while empty, so a screen reader announces the text when it lands. */}
          <p className="text-[11px] text-muted-foreground empty:hidden" role="status">
            {feed.refreshFailed ? t('notifications.refreshFailed') : ''}
          </p>
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
                      if (!opened.readAt) markSeen.mutate(opened);
                      onNavigate?.();
                    }}
                    onDecide={query.view === 'inbox' ? setDeciding : undefined}
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
      <CloseTaskDialog
        task={deciding}
        onClose={() => setDeciding(null)}
        onDone={() => refreshNotifications(queryClient)}
      />
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
