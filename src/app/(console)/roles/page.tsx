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
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

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
/*
 * This endpoint returns its whole list, so the rows held ARE the dataset and
 * paging them locally is a view concern. It gives the screen the same footer as
 * the server-paginated tables rather than the inert bar it drew before.
 */
const ROLE_PAGING = { noun: ['role', 'roles'] as [string, string] };

export default function RolesPage() {
  const { admin } = useAdmin();
  /*
   * `roles.manage` bundled all three verbs. Deleting a role is the one that
   * cannot be undone and the one the API guards hardest — it refuses the write
   * that would leave nobody able to manage roles or administrators at all.
   */
  const canCreateRoles = hasPermission(admin, 'roles.create');
  const canEditRoles = hasPermission(admin, 'roles.edit');
  const canDeleteRoles = hasPermission(admin, 'roles.delete');
  const canManageRoles = canEditRoles || canDeleteRoles;

  /** The role awaiting delete confirmation — also what the dialog names. */
  const [pendingDelete, setPendingDelete] = React.useState<Role | null>(null);

  const queryClient = useQueryClient();

  const query = useResource(keys.roles.all(), () => api.admin.getRoles());

  /*
   * System roles ARE listed, read-only.
   *
   * They used to be filtered out here, and the reasoning was sound for what
   * `isSystem` meant then: `Master Admin` held `*`, could be neither edited nor
   * deleted, and rendered as a row with no action menu above an "Assigned
   * Permissions (1)" line that undersold it by eighty. An unmanageable first row
   * teaches the reader to skip the first row.
   *
   * `isSystem` means something else now. It marks a role whose permissions the
   * BACKEND maintains: `permission-drift.ts` brings every system role up to
   * `config/permissions.json` on each boot, so `Administrator` always holds the
   * whole catalog and a newly added key needs no migration. None of that is a
   * reason to hide the row — it is the most consequential one on the page, and
   * an operator asking "who can do everything?" should be able to read it.
   *
   * Hiding it also cost something concrete, because this list was never the only
   * consumer of the flag. The admin directory and the invite modal filtered on
   * the same `isSystem`, so a system role could not be ASSIGNED either — which
   * made full access a thing the console could neither show nor hand out. That
   * is precisely why `Master Admin` was deleted, and it must not return through
   * a filter.
   *
   * Read-only is carried by the Name column's badge and the actions column
   * below, both of which already handle `isSystem` and both of which were
   * written for exactly this case. The API refuses the edit and the delete
   * regardless; this page only has to stop pretending the row is not there.
   */
  const roles = query.data ?? [];

  const deleteRole = useMutation({
    mutationFn: (role: Role) => api.admin.deleteRole(role.id),
    // An admin's effective permissions change when the role they hold is
    // deleted, so the directory's cache is stale from here too.
    onSuccess: async (_data, role) => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: keys.roles.all() });
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers.all() });
      toastSuccess(t('roles.deleteSucceeded', { name: role.name }));
    },
    // Deliberately NOT closing on error. 409 "still assigned" is the common
    // outcome, and the operator needs to read it against the role they named.
  });

  // 409 when a role is still assigned; 403 for over-grants.
  const banner = deleteRole.isError
    ? apiErrorMessage(deleteRole.error, t('roles.deleteFailed'))
    : '';

  const deletingId = deleteRole.isPending ? deleteRole.variables?.id : null;

  /*
   * SORTING HERE IS CLIENT-SIDE, and on this table that is the honest answer.
   *
   * `GET /admin/roles` is UNPAGINATED — no `page`, `limit` or `cursor`. It
   * returns every role as an array, which this page then filters, so `rows` IS
   * the dataset rather than a page of it and DataTable's comparator orders all
   * of it.
   *
   * ⚠️ It DOES accept `sort` and `order`, and this said it did not until
   * 11 Sep 2026. The correction matters because of the rule below: the endpoint
   * already has the server-side ordering this page would need, so "gain a
   * server-side handler" is a smaller change than it reads, and a reader who
   * believed the old sentence would think the API needed building first.
   *
   * The offered keys and the API's `ROLE_SORT_COLUMNS` deliberately DIVERGE:
   * `description` is sortable here and is absent there. That was briefly
   * "fixed" on 11 Sep 2026 and the fix was withdrawn, because a key in that map
   * is a promise of an INDEX — `admin-sort-indexes.spec.ts` asks the planner and
   * refuses an allowlist wider than the indexes serving it — so the one-line
   * change also bought a b-tree on a nullable text column of a ten-row table,
   * for a sort no caller performs while this page holds the whole dataset.
   *
   * So the key goes in on the day this page paginates, with the index that spec
   * will demand in the same commit. That is the instruction below arriving as a
   * failing test rather than as a comment somebody has to have read.
   *
   * R-2.5's objection is that sorting the 25 rows you happen to hold looks
   * identical to sorting the dataset. Here they are the same set, so no
   * `onSortChange` is passed and the client-side path is correct. Should this
   * endpoint ever paginate, these headers must gain a server-side handler in
   * the same commit or they become a lie.
   */
  const columns: Column<Role>[] = [
    {
      header: t('roles.colName'),
      sortable: true,
      sortKey: 'name',
      cell: (role) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{role.name}</span>
          {role.isSystem && (
            <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link">
              {t('settings.systemRole')}
            </span>
          )}
          {/* Says WHY this row has no actions. Without it the missing menu
              reads as a bug rather than as the rule it is. */}
          {role.id === admin?.roleId && (
            <span
              className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
              title={t('roles.yourRoleHint')}
            >
              {t('roles.yourRole')}
            </span>
          )}
        </span>
      ),
    },
    {
      header: t('roles.colDescription'),
      sortable: true,
      sortKey: 'description',
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
      /*
       * NOT sortable, even though "which role carries the most access" is a
       * fair question to want answered here.
       *
       * The cell renders a COUNT but the underlying field is `permissions`, an
       * array — and DataTable's comparator indexes the row by the sort key, so
       * it would receive the array itself. `compareValues` maps any non-primitive
       * to `''` deliberately, so every role would compare equal and the column
       * would appear to sort while doing nothing at all.
       *
       * Sorting by count needs either a derived numeric field on the row or a
       * per-column accessor, neither of which exists yet. Offering nothing beats
       * offering a control that silently no-ops.
       */
      sortable: false,
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
               *
               * YOUR OWN ROLE is the second such case. A role replaces its
               * holder's permission snapshot, so editing it edits you — the API
               * refuses it outright, and `/roles/[id]/edit` redirects. Deleting
               * is already impossible for a different reason (a role with
               * holders cannot be deleted, and you are a holder), so the whole
               * menu goes rather than one item.
               */
              role.isSystem || role.id === admin?.roleId ? null : (
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
          {/* `roles.create`. /roles/new gates on the same key, so the button and
              the page it opens agree — the mismatch this whole change exists to
              remove. */}
          {canCreateRoles && (
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
          clientPagination={ROLE_PAGING}
          empty={
            /*
             * Not `EmptyState`: this one carries a HINT as well as a message. A
             * fresh install has exactly the system roles and nothing else, and
             * that is the moment the prompt to create one is most useful.
             *
             * No card of its own any more. `DataTable` in `fill` mode renders
             * this INSIDE the table frame now, so the border and background it
             * used to draw would be a second card nested in the first. It
             * matches `EmptyState`'s shape instead — fill the cell, centre on
             * both axes.
             */
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center p-10 text-center">
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
