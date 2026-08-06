'use client';

import Link from 'next/link';
import {
  ArrowUpDown,
  Copy,
  Layers,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  User,
} from 'lucide-react';
import type { IbPartnerPage } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';

export type PartnerRowData = IbPartnerPage['rows'][number];

/**
 * One partner, with its actions behind a single trigger.
 *
 * The three-dot menu follows `rbac/role-row.tsx`, which records both rules this
 * copies. Five always-visible buttons per row would put Suspend permanently one
 * mis-click from Copy link, repeated down the list; a menu makes the
 * consequential ones take two deliberate actions. And the confirmation dialog
 * belongs to the PAGE, not to this row — a per-row dialog mounts one copy per
 * partner and unmounts mid-transition when the list refetches.
 *
 * ## There is no Remove
 *
 * Deleting a partner would orphan every client attributed to them and every
 * partner beneath them, so the API has no such route. Suspend is the answer,
 * and it is offered instead rather than shown disabled — a control that only
 * ever explains why it cannot be used is worse than its absence.
 */
export function PartnerRow({
  partner,
  canManage,
  busy,
  onChangeLevel,
  onReassignParent,
  onToggleActive,
  onCopyLink,
}: {
  partner: PartnerRowData;
  canManage: boolean;
  busy: boolean;
  onChangeLevel: (partner: PartnerRowData) => void;
  onReassignParent: (partner: PartnerRowData) => void;
  onToggleActive: (partner: PartnerRowData) => void;
  onCopyLink: (partner: PartnerRowData) => void;
}) {
  const { account, user, levelName } = partner;
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/clients/${user.id}`}
            className="truncate text-sm font-bold text-link hover:underline focus-outline"
          >
            {fullName}
          </Link>
          {/* Suspension is stated on the row rather than only in the menu. It
              is the one thing about a partner somebody scanning needs to see. */}
          {!account.active && (
            <span className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
              {t('partners.suspended')}
            </span>
          )}
        </div>

        <p className="truncate text-xs text-muted-foreground">{user.email}</p>

        <p className="text-[11px] font-medium text-muted-foreground/80">
          {/* The level's NAME, not just its number — "Master Partner" is what
              an operator recognises; the number is an implementation detail
              they should not have to translate. */}
          {t('partners.levelLine', { level: String(account.level), name: levelName })}
          {' · '}
          <span className="font-mono tracking-wide">{account.referralCode}</span>
          {' · '}
          {account.parentIbUserId ? t('partners.hasParent') : t('partners.direct')}
        </p>
      </div>

      {canManage && (
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busy}
                aria-label={t('partners.rowActions', { name: fullName })}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/clients/${user.id}`}>
                  <User />
                  <span>{t('partners.viewClient')}</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => onCopyLink(partner)}>
                <Copy />
                <span>{t('partners.copyLink')}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => onChangeLevel(partner)}>
                <Layers />
                <span>{t('partners.changeLevel')}</span>
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => onReassignParent(partner)}>
                <ArrowUpDown />
                <span>{t('partners.reassignParent')}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
                Suspend is destructive-coloured; reactivate is not. They are the
                same control, but only one of them stops somebody being paid.
              */}
              <DropdownMenuItem
                onSelect={() => onToggleActive(partner)}
                className={
                  account.active
                    ? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
                    : undefined
                }
              >
                {account.active ? <PauseCircle /> : <PlayCircle />}
                <span>{account.active ? t('partners.suspend') : t('partners.reactivate')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
