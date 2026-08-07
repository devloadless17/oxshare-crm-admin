'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * RBAC-01/02 — what a role may do.
 *
 * ── One table, not a grid of tiles ────────────────────────────────────────
 *
 * Every role is a row of the shared `DataTable`. Two versions ago this was a
 * two-column grid of tiles, each printing every granted permission as a chip —
 * so a `*` role rendered eighty chips, the tiles went ragged as roles differed
 * in size, and the page grew without bound. A count replaces the chips; the
 * detail lives on the edit page.
 *
 * The table scrolls rather than the document (`fill`), so the heading and the
 * Create button stay put while an operator reads down a long list.
 *
 * ── What this page no longer fetches ──────────────────────────────────────
 *
 * Only `getRoles()`. It used to load the permission catalog and the client-field
 * catalog alongside, because the create/edit MODAL needed both to render. Those
 * are now separate routes that fetch what they need, so opening the list to read
 * a role no longer pulls two vocabularies it does not display.
 *
 * ── Removed from here ─────────────────────────────────────────────────────
 *
 * The page description, the "Configured System & Custom Roles" card, and the
 * link to /admin-users. The last one was a shortcut to a screen already in the
 * sidebar; the first two described the list instead of showing it.
 */
export default function RolesPage() {
  const { admin } = useAdmin();
  const canManageRoles = hasPermission(admin, 'roles.manage');

  /** The role awaiting delete confirmation — also what the dialog names. */
  const [pendingDelete, setPendingDelete] = React.useState<Role | null>(null);

  const queryClient = useQueryClient();

  const query = useResource(['roles'], () => api.admin.getRoles());

  /*
   * System roles are not listed.
   *
   * `Master Admin` cannot be edited, cannot be deleted, and holds `*` — so it
   * rendered as a row with no action menu and an "Assigned Permissions (1)"
   * line that undersells it by eighty. Nothing on this page can act on it, and
   * a management list that opens with an unmanageable entry teaches the reader
   * to skip the first row.
   *
   * Filtered HERE rather than asked of the API: `GET /admin/roles` is shared
   * with the admin directory, which assigns roles and therefore does need the
   * system ones. The Name column and the actions column below still handle
   * `isSystem` — the backend can add another system role at any time, and it
   * should not become editable here by the accident of this filter changing.
   */
  const roles = (query.data ?? []).filter((role) => !role.isSystem);

  const deleteRole = useMutation({
    mutationFn: (role: Role) => api.admin.deleteRole(role.id),
    // An admin's effective permissions change when the role they hold is
    // deleted, so the directory's cache is stale from here too.
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    // Deliberately NOT closing on error. 409 "still assigned" is the common
    // outcome, and the operator needs to read it against the role they named.
  });

  // 409 when a role is still assigned; 403 for over-grants.
  const banner = deleteRole.isError
    ? apiErrorMessage(deleteRole.error, t('roles.deleteFailed'))
    : '';

  const deletingId = deleteRole.isPending ? deleteRole.variables?.id : null;

  const columns: Column<Role>[] = [
    {
      header: t('roles.colName'),
      cell: (role) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{role.name}</span>
          {role.isSystem && (
            <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link">
              {t('settings.systemRole')}
            </span>
          )}
        </span>
      ),
    },
    {
      header: t('roles.colDescription'),
      cell: (role) => role.description || t('roles.noDescription'),
      cellClassName: 'text-muted-foreground',
    },
    {
      /*
       * A count, not the keys. A `*` role prints eighty permission chips and
       * the detail belongs on the edit page — this column says how much a role
       * carries, and the edit page says what.
       */
      header: t('roles.colPermissions'),
      cell: (role) => t('settings.assignedPermissions', { count: role.permissions.length }),
      cellClassName: 'text-muted-foreground',
    },
    ...(canManageRoles
      ? [
          actionsColumn<Role>(
            (role) =>
              /*
               * A SYSTEM role gets no menu at all, rather than a disabled one.
               *
               * It cannot be edited or deleted by anyone — the backend refuses
               * both — so offering a control that only ever explains itself is
               * worse than the absence of one. `RowActions` renders nothing on
               * an empty `items`, which is exactly this case.
               */
              role.isSystem ? null : (
                <RowActions
                  label={t('roles.rowActions', { name: role.name })}
                  busy={deletingId === role.id}
                  items={[
                    {
                      label: t('common.edit'),
                      icon: Pencil,
                      href: `/roles/${role.id}/edit`,
                    },
                    {
                      label: t('common.delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setPendingDelete(role),
                    },
                  ]}
                />
              ),
            t('roles.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('roles.title')}</h1>

        <div className="flex items-center gap-2">
          <ExportButton resource="roles" disabled={roles.length === 0} />
          {canManageRoles && (
            <Button asChild size="sm">
              <Link href="/roles/new">
                <Plus />
                {t('settings.createRole')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {banner}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('roles.title')}
        endpoints={['GET /admin/roles']}
        onRetry={query.refetch}
        errorMessage={t('roles.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('roles.caption')}
          columns={columns}
          rows={roles}
          rowKey={(role) => role.id}
          dimmed={query.isFetching}
          empty={
            /*
             * Not `EmptyState`: this one carries a HINT as well as a message. A
             * fresh install has exactly the system roles and nothing else, and
             * that is the moment the prompt to create one is most useful.
             */
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <p className="text-sm font-semibold text-foreground">{t('roles.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('roles.emptyHint')}</p>
            </div>
          }
        />
      </AsyncBoundary>

      {/*
        One dialog for the whole list, driven by `pendingDelete`, rather than one
        per row: a per-row dialog mounts a copy for every role and unmounts
        mid-transition when the list refetches after a successful delete.
      */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            deleteRole.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('roles.deleteTitle', { name: pendingDelete?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('roles.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRole.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            {/*
              `preventDefault` is load-bearing. AlertDialogAction is a Close
              underneath, so it dismisses the dialog on click — which would tear
              down the error message a 409 is about to put on screen. Radix
              composes handlers with `checkForDefaultPrevented`, so preventing
              the default here suppresses that close and leaves the dialog under
              `pendingDelete`'s control: it closes in `onSuccess`, and only then.
            */}
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteRole.mutate(pendingDelete);
              }}
              disabled={deleteRole.isPending}
              className={buttonVariants({ variant: 'destructive', size: 'sm' })}
            >
              {deleteRole.isPending ? t('roles.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
