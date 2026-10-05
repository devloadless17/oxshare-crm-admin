'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import type { AdminNotificationSummary } from '@/lib/api/admin-notifications';
import { t } from '@/lib/i18n';
import { NotificationFeed } from './notification-feed';

type View = 'inbox' | 'history';

/**
 * The bell's panel: Inbox — every task nobody has handled yet — and History —
 * the handled ones, with how each ended and who ended it. Nothing else.
 *
 * No category chips, on the owner's call (25 Sep 2026): the inbox holds a
 * handful of tasks, each already saying what it is by its icon and its title,
 * and a row of filters above five rows is clutter — it also did not fit the
 * panel, cutting its last chip in half. The full page has History's search for
 * finding an old one.
 */
export function NotificationCenter({
  summary,
  onNavigate,
}: {
  summary: AdminNotificationSummary | undefined;
  onNavigate: () => void;
}) {
  const [view, setView] = React.useState<View>('inbox');
  const inboxCount = summary?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-1">
        <Tabs
          idPrefix="notification-center"
          value={view}
          onValueChange={(next) => setView(next === 'history' ? 'history' : 'inbox')}
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
      </div>

      <div
        role="tabpanel"
        id={`notification-center-panel-${view}`}
        aria-labelledby={`notification-center-tab-${view}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <NotificationFeed
          key={view}
          query={{ view }}
          onNavigate={onNavigate}
          emptyAction={
            view === 'inbox' ? (
              <button
                type="button"
                onClick={() => setView('history')}
                className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline focus-outline"
              >
                {t('notifications.viewHistory')}
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <Link
          href="/notifications"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-outline"
        >
          {t('notifications.openPage')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
