'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Copy, Handshake, Layers, PauseCircle, PlayCircle, User } from 'lucide-react';
import api from '@/lib/api';
import type { IbLevel, IbPartnerPage } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { Modal } from '@/components/ui/modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { t } from '@/lib/i18n';

/** One row of `GET /admin/ib/partners` — the account, its user, its level name. */
type PartnerRowData = IbPartnerPage['rows'][number];

/**
 * The partner list, rebuilt.
 *
 * The screen this replaces called `/admin/partners` routes that were never
 * built — it had always been a stub rendering against an endpoint that
 * returned 404. Everything here is backed by a real endpoint.
 *
 * ## Every dialog is owned by the PAGE
 *
 * Three of them: change level, reassign parent, confirm suspension. None live
 * in the row. A per-row dialog would mount one copy per partner and unmount
 * mid-transition when the list refetches after a successful action — the rule
 * `components/row-actions.tsx` records, applied to three dialogs instead of one.
 *
 * ## There is no Remove
 *
 * Deleting a partner would orphan every client attributed to them and every
 * partner beneath them, so the API has no such route. Suspend is the answer,
 * and it is offered instead rather than shown disabled — a control that only
 * ever explains why it cannot be used is worse than its absence.
 */
export default function PartnersPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'ib.manage');
  const queryClient = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const [changingLevel, setChangingLevel] = React.useState<PartnerRowData | null>(null);
  const [reassigning, setReassigning] = React.useState<PartnerRowData | null>(null);
  const [suspending, setSuspending] = React.useState<PartnerRowData | null>(null);
  const [copyFailed, setCopyFailed] = React.useState(false);

  const query = useResource<IbPartnerPage>(['admin', 'ib-partners', page, pageSize], (signal) =>
    api.admin.getIbPartners({ page, limit: pageSize }, signal),
  );

  /*
   * The ladder, for the level picker. Loaded with the page rather than on
   * dialog open: unlike the reject reasons, this list is small, cached by
   * React Query across both dialogs, and the parent picker needs the level
   * NAMES to label its options too.
   */
  const levelsQuery = useResource<IbLevel[]>(['admin', 'ib-levels'], (signal) =>
    api.admin.getIbLevels(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ib-partners'] });

  const changeLevel = useMutation({
    mutationFn: (input: { userId: string; level: number }) =>
      api.admin.changeIbPartnerLevel(input.userId, input.level),
    onSuccess: async () => {
      setChangingLevel(null);
      await invalidate();
    },
  });

  const reassignParent = useMutation({
    mutationFn: (input: { userId: string; parentIbUserId: string | null }) =>
      api.admin.reassignIbPartnerParent(input.userId, input.parentIbUserId),
    onSuccess: async () => {
      setReassigning(null);
      await invalidate();
    },
  });

  const toggleActive = useMutation({
    mutationFn: (input: { userId: string; active: boolean }) =>
      api.admin.setIbPartnerActive(input.userId, input.active),
    onSuccess: async () => {
      setSuspending(null);
      await invalidate();
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const levels = levelsQuery.data ?? [];

  const busyUserId =
    (changeLevel.isPending && changeLevel.variables?.userId) ||
    (reassignParent.isPending && reassignParent.variables?.userId) ||
    (toggleActive.isPending && toggleActive.variables?.userId) ||
    null;

  const copyLink = (partner: PartnerRowData) => {
    // The portal's origin, not the admin's — the link is for a client to
    // follow, and this console is on a different host.
    const portal = process.env['NEXT_PUBLIC_PORTAL_URL'] ?? 'http://localhost:3000';
    const link = `${portal}/auth/register?ref=${partner.account.referralCode}`;
    navigator.clipboard.writeText(link).then(
      () => setCopyFailed(false),
      // Saying so beats a menu item that appears to do nothing, which is what
      // a swallowed clipboard failure looks like from the outside.
      () => setCopyFailed(true),
    );
  };

  /*
   * The API's own refusal, verbatim. "That partner already sits beneath this
   * one" and "already holds 3 of their 3" are the informative part — a generic
   * message throws away the only fact the operator needs.
   */
  const mutationError =
    (changeLevel.isError && apiErrorMessage(changeLevel.error, t('partners.actionFailed'))) ||
    (reassignParent.isError && apiErrorMessage(reassignParent.error, t('partners.actionFailed'))) ||
    (toggleActive.isError && apiErrorMessage(toggleActive.error, t('partners.actionFailed'))) ||
    null;

  const columns: Column<PartnerRowData>[] = [
    {
      header: t('partners.colName'),
      cell: ({ account, user }) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/clients/${user.id}`}
            className="font-semibold text-link hover:underline focus-outline"
          >
            {user.firstName} {user.lastName}
          </Link>
          {/* Suspension is stated on the row rather than only in the menu. It
              is the one thing about a partner somebody scanning needs to see. */}
          {!account.active && (
            <span className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
              {t('partners.suspended')}
            </span>
          )}
        </span>
      ),
    },
    {
      header: t('partners.colEmail'),
      cell: ({ user }) => user.email,
      cellClassName: 'text-muted-foreground',
    },
    {
      // The level's NAME, not just its number — "Master Partner" is what an
      // operator recognises; the number is an implementation detail they should
      // not have to translate.
      header: t('partners.colLevel'),
      cell: ({ account, levelName }) =>
        t('partners.levelLine', { level: String(account.level), name: levelName }),
    },
    {
      header: t('partners.colReferralCode'),
      cell: ({ account }) => account.referralCode,
      cellClassName: 'font-mono tracking-wide text-muted-foreground',
    },
    {
      header: t('partners.colParent'),
      cell: ({ account }) =>
        account.parentIbUserId ? t('partners.hasParent') : t('partners.direct'),
      cellClassName: 'text-muted-foreground',
    },
    ...(canManage
      ? [
          actionsColumn<PartnerRowData>(
            (partner) => (
              <RowActions
                label={t('partners.rowActions', {
                  name: `${partner.user.firstName} ${partner.user.lastName}`,
                })}
                busy={busyUserId === partner.account.userId}
                menuClassName="w-56"
                items={[
                  {
                    label: t('partners.viewClient'),
                    icon: User,
                    href: `/clients/${partner.user.id}`,
                  },
                  {
                    label: t('partners.copyLink'),
                    icon: Copy,
                    onSelect: () => copyLink(partner),
                  },
                  {
                    label: t('partners.changeLevel'),
                    icon: Layers,
                    separatorBefore: true,
                    onSelect: () => setChangingLevel(partner),
                  },
                  {
                    label: t('partners.reassignParent'),
                    icon: ArrowUpDown,
                    onSelect: () => setReassigning(partner),
                  },
                  /*
                   * Suspend is destructive-coloured; reactivate is not. They are
                   * the same control, but only one of them stops somebody being
                   * paid.
                   */
                  {
                    label: partner.account.active
                      ? t('partners.suspend')
                      : t('partners.reactivate'),
                    icon: partner.account.active ? PauseCircle : PlayCircle,
                    destructive: partner.account.active,
                    separatorBefore: true,
                    onSelect: () => setSuspending(partner),
                  },
                ]}
              />
            ),
            t('partners.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('partners.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('partners.subtitle')}</p>
        </div>
        <ExportButton resource="ib/partners" disabled={rows.length === 0} />
      </div>

      {mutationError && (
        <div
          role="alert"
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {mutationError}
        </div>
      )}

      {copyFailed && (
        <div
          role="alert"
          className="shrink-0 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
        >
          {t('partners.copyFailed')}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('partners.loading')}
        endpoints={['GET /admin/ib/partners?page&limit']}
        onRetry={query.refetch}
        errorMessage={t('partners.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('partners.caption')}
          columns={columns}
          rows={rows}
          rowKey={(partner) => partner.account.userId}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Handshake} message={t('partners.empty')} />}
          /*
           * The pager moved INTO the table's footer, where it is always on
           * screen rather than however many rows below the fold. Same page,
           * pageSize and total as before; changing the size returns to page 1
           * because page 4 of the old size names different rows under the new.
           */
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
      </AsyncBoundary>

      <ChangeLevelDialog
        partner={changingLevel}
        levels={levels}
        saving={changeLevel.isPending}
        onCancel={() => {
          setChangingLevel(null);
          changeLevel.reset();
        }}
        onConfirm={(level) => {
          if (changingLevel) changeLevel.mutate({ userId: changingLevel.account.userId, level });
        }}
      />

      <ReassignParentDialog
        partner={reassigning}
        candidates={rows}
        saving={reassignParent.isPending}
        onCancel={() => {
          setReassigning(null);
          reassignParent.reset();
        }}
        onConfirm={(parentIbUserId) => {
          if (reassigning) {
            reassignParent.mutate({ userId: reassigning.account.userId, parentIbUserId });
          }
        }}
      />

      {/*
        Only SUSPENSION is confirmed, not reactivation. One of them stops
        somebody being paid and the other undoes that; asking twice for both
        would train the operator to click through the dialog that matters.
      */}
      <AlertDialog
        open={suspending !== null}
        onOpenChange={(open) => {
          if (!open) setSuspending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspending?.account.active
                ? t('partners.confirmSuspendTitle')
                : t('partners.confirmReactivateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspending?.account.active
                ? t('partners.confirmSuspendBody')
                : t('partners.confirmReactivateBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!suspending) return;
                toggleActive.mutate({
                  userId: suspending.account.userId,
                  active: !suspending.account.active,
                });
              }}
              className={
                suspending?.account.active
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {suspending?.account.active ? t('partners.suspend') : t('partners.reactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── change level ────────────────────────────────────────────────────────────

function ChangeLevelDialog({
  partner,
  levels,
  saving,
  onCancel,
  onConfirm,
}: {
  partner: PartnerRowData | null;
  levels: IbLevel[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (level: number) => void;
}) {
  return (
    <Modal open={partner !== null} onClose={onCancel} title={t('partners.changeLevel')}>
      {partner && (
        // Keyed, so opening on a different partner starts from THEIR level
        // rather than the previous one's — the same reason IbLevelFormModal is.
        <ChangeLevelForm
          key={partner.account.userId}
          partner={partner}
          levels={levels}
          saving={saving}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
}

function ChangeLevelForm({
  partner,
  levels,
  saving,
  onCancel,
  onConfirm,
}: {
  partner: PartnerRowData;
  levels: IbLevel[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (level: number) => void;
}) {
  const [level, setLevel] = React.useState(partner.account.level);

  // Only enabled levels are offered. The API refuses a disabled one, and a
  // disabled level takes no share — offering it would be offering to stop
  // somebody's earnings by way of a level change.
  const selectable = levels.filter((l) => l.enabled);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('partners.changeLevelIntro', {
          name: `${partner.user.firstName} ${partner.user.lastName}`,
        })}
      </p>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('partners.level')}</span>
        {/* `parseInt`, not `Number`, below: the money lint rule bans the latter
            outright and is right to be blunt rather than guess which strings are
            amounts. A level is a small integer index, so this says so. */}
        <select
          value={level}
          onChange={(e) => setLevel(parseInt(e.target.value, 10))}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
        >
          {selectable.map((l) => (
            <option key={l.level} value={l.level}>
              {l.level} — {l.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(level)}
          disabled={saving || level === partner.account.level}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('partners.saving') : t('partners.save')}
        </button>
      </div>
    </div>
  );
}

// ── reassign parent ─────────────────────────────────────────────────────────

function ReassignParentDialog({
  partner,
  candidates,
  saving,
  onCancel,
  onConfirm,
}: {
  partner: PartnerRowData | null;
  candidates: PartnerRowData[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (parentIbUserId: string | null) => void;
}) {
  return (
    <Modal open={partner !== null} onClose={onCancel} title={t('partners.reassignParent')}>
      {partner && (
        <ReassignParentForm
          key={partner.account.userId}
          partner={partner}
          candidates={candidates}
          saving={saving}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
}

function ReassignParentForm({
  partner,
  candidates,
  saving,
  onCancel,
  onConfirm,
}: {
  partner: PartnerRowData;
  candidates: PartnerRowData[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (parentIbUserId: string | null) => void;
}) {
  const [parentId, setParentId] = React.useState(partner.account.parentIbUserId ?? '');

  /*
   * The obvious loops are filtered out; the API catches the rest.
   *
   * This removes the partner themselves and anybody currently pointing AT them
   * — one level of the cycle check, done here so the common mistake is not
   * even offered. It is NOT the guard: a deeper descendant is still selectable
   * from this page, because the list is paginated and the full chain is not on
   * screen. `wouldCreateCycle` on the server is what actually refuses, and its
   * message is surfaced verbatim.
   */
  const selectable = candidates.filter(
    (c) =>
      c.account.userId !== partner.account.userId &&
      c.account.parentIbUserId !== partner.account.userId &&
      c.account.active,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('partners.reassignIntro', {
          name: `${partner.user.firstName} ${partner.user.lastName}`,
        })}
      </p>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('partners.parent')}</span>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
        >
          {/* "No parent" is a real choice, not an empty state — it means they
              deal with the broker directly, at the top of a chain. */}
          <option value="">{t('partners.noParent')}</option>
          {selectable.map((c) => (
            <option key={c.account.userId} value={c.account.userId}>
              {c.user.firstName} {c.user.lastName} — {c.levelName}
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-muted-foreground">{t('partners.parentHint')}</span>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(parentId || null)}
          disabled={saving}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('partners.saving') : t('partners.save')}
        </button>
      </div>
    </div>
  );
}
