'use client';

import * as React from 'react';
import { Bell, FileCheck, Handshake, Info } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The notification bell, and the panel behind it.
 *
 * TWIN in intent with the portal's `layout/notifications-sheet.tsx` — same
 * component shape, same refusal to fabricate events — but NOT a twin file: the
 * sample rows are about work queues here and about a client's own account
 * there, so the copy cannot be shared.
 *
 * ## Why the content is placeholder, and why it says so
 *
 * There is no notifications table, no endpoint and nothing emitting events. The
 * bell that used to sit in `admin-layout.tsx` had no handler at all and a
 * permanent unread dot implying items that did not exist — a status light that
 * never changes, which is the thing this product has removed twice already.
 *
 * The panel opens with a plain statement that notifications are not live, and
 * the rows beneath it are descriptions of what WILL arrive here rather than
 * invented queue items. That distinction matters more on this side than on the
 * portal's: a fabricated "3 withdrawals awaiting approval" sends an operator to
 * a queue that is empty, and the next real one gets the same shrug.
 *
 * There is also NO unread count, for the same reason there is no dot.
 *
 * When `GET /admin/notifications` lands: replace `SAMPLES` with a `useResource`
 * call, render through `<AsyncBoundary>`, delete `previewNotice`, and let the
 * empty state be a real one.
 */

interface SampleNotification {
  id: string;
  icon: React.ElementType;
  title: MessageKey;
  body: MessageKey;
}

const SAMPLES: SampleNotification[] = [
  {
    id: 'preview',
    icon: Info,
    title: 'notifications.sampleAdminPreviewTitle',
    body: 'notifications.sampleAdminPreviewBody',
  },
  {
    id: 'kyc',
    icon: FileCheck,
    title: 'notifications.sampleAdminKycTitle',
    body: 'notifications.sampleAdminKycBody',
  },
  {
    id: 'partner',
    icon: Handshake,
    title: 'notifications.sampleAdminPartnerTitle',
    body: 'notifications.sampleAdminPartnerBody',
  },
];

export function NotificationsSheet() {
  return (
    <Sheet>
      {/*
        Icon-only, so it needs a name: without one a screen reader announces
        "button" and the only route to this panel is unreachable to anyone not
        looking at it. Sized to match the controls beside it so the header reads
        as one row rather than several shapes.
      */}
      <SheetTrigger
        aria-label={t('notifications.open')}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted focus-outline"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
      </SheetTrigger>

      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>{t('notifications.title')}</SheetTitle>
          <SheetDescription>{t('notifications.previewNotice')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-2">
            {SAMPLES.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-foreground">{t(item.title)}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t(item.body)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
