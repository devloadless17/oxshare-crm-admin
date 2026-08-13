'use client';

import { Ban, CircleCheck, Key, KeyRound, MailWarning, Pencil, Trash2 } from 'lucide-react';
import type { AdminUser, PendingInvite, Role } from '@/lib/api/admin';
import { DataTable, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
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
  /** `users.create`, which is what the API requires to revoke an invite. */
  canRevokeInvite: boolean;
}

/**
 * One row of the directory — an administrator, or an invite that will become
 * one.
 *
 * Flattened rather than a discriminated union of the two DTOs so that
 * `DataTable`'s client-side sort keeps working: it reads `sortKey` off the row,
 * and `name`, `email` and `status` have to be real properties for the
 * comparator to find them. The source object rides along for the cells and the
 * row actions, which do differ.
 */
type DirectoryRow = {
  id: string;
  name: string;
  email: string;
  /** `pending` is an INVITE, which is not an account yet — see below. */
  status: 'active' | 'suspended' | 'pending';
  roleId?: string;
  admin?: AdminUser;
  invite?: PendingInvite;
};

/**
 * The administrator directory — accounts AND outstanding invites.
 *
 * ## Why invites are rows here rather than a panel below
 *
 * They were a second table under the first, which split the one question this
 * screen answers — "who can get into this system?" — across two lists that
 * scrolled independently. An invite is a 48-hour bearer credential that CREATES
 * an admin account: it belongs in the answer, not in a footnote to it. As a row
 * with a `pending` status it also sorts and pages with everyone else, so
 * "Sam" is found by looking once whether or not Sam has accepted yet.
 *
 * The distinction that must survive the merge is that a pending row is NOT an
 * account: it has no session to suspend, no scope, and its only action is
 * revoke. Each cell says so in words rather than rendering a blank that reads
 * as missing data.
 *
 * ## The role column is READ-ONLY
 *
 * It used to hold a Select that reassigned a role inline. One click on a
 * dropdown, on a table row, rewrote an administrator's entire permission
 * snapshot and landed an audit entry — no confirmation, no sight of what the
 * new role actually grants, and a stray click on a trackpad did it. Role
 * changes belong in the edit modal, beside the permissions they determine and
 * the scope they interact with, behind an explicit Save.
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
 * The rows arrive as PROPS and the queries live on the page. There is
 * deliberately no `AsyncBoundary` here: `/admin-users` loads the directory
 * alongside the four vocabularies its edit modal needs, and a second boundary
 * inside this component would render a spinner against data already resolved.
 */
/*
 * `GET /admin/users` returns the whole directory and `GET /admin/invites` the
 * whole invite list, so the rows held ARE the dataset — which is also why the
 * client-side SORT on this table is honest (see the note on `columns` below).
 * Paging them locally follows from the same fact, and gives this screen the
 * footer every other table has.
 */
const ADMIN_PAGING = { noun: ['administrator', 'administrators'] as [string, string] };

export function AdminDirectoryTable({
  admins,
  invites,
  roles,
  currentAdminId,
  can,
  suspendingId,
  revokingId,
  onEdit,
  onResetPassword,
  onToggleStatus,
  onRevokeInvite,
}: {
  admins: AdminUser[];
  invites: PendingInvite[];
  roles: Role[];
  currentAdminId: string | undefined;
  can: DirectoryCapabilities;
  suspendingId: string | null | undefined;
  revokingId: string | null | undefined;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onToggleStatus: (user: AdminUser) => void;
  onRevokeInvite: (invite: PendingInvite) => void;
}) {
  const showActions = can.canEdit || can.canSuspend || can.canResetPassword || can.canRevokeInvite;

  // The API refuses self-changes; don't offer them. (The master tier is gone —
  // its legacy enum value gates nothing any more.)
  const isSelf = (user: AdminUser) => user.id === currentAdminId;

  /*
   * Invites LAST within an equal sort, so the directory still opens on the
   * people who are actually in the system. `DataTable` sorts what it is given,
   * so this is only the order of the unsorted view.
   */
  const rows: DirectoryRow[] = [
    ...admins.map((admin) => ({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      status: admin.status === 'suspended' ? ('suspended' as const) : ('active' as const),
      roleId: admin.roleId,
      admin,
    })),
    ...invites.map((invite) => ({
      id: invite.id,
      name: invite.name,
      email: invite.email,
      status: 'pending' as const,
      roleId: invite.roleId,
      invite,
    })),
  ];

  const roleName = (roleId: string | undefined) => roles.find((r) => r.id === roleId)?.name;

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
   * If either endpoint ever becomes paginated, this table must gain a
   * server-side `onSortChange` in the same commit, or these three headers
   * become the exact lie the withdrawal queue's used to be.
   */
  const columns: Column<DirectoryRow>[] = [
    {
      header: t('settings.colAdministrator'),
      sortable: true,
      sortKey: 'name',
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          {/* The one glyph that distinguishes a row which is not an account
              yet, next to the name rather than buried in a later column. */}
          {row.invite && (
            <MailWarning className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          )}
          {row.name}
          {row.admin && isSelf(row.admin) && (
            <span className="text-[10px] font-normal text-muted-foreground">
              {t('settings.you')}
            </span>
          )}
        </span>
      ),
      cellClassName: 'font-semibold text-foreground',
    },
    {
      header: t('settings.colEmail'),
      sortable: true,
      sortKey: 'email',
      cell: (row) => row.email,
      cellClassName: 'font-mono text-muted-foreground',
    },
    {
      header: t('settings.colRole'),
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-link">
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
           * remaining fallbacks are for an admin with per-admin permissions and
           * no role at all — a real state the API supports — and for an invite
           * sent without one. Both say so in words rather than leaking the enum
           * or leaving an empty cell.
           */}
          {roleName(row.roleId) ??
            (row.invite ? t('adminUsers.pendingRoleUnset') : t('adminUsers.noRole'))}
        </span>
      ),
      // A role is not something to sort a directory by, and the header would
      // otherwise become a sort button on a key the API never heard of.
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
      cell: (row) => {
        if (row.invite) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="w-fit rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
                {t('adminUsers.statusPending')}
              </span>
              {/*
               * The expiry, which the panel gave a column of its own. It is the
               * half of an invite that decides what to do about it: a link
               * dying tomorrow needs re-sending, not chasing.
               */}
              <span className="text-[10px] text-muted-foreground">
                {t('adminUsers.pendingExpires', {
                  date: new Date(row.invite.expiresAt).toLocaleString(),
                })}
              </span>
            </div>
          );
        }
        const suspended = row.status === 'suspended';
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
      cell: (row) => {
        // An invite has no scope yet — it is set on the account the invitee
        // creates. Saying so beats a cell that reads as "all clients".
        if (!row.admin) {
          return <span className="text-[11px]">{t('adminUsers.scopeAfterAccept')}</span>;
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px]">
              {row.admin.scopedTags.length === 0
                ? t('adminUsers.scopeAll')
                : t('adminUsers.scopeCount', { count: row.admin.scopedTags.length })}
            </span>
            {row.admin.maskedFields.length > 0 && (
              <span className="text-[10px]">
                {t('adminUsers.maskCount', { count: row.admin.maskedFields.length })}
              </span>
            )}
          </div>
        );
      },
      cellClassName: 'text-muted-foreground',
      sortable: false,
    },
    ...(showActions
      ? [
          actionsColumn<DirectoryRow>((row) => {
            /*
             * An invite has ONE action, and it is not a variation on the
             * account ones: there is no session to end, no password to reset
             * and nothing to edit until somebody accepts.
             */
            if (row.invite) {
              if (!can.canRevokeInvite) return null;
              const invite = row.invite;
              return (
                <RowActions
                  label={t('table.rowActions', { name: row.name })}
                  busy={revokingId === row.id}
                  items={[
                    {
                      label: t('adminUsers.revoke'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => onRevokeInvite(invite),
                    },
                  ]}
                />
              );
            }

            const user = row.admin;
            if (!user) return null;
            const suspended = user.status === 'suspended';
            /*
             * NOT gated on the legacy `master_admin` enum any more. That tier
             * was removed by the permission rework — the column is dead and
             * the API reads only its real invariants: you cannot rewrite your
             * OWN access, and `assertNotLastManager` refuses the one write
             * that would leave nobody able to manage roles or administrators.
             * Gating rows on the dead value made whichever accounts happened
             * to carry it silently uneditable — a stricter UI than the API,
             * enforcing a concept that no longer exists.
             */
            const editable = can.canEdit && !isSelf(user);
            const suspendable = can.canSuspend && !isSelf(user);

            return (
              <RowActions
                label={t('table.rowActions', { name: user.name })}
                busy={suspendingId === user.id}
                items={[
                  ...(editable
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
      rows={rows}
      rowKey={(row) => row.id}
      clientPagination={ADMIN_PAGING}
    />
  );
}
