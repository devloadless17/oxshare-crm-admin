'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminUser, PendingInvite, Role } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { ExportButton } from '@/components/export-button';
import { AdminDirectoryTable } from '@/components/rbac/admin-directory-table';
import { AdminFormModal, type AdminFormValues } from '@/components/rbac/admin-form-modal';
import { InviteAdminModal } from '@/components/rbac/invite-admin-modal';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * FR-RBAC-07 — create, view, edit and manage administrator accounts.
 *
 * Was the "Admin Users" tab of /settings, and only did the VIEW half plus role
 * reassignment. The other three arrived here:
 *
 *   create  → invite (its own screen), and the invite then appears in the
 *             directory as a `pending` row — which is what makes it something
 *             you can see and cancel rather than a mail you sent and forgot
 *   edit    → AdminFormModal: name, and per-admin permissions (FR-RBAC-02,
 *             which the API always supported and no screen ever reached)
 *   manage  → suspend / reactivate, the reversible alternative to deleting an
 *             administrator every audit_log row points at
 *
 * The permission catalog is fetched here because the edit modal needs it; the
 * roles list because both the modal and the reassignment dropdown do.
 */
export default function AdminUsersPage() {
  const { admin } = useAdmin();
  const canEditAdmins = hasPermission(admin, 'admins.edit');
  const canSuspend = hasPermission(admin, 'admins.suspend');
  // D-44. `users.create` is the admin-management grant in this catalogue — it is
  // what inviting an administrator requires. The API enforces the escalation
  // rule on top of it; this only decides whether to draw the button.
  // `admins.reset` is its OWN key now. It was folded into `users.create`
  // because both went through the invite endpoint (D-44) — so anyone who
  // could invite could also mail an existing administrator a credential that
  // signs them out everywhere, which is a different power.
  const canResetPassword = hasPermission(admin, 'admins.reset');
  const canInvite = hasPermission(admin, 'admins.create');
  const canViewRoles = hasPermission(admin, 'roles.view');

  const [editing, setEditing] = React.useState<AdminUser | null>(null);
  const [inviting, setInviting] = React.useState(false);

  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  /*
   * Invites are their OWN resource, even though they are rows in the same
   * table.
   *
   * They come from a different endpoint under a different permission —
   * `users.view` reads the directory, only `users.create` may revoke — and the
   * directory is the list an operator came for. Folding the two into one query
   * would make the whole table wait on, and fail with, a list that is usually
   * empty. Merged in the table, separate on the wire.
   */
  const invitesQuery = useResource(['admin-invites'], () => api.admin.getPendingInvites());
  const invites: PendingInvite[] = invitesQuery.data ?? [];

  const query = useResource(['admin-users'], async () => {
    /*
     * Four reads in one resource: the directory, the roles the edit modal
     * assigns from, the tag vocabulary its scope panel offers, and the
     * maskable-field vocabulary its override panel offers — VOCABULARIES the
     * frontend must not invent (R-4.5).
     *
     * The PERMISSION catalog stays gone with the per-person permission matrix:
     * access is a property of a ROLE, chosen on `/roles`. The FIELD catalog is
     * back with the mask OVERRIDE panel (restored 13 Aug) — the role's mask is
     * the default and this is the one-person exception.
     */
    const [roles, adminUsers, tags, fieldCatalog] = await Promise.all([
      api.admin.getRoles(),
      api.admin.getAdminUsers(),
      api.admin.getTags(),
      api.admin.getClientFields(),
    ]);
    return { roles, adminUsers, tags, fieldCatalog };
  });

  const roles: Role[] = query.data?.roles ?? [];
  const adminUsers: AdminUser[] = query.data?.adminUsers ?? [];
  const tags = query.data?.tags ?? [];
  const fieldCatalog = query.data?.fieldCatalog ?? {};

  /*
   * There is no `assignRole` mutation any more.
   *
   * The role column used to be a Select that reassigned inline: one click,
   * no confirmation, an administrator's whole permission snapshot rewritten
   * and an audit entry against a named person. A role change is now made in
   * the edit modal, where the permissions it grants and the scope it interacts
   * with are on screen beside it, behind an explicit Save. `saveAdmin` below
   * carries `roleId` on that path — the endpoint is the same one.
   */
  const revokeInvite = useMutation({
    mutationFn: (invite: PendingInvite) => api.admin.revokeInvite(invite.id),
    onSuccess: async (_data, invite) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
      toastSuccess(t('adminUsers.revokeSucceeded', { email: invite.email }));
    },
    /*
     * A revoke that came back 403 — `users.create` is required and
     * `users.view` is enough to SEE the row — used to leave the invite sitting
     * in the list with no explanation, which reads as the button being broken
     * rather than as a permission the operator lacks.
     */
    onError: (error) => toastError(error, t('adminUsers.revokeFailed')),
  });

  const saveAdmin = useMutation({
    mutationFn: ({ user, values }: { user: AdminUser; values: AdminFormValues }) =>
      api.admin.updateAdminUser(user.id, values),
    onSuccess: async (_data, { user }) => {
      setEditing(null);
      await invalidate();
      toastSuccess(t('adminUsers.saveSucceeded', { name: user.name }));
    },
    // Inline in the edit modal, which stays open on failure — the API refuses a
    // self-edit or an over-grant and says which, and that has to be read beside
    // the permission that caused it.
  });

  const setStatus = useMutation({
    mutationFn: (user: AdminUser) =>
      api.admin.setAdminStatus(user.id, user.status === 'suspended' ? 'active' : 'suspended'),
    onSuccess: async (_data, user) => {
      await invalidate();
      // `user.status` is the value BEFORE the write, so the branch reads
      // inverted: suspending someone who was active.
      toastSuccess(
        user.status === 'suspended'
          ? t('adminUsers.reactivateSucceeded', { name: user.name })
          : t('adminUsers.suspendSucceeded', { name: user.name }),
      );
    },
    onError: (error) => toastError(error, t('adminUsers.statusFailed')),
  });

  const sendReset = useMutation({
    mutationFn: (user: AdminUser) => api.admin.sendAdminPasswordReset(user.id),
    /*
     * Nothing in the directory changes, so nothing is invalidated — and that is
     * exactly why this one needed a toast most. The ONLY observable effect is an
     * email arriving in somebody else's inbox: the row does not change, no
     * spinner outlives the request, and the screen after a successful send was
     * pixel-identical to the screen after a click that did nothing.
     *
     * `adminUsers.resetSent` has existed as a message key this whole time and
     * was rendered by no component. This is its first use.
     */
    onSuccess: (_data, user) => toastSuccess(t('adminUsers.resetSent'), user.email),
    onError: (error) => toastError(error, t('adminUsers.resetFailed')),
  });

  const handleResetPassword = async (user: AdminUser) => {
    /*
     * Confirmed, because this is not reversible from the operator's side: it
     * arms a credential that grants that person's account, and completing it
     * signs them out everywhere. The name is in the prompt so a misclick on the
     * wrong row is caught before the email goes out, not after.
     */
    const ok = await confirm({
      title: t('adminUsers.confirmSendResetTitle', { name: user.name }),
      description: t('adminUsers.confirmSendReset', { name: user.name }),
      confirmLabel: t('adminUsers.confirmSendResetAction'),
    });
    if (ok) sendReset.mutate(user);
  };

  const handleRevokeInvite = async (invite: PendingInvite) => {
    const ok = await confirm({
      title: t('adminUsers.confirmRevokeTitle', { email: invite.email }),
      description: t('adminUsers.confirmRevoke'),
      confirmLabel: t('adminUsers.revoke'),
      destructive: true,
    });
    if (ok) revokeInvite.mutate(invite);
  };

  const handleToggleStatus = async (user: AdminUser) => {
    // Suspension signs someone out on their next request. Ask first — the same
    // guard role deletion gets, for the same reason.
    const suspended = user.status === 'suspended';
    const ok = await confirm({
      title: suspended
        ? t('adminUsers.confirmReactivateTitle', { name: user.name })
        : t('adminUsers.confirmSuspendTitle', { name: user.name }),
      description: suspended
        ? t('adminUsers.confirmReactivate', { name: user.name })
        : t('adminUsers.confirmSuspend', { name: user.name }),
      confirmLabel: suspended ? t('adminUsers.reactivate') : t('adminUsers.suspend'),
      destructive: !suspended,
    });
    if (ok) setStatus.mutate(user);
  };

  /*
   * The 403 banner is GONE — those refusals are toasts now.
   *
   * The API refuses a self-change, an over-grant, or any action on a master
   * admin, and its message names which. That message still reaches the operator
   * verbatim (`toastError` prefers it over the fallback); it just no longer
   * lands in a strip at the top of a page whose rows are below the fold, where
   * it also outlived the action and could only ever show ONE of three
   * mutations' errors — a chain of ternaries means a failed role change hid a
   * failed suspension.
   *
   * The two English literals that were here are proper message keys now, which
   * is the other thing the banner was quietly doing wrong.
   */

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('adminUsers.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('adminUsers.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton resource="admin-users" disabled={adminUsers.length === 0} />
          {canViewRoles && (
            <Link
              href="/roles"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted focus-outline"
            >
              <ShieldCheck className="h-4 w-4" />
              {t('adminUsers.rolesLink')}
            </Link>
          )}
          {canInvite && (
            /*
             * A MODAL, not a route. Every outcome of an invite belongs to the
             * list behind it — the invite becomes a `pending` row here — and
             * sending two in a row used to mean two round trips through a page
             * that shows nothing else.
             */
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover focus-outline"
            >
              <UserPlus className="h-4 w-4" />
              {t('invite.title')}
            </button>
          )}
        </div>
      </div>

      {/*
       * ONE table now, and it fills.
       *
       * There used to be two: the directory, and outstanding invites below it.
       * Both were `fill`, so both claimed `flex-1`, split the height and each
       * got its own scrollbar — and, worse, the one question this screen
       * answers ("who can get into this system?") was split across two lists
       * that scrolled independently. The invites are rows in the directory now.
       */}
      <AsyncBoundary
        status={query.status}
        label="Loading admin users"
        endpoints={['GET /admin/roles', 'GET /admin/users', 'GET /admin/permissions']}
        onRetry={query.refetch}
        errorMessage="Failed to load admin users."
        error={query.error}
        fill
      >
        {/*
         * No heading card above the table.
         *
         * It restated the page's own `<h1>` and strapline ("Admin Users" /
         * "Admin Account Directory") one element below them, then explained
         * invites in a third paragraph — three blocks of prose before the first
         * row, on a screen whose whole content is one table. The `pending`
         * status pill and its expiry line say what an invite is where the
         * operator is actually looking.
         */}
        <div className="flex min-h-0 flex-1 flex-col">
          <AdminDirectoryTable
            admins={adminUsers}
            /*
             * An invite list that failed to load contributes NO rows rather
             * than blocking the directory — `invitesQuery` is separate for
             * exactly that reason, and its own failure is a toast-free empty
             * set rather than a blank screen.
             */
            invites={invites}
            roles={roles}
            currentAdminId={admin?.id}
            can={{
              canEdit: canEditAdmins,
              canSuspend,
              canResetPassword,
              canRevokeInvite: canInvite,
            }}
            suspendingId={setStatus.isPending ? setStatus.variables?.id : null}
            revokingId={revokeInvite.isPending ? revokeInvite.variables?.id : null}
            onEdit={setEditing}
            onToggleStatus={(user) => void handleToggleStatus(user)}
            onResetPassword={(user) => void handleResetPassword(user)}
            onRevokeInvite={(invite) => void handleRevokeInvite(invite)}
          />
        </div>
      </AsyncBoundary>

      <InviteAdminModal
        open={inviting}
        // The directory has already fetched them for the edit modal, so the
        // invite form does not make a request of its own to fill one select.
        roles={roles}
        tags={tags}
        fieldCatalog={fieldCatalog}
        canScope={hasPermission(admin, 'admins.scope')}
        onClose={() => setInviting(false)}
        // The new invite is a row in the table behind this modal — it appears
        // there while the link is still on screen to copy.
        onInvited={() => void queryClient.invalidateQueries({ queryKey: ['admin-invites'] })}
      />

      {editing && (
        <AdminFormModal
          admin={editing}
          roles={roles}
          tags={tags}
          fieldCatalog={fieldCatalog}
          currentScope={editing.scopedTags.map((tag) => tag.tagId)}
          /*
           * `users.scope`, NOT `users.edit`. Reusing the edit permission would
           * mean anyone who can rename an administrator can also widen that
           * administrator's view of the entire client base.
           */
          canScope={hasPermission(admin, 'admins.scope')}
          busy={saveAdmin.isPending}
          error={
            saveAdmin.isError
              ? apiErrorMessage(saveAdmin.error, 'Failed to save the administrator.')
              : ''
          }
          onSubmit={(values) => saveAdmin.mutate({ user: editing, values })}
          onClose={() => {
            setEditing(null);
            saveAdmin.reset();
          }}
        />
      )}
    </div>
  );
}
