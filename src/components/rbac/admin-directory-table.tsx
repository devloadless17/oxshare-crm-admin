'use client';

import { Ban, CircleCheck, Key, KeyRound, Pencil } from 'lucide-react';
import type { AdminUser, Role } from '@/lib/api/admin';
import { DataTable, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface DirectoryCapabilities {
  canEdit: boolean;
  canSuspend: boolean;
  /**
   * D-44. Gated on the same grant the API requires, and NOT on `isMasterRow`
   * the way edit and suspend are: masters are peers for reset specifically, so
   * hiding the control on a master row would hide the one case the feature
   * exists for — a locked-out master with no path back except the database.
   */
  canResetPassword: boolean;
}

/**
 * The administrator directory.
 *
 * THE BADGE IS READ, NOT ASSUMED. This table used to render a hardcoded
 * "Active" pill on every row, because `AdminProfileDto` carried no status field
 * — so a suspended administrator displayed as active on the one screen an
 * operator checks before trusting an account. Suspension was enforced the whole
 * time; only the screen was wrong, which is the worse half.
 *
 * Every control here is hidden in exactly the cases the API refuses: the signed-
 * in admin, and any master admin. Offering a button that always 403s teaches
 * operators that errors are normal.
 *
 * The rows arrive as a PROP and the query lives on the page. There is
 * deliberately no `AsyncBoundary` here: `/admin-users` loads the directory
 * alongside the four vocabularies its edit modal needs in one resource, and a
 * second boundary inside this component would render a spinner against data
 * that is already resolved.
 */
/*
 * `GET /admin/users` returns the whole directory, so the rows held ARE the
 * dataset — which is also why the client-side SORT on this table is honest
 * (see the note on `columns` below). Paging them locally follows from the same
 * fact, and gives this screen the footer every other table has.
 */
const ADMIN_PAGING = { noun: ['administrator', 'administrators'] as [string, string] };

export function AdminDirectoryTable({
  admins,
  roles,
  currentAdminId,
  can,
  assigningId,
  suspendingId,
  onAssignRole,
  onEdit,
  onResetPassword,
  onToggleStatus,
}: {
  admins: AdminUser[];
  roles: Role[];
  currentAdminId: string | undefined;
  can: DirectoryCapabilities;
  assigningId: string | null | undefined;
  suspendingId: string | null | undefined;
  onAssignRole: (user: AdminUser, roleId: string) => void;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onToggleStatus: (user: AdminUser) => void;
}) {
  const showActions = can.canEdit || can.canSuspend || can.canResetPassword;

  // The API refuses self-changes and master changes; don't offer them.
  const isMaster = (user: AdminUser) => user.role === 'master_admin';
  const isSelf = (user: AdminUser) => user.id === currentAdminId;

  /*
   * SORTING HERE IS CLIENT-SIDE, AND THAT IS CORRECT ON THIS TABLE ALONE.
   *
   * `GET /admin/users` takes no `page`, no `limit`, no `sort` and no `order` —
   * it is a bare `select().from(admins)` with no ORDER BY, and it returns the
   * whole directory as an array. So `rows` here IS the dataset, not a page of
   * it, and DataTable's own comparator orders every administrator there is.
   *
   * That is precisely the condition R-2.5 objects to the absence of: its
   * complaint is that sorting 25 held rows looks identical to sorting the
   * dataset. When the held rows ARE the dataset the two are the same operation,
   * and no `onSortChange` is passed — DataTable's client-side path is the right
   * one, and it suppresses its own scope note because there is no next page to
   * warn about.
   *
   * If this endpoint ever becomes paginated, this table must gain a server-side
   * `onSortChange` in the same commit, or these three headers become the exact
   * lie the withdrawal queue's used to be.
   */
  const columns: Column<AdminUser>[] = [
    {
      header: t('settings.colAdministrator'),
      sortable: true,
      sortKey: 'name',
      cell: (user) => (
        <>
          {user.name}
          {isSelf(user) && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              {t('settings.you')}
            </span>
          )}
        </>
      ),
      cellClassName: 'font-semibold text-foreground',
    },
    {
      header: t('settings.colEmail'),
      sortable: true,
      sortKey: 'email',
      cell: (user) => user.email,
      cellClassName: 'font-mono text-muted-foreground',
    },
    {
      header: t('settings.colRole'),
      cell: (user) =>
        can.canEdit && !isMaster(user) && !isSelf(user) ? (
          <Select
            value={user.roleId ?? ''}
            onValueChange={(val) => onAssignRole(user, val)}
            disabled={assigningId === user.id}
          >
            <SelectTrigger className="h-8 text-[11px] font-semibold w-40">
              <SelectValue placeholder={user.roleId ? 'Change role…' : 'Custom permissions'} />
            </SelectTrigger>
            <SelectContent>
              {roles
                .filter((r) => !r.isSystem)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-link border border-primary/20">
            <Key className="h-3 w-3" />
            {/*
             * The assigned ROLE NAME, never the raw `role` enum.
             *
             * This used to fall back to `user.role`, which printed the database
             * value `master_admin` in a column whose every other cell holds a
             * role an operator created and can assign. It reads as a role that
             * exists and is simply missing from the dropdown.
             *
             * `0036_administrator_role.sql` gives every master admin the
             * `Administrator` role, so the lookup now succeeds for them. The
             * remaining fallback is for an admin with per-admin permissions and
             * no role at all — a real state the API supports — and it says so
             * in words rather than leaking the enum.
             */}
            {roles.find((r) => r.id === user.roleId)?.name ?? t('adminUsers.customPermissions')}
          </span>
        ),
      // A role dropdown is not something to sort a directory by, and the header
      // would otherwise become a sort button on a key the API never heard of.
      sortable: false,
    },
    {
      header: t('settings.colStatus'),
      // Sorted on the underlying `status` field, not the rendered pill —
      // otherwise the comparator has nothing to read, since `cell` returns JSX.
      sortable: true,
      sortKey: 'status',
      // READ, not assumed — see the note on the component. A hardcoded "Active"
      // here once showed a suspended administrator as trustworthy.
      cell: (user) => {
        const suspended = user.status === 'suspended';
        return (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              suspended ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            }`}
          >
            {suspended ? t('adminUsers.statusSuspended') : t('clients.statusActive')}
          </span>
        );
      },
    },
    {
      /*
       * RBAC-03's state, ON THE ROW.
       *
       * The same reasoning as the status pill above, which used to be
       * hardcoded "Active" and so showed a suspended administrator as
       * active on the one screen an operator checks before trusting an
       * account. An override that can only be seen by opening a modal
       * is invisible drift: if eight of twenty agents have one, the
       * role tells you nothing and nobody would know.
       */
      header: t('adminUsers.colScope'),
      cell: (user) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px]">
            {isMaster(user) || user.scopedTags.length === 0
              ? t('adminUsers.scopeAll')
              : t('adminUsers.scopeCount', { count: user.scopedTags.length })}
          </span>
          {user.maskedFields.length > 0 && (
            <span className="text-[10px]">
              {t('adminUsers.maskCount', { count: user.maskedFields.length })}
            </span>
          )}
        </div>
      ),
      cellClassName: 'text-muted-foreground',
      sortable: false,
    },
    ...(showActions
      ? [
          actionsColumn<AdminUser>((user) => {
            const suspended = user.status === 'suspended';
            const reassignable = can.canEdit && !isMaster(user) && !isSelf(user);
            const suspendable = can.canSuspend && !isMaster(user) && !isSelf(user);

            return (
              <RowActions
                label={t('table.rowActions', { name: user.name })}
                busy={suspendingId === user.id}
                items={[
                  ...(reassignable
                    ? [
                        {
                          label: t('adminUsers.edit'),
                          icon: Pencil,
                          onSelect: () => onEdit(user),
                        },
                      ]
                    : []),
                  /*
                   * D-44. NOT gated on `isMasterRow` the way edit and suspend
                   * are: masters are peers for reset specifically, so hiding
                   * this on a master row would hide the one case the feature
                   * exists for — a locked-out master with no path back except
                   * the database.
                   */
                  ...(can.canResetPassword && !isSelf(user)
                    ? [
                        {
                          label: t('adminUsers.sendResetLink'),
                          icon: KeyRound,
                          onSelect: () => onResetPassword(user),
                        },
                      ]
                    : []),
                  ...(suspendable
                    ? [
                        {
                          label: suspended ? t('adminUsers.reactivate') : t('adminUsers.suspend'),
                          icon: suspended ? CircleCheck : Ban,
                          // Suspension signs someone out on their next request,
                          // so it carries the destructive styling even though
                          // reactivation — the same control, other direction —
                          // does not destroy anything.
                          destructive: !suspended,
                          separatorBefore: true,
                          onSelect: () => onToggleStatus(user),
                        },
                      ]
                    : []),
                ]}
              />
            );
          }, t('adminUsers.colActions')),
        ]
      : []),
  ];

  return (
    <DataTable
      fill
      caption={t('settings.directoryTitle')}
      columns={columns}
      rows={admins}
      rowKey={(user) => user.id}
      clientPagination={ADMIN_PAGING}
    />
  );
}
