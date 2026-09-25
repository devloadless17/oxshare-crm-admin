'use client';

import Link from 'next/link';
import { Check, CornerUpLeft } from 'lucide-react';
import { ClientIdentity, clientName } from '@/components/clients/client-identity';
import { useAdmin } from '@/context/AdminAuthContext';
import type { AdminNotification } from '@/lib/api/admin-notifications';
import { currentLocale, t } from '@/lib/i18n';
import { canAccess } from '@/lib/permissions';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { displayOf, lookOf, outcomeOf, pathOf } from './catalogue';

/**
 * One task, as the bell and the notifications page list it.
 *
 * The row reads top to bottom as the question an operator asks of it: WHAT must
 * I do (the title is the action), for WHOM (the client by name and Portal ID —
 * the Portal ID alone when the reader's role hides names), and the DETAIL
 * (amount, reason). History adds how it ENDED, or "Needs action" while it has
 * not.
 *
 * Opening it goes to the screen the task is handled on, filtered to this client
 * where that screen allows, and marks it read — which takes it out of the
 * reader's inbox. The link renders only for an admin who may open that screen:
 * the fan-out follows the ACTION permission, the routes follow the VIEW
 * permission, and a role holding one without the other must not click through
 * to "no access". The task is still theirs to see; the navigation is not.
 */
export function NotificationItem({
  item,
  onOpen,
  onMarkRead,
  onMarkUnread,
  comfortable = false,
}: {
  item: AdminNotification;
  /** The row was opened — mark it read and, in the sheet, close. */
  onOpen: (item: AdminNotification) => void;
  onMarkRead: (item: AdminNotification) => void;
  /** Offered in history on a task still waiting — "I cleared that too soon". */
  onMarkUnread?: (item: AdminNotification) => void;
  /** The page's roomier density; the sheet is compact. */
  comfortable?: boolean;
}) {
  const { admin } = useAdmin();
  const display = displayOf(item.kind);
  const { icon: Icon, tone } = lookOf(item);
  const unread = !item.readAt;
  const outcome = outcomeOf(item);
  const body = display.body(item);
  const href = display.href(item);
  // An empty link is "nowhere to go" — a kind this build does not know.
  const canOpen = href !== '' && canAccess(admin, pathOf(href));
  const title = t(display.titleKey);
  const byName = item.resolution?.byName;

  const content = (
    <>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg',
          comfortable ? 'mt-0.5 h-9 w-9' : 'mt-0.5 h-8 w-8',
          tone,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'truncate text-foreground',
              comfortable ? 'text-sm' : 'text-xs',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {title}
            {unread && <span className="sr-only"> — {t('notifications.itemUnread')}</span>}
          </span>
          <time
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString(currentLocale())}
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            {relativeTime(item.createdAt)}
          </time>
        </span>
        <span className="block text-xs">
          <ClientIdentity
            name={clientName(item.client.firstName, item.client.lastName)}
            portalId={item.client.portalId}
            strong={false}
          />
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {t(body.key, body.vars)}
        </span>
        {(item.resolution || !unread) && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              outcome.tone,
            )}
          >
            {byName
              ? t('notifications.outcomeBy', { outcome: t(outcome.labelKey), name: byName })
              : t(outcome.labelKey)}
          </span>
        )}
      </span>
    </>
  );

  const rowClass = cn(
    // Room at the end where there is no hover: the ✓ is always drawn there, and
    // without the padding it covers the time the task arrived.
    'flex min-w-0 flex-1 gap-3 rounded-lg p-3 text-start [@media(hover:none)]:pe-12',
    unread ? 'bg-primary/5' : 'bg-transparent',
  );

  return (
    <li className="group relative flex items-start rounded-lg border border-border transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
      {canOpen ? (
        <Link href={href} onClick={() => onOpen(item)} className={cn(rowClass, 'focus-outline')}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {unread && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-4 h-2 w-2 rounded-full bg-primary group-focus-within:hidden group-hover:hidden [@media(hover:none)]:hidden"
        />
      )}
      {/* Shown on hover or keyboard focus — and always where there is no hover
          to reveal them, so a touch screen can clear a task without opening it. */}
      <span className="absolute end-2 top-2 hidden gap-1 group-focus-within:flex group-hover:flex [@media(hover:none)]:flex">
        {unread ? (
          <button
            type="button"
            onClick={() => onMarkRead(item)}
            aria-label={t('notifications.markRead', { title })}
            title={t('notifications.markReadShort')}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-outline"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : onMarkUnread && !item.resolution ? (
          <button
            type="button"
            onClick={() => onMarkUnread(item)}
            aria-label={t('notifications.markUnread', { title })}
            title={t('notifications.markUnreadShort')}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-outline"
          >
            <CornerUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </li>
  );
}
