'use client';

import Link from 'next/link';
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
 * (amount, reason). History adds how it ENDED and who ended it.
 *
 * Opening it goes to the record the task is handled on and marks it SEEN: the
 * row stops reading as new (bold, the dot) and stays in the Inbox until
 * somebody handles the item — the owner's rule, 5 Oct 2026. There is no
 * control on the row for taking it out unhandled, on purpose. The one control a
 * row may carry is a DECISION its kind declares for leaving the item as it is
 * (a clawback: "Keep commission") — answering the task, not dismissing it.
 *
 * The link renders only for an admin who may open that screen:
 * the fan-out follows the ACTION permission, the routes follow the VIEW
 * permission, and a role holding one without the other must not click through
 * to "no access". The task is still theirs to see; the navigation is not.
 */
export function NotificationItem({
  item,
  onOpen,
  onDecide,
  comfortable = false,
}: {
  item: AdminNotification;
  /** The row was opened — mark it seen and, in the sheet, close. */
  onOpen: (item: AdminNotification) => void;
  /** Take the kind's "leave it as it is" decision (the feed opens its dialog). */
  onDecide?: (item: AdminNotification) => void;
  /** The page's roomier density; the sheet is compact. */
  comfortable?: boolean;
}) {
  const { admin } = useAdmin();
  const display = displayOf(item.kind);
  const { icon: Icon, tone } = lookOf(item);
  // "New" is a waiting task nobody here has opened. A handled one has nothing new to
  // see, so History never wears the marker, whoever ended it.
  const unread = !item.readAt && !item.resolution;
  const outcome = outcomeOf(item);
  const body = display.body(item);
  const href = display.href(item);
  // An empty link is "nowhere to go" — a kind this build does not know.
  const canOpen = href !== '' && canAccess(admin, pathOf(href));
  const title = t(display.titleKey);
  const byName = item.resolution?.byName;
  // Only while it waits: a handled task has nothing left to decide.
  const decision = !item.resolution && onDecide ? display.close : undefined;

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
          <span className="flex shrink-0 items-center gap-2">
            <time
              dateTime={item.createdAt}
              title={new Date(item.createdAt).toLocaleString(currentLocale())}
              className="text-[11px] text-muted-foreground"
            >
              {relativeTime(item.createdAt)}
            </time>
            {unread && (
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </span>
        </span>
        <span className="block text-xs">
          <ClientIdentity
            name={clientName(item.client.firstName, item.client.lastName)}
            portalId={item.client.portalId}
            strong={false}
            /* The item itself is the link, to the task. */
            link={false}
          />
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {t(body.key, body.vars)}
        </span>
        {/* Every Inbox row needs action, so only a handled one says how it ended. */}
        {item.resolution && (
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
    'flex min-w-0 flex-1 gap-3 rounded-lg p-3 text-start',
    unread ? 'bg-primary/5' : 'bg-transparent',
  );

  return (
    <li className="flex flex-col rounded-lg border border-border transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
      {canOpen ? (
        <Link href={href} onClick={() => onOpen(item)} className={cn(rowClass, 'focus-outline')}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {decision && (
        <div className="flex justify-end border-t border-border px-3 py-1.5">
          <button
            type="button"
            onClick={() => onDecide?.(item)}
            className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted focus-outline"
          >
            {t(decision.actionKey)}
          </button>
        </div>
      )}
    </li>
  );
}
