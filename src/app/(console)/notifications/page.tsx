'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from '@/components/ui/tabs';
import { UrlSearchInput } from '@/components/url-search-input';
import { NotificationFeed } from '@/components/notifications/notification-feed';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { adminNotificationsApi } from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

type View = 'inbox' | 'history';

/**
 * Every task in one place — the bell's panel at full size.
 *
 * Two views and nothing to configure. The Inbox is what still waits on you, and
 * it is short by design: a task leaves it the moment it is opened or handled.
 * History is everything, with how each one ended — and its one tool is a search
 * by client, for the question History exists to answer ("what happened with
 * #1000245's withdrawal last week?").
 *
 * No category chips and no status filter, on the owner's call (25 Sep 2026): a
 * list of things you must do is READ, not sorted through, and a row of filters
 * above five tasks is clutter. What a row IS — deposit, withdrawal, KYC, IB,
 * transfer — is already on the row, in its icon and its title.
 *
 * `?view=history&q=1000245` is a real address. `useSearchParams` needs a
 * Suspense boundary at prerender, hence the wrapper.
 */
export default function NotificationsPage() {
  return (
    <React.Suspense fallback={null}>
      <NotificationsScreen />
    </React.Suspense>
  );
}

function NotificationsScreen() {
  const url = useTableQueryState();
  const view: View = url.get('view') === 'history' ? 'history' : 'inbox';
  const q = view === 'history' ? url.get('q') : '';

  // The same query as the bell's badge — one cache entry, one request.
  const summary = useQuery({
    queryKey: keys.notifications.summary(),
    queryFn: ({ signal }) => adminNotificationsApi.summary(signal),
    retry: false,
  });
  const inboxCount = summary.data?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('notifications.pageTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.pageSubtitle')}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <Tabs
          idPrefix="notifications-page"
          value={view}
          // The search belongs to History; leaving it drops the term.
          onValueChange={(next) =>
            url.set({ view: next === 'history' ? 'history' : undefined, q: undefined })
          }
          tabs={[
            {
              value: 'inbox',
              label:
                inboxCount > 0
                  ? t('notifications.tabInboxCount', {
                      count: inboxCount > 99 ? '99+' : inboxCount,
                    })
                  : t('notifications.tabInbox'),
            },
            { value: 'history', label: t('notifications.tabHistory') },
          ]}
        />
        {view === 'history' && (
          <UrlSearchInput
            value={q}
            onChange={(next) => url.set({ q: next || undefined })}
            label={t('notifications.searchLabel')}
            placeholder={t('notifications.searchPlaceholder')}
            title={t('notifications.searchTitle')}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id={`notifications-page-panel-${view}`}
        aria-labelledby={`notifications-page-tab-${view}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl pb-6">
          <NotificationFeed
            key={`${view}:${q}`}
            query={{ view, q: q || undefined }}
            comfortable
            pageSize={30}
            filtered={Boolean(q)}
            emptyAction={
              view === 'inbox' ? (
                <button
                  type="button"
                  onClick={() => url.set({ view: 'history' })}
                  className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline focus-outline"
                >
                  {t('notifications.viewHistory')}
                </button>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
