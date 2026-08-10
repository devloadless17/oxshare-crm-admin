import type * as React from 'react';
import { Banknote, FileCheck, Handshake } from 'lucide-react';
import type { MessageKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { AdminNotification } from '@/lib/api/admin';

/**
 * The admin bell's kind catalogue — how a backend `{kind, params}` row becomes
 * icon + copy + destination.
 *
 * The backend deliberately stores NO title, body or href (see the
 * `notifications` table note): copy lives here so it is i18n'd like everything
 * else, and the deep link is derived here for the same reason
 * `kyc-doc-url.ts` exists — exactly one place knows the route.
 *
 * A kind this map does not know renders as a generic row (`fallbackTitle` +
 * timestamp), never a raw slug — the backend may learn new events before this
 * app redeploys, and an unrendered enum is the kind of string this codebase
 * never shows.
 *
 * TWIN in intent with the portal's `layout/notification-kinds.ts`; NOT a twin
 * file — the catalogues are disjoint (work-queue events here, account events
 * there).
 */
export interface KindConfig {
  icon: React.ElementType;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** Interpolation vars for the body — money params go through formatMoney. */
  vars?: (params: AdminNotification['params']) => Record<string, string | number>;
  /** The screen this event is actioned on. */
  href?: string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const KIND_CONFIG: Record<string, KindConfig> = {
  'admin.withdrawal.requested': {
    icon: Banknote,
    titleKey: 'notifications.kindWithdrawalRequestedTitle',
    bodyKey: 'notifications.kindWithdrawalRequestedBody',
    vars: (params) => ({ amount: formatMoney(str(params.amount), str(params.currency)) }),
    href: '/transactions',
  },
  'admin.kyc.submitted': {
    icon: FileCheck,
    titleKey: 'notifications.kindKycSubmittedTitle',
    bodyKey: 'notifications.kindKycSubmittedBody',
    href: '/kyc',
  },
  'admin.partner.applied': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerAppliedTitle',
    bodyKey: 'notifications.kindPartnerAppliedBody',
    // The application QUEUE, not /partners — that roster lists approved
    // partners and cannot contain the pending applicant this row announces.
    href: '/approvals/ib',
  },
};

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
