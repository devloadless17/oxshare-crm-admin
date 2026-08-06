'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Role } from '@/lib/api/admin';
import { RoleRow } from '@/components/rbac/role-row';
import { AsyncBoundary } from '@/components/async-boundary';
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
 * ── One list, not a grid of tiles ─────────────────────────────────────────
 *
 * Every role is a row in a single bordered card with a max height and its own
 * scroll. The previous version was a two-column grid of tiles, each printing
 * every granted permission as a chip — so a `*` role rendered eighty chips, the
 * tiles went ragged as roles differed in size, and the page grew without bound.
 * A count replaces the chips; the detail lives on the edit page.
 *
 * The card scrolls rather than the document, so the heading and the Create
 * button stay put while an operator reads down a long list.
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
  const roles = query.data ?? [];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('roles.title')}</h1>

        {canManageRoles && (
          <Button asChild size="sm">
            <Link href="/roles/new">
              <Plus />
              {t('settings.createRole')}
            </Link>
          </Button>
        )}
      </div>

      {banner && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
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
      >
        {roles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm font-semibold text-foreground">{t('roles.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('roles.emptyHint')}</p>
          </div>
        ) : (
          /*
           * `max-h-[70vh]` rather than a pixel height: the console is used on
           * laptop and desktop screens that differ by hundreds of pixels, and a
           * fixed height either wastes a tall screen or overflows a short one.
           * `divide-y` draws the separator between rows and NOT after the last,
           * which a per-row bottom border would.
           */
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {roles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  canManage={canManageRoles}
                  onDelete={setPendingDelete}
                  deleting={deletingId === role.id}
                />
              ))}
            </div>
          </div>
        )}
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
