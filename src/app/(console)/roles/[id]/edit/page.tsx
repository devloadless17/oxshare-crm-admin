'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { RoleForm, type RoleFormValues } from '@/components/rbac/role-form';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Edit one role — was the "edit" state of a modal on /roles.
 *
 * ── The role is fetched, not passed ───────────────────────────────────────
 *
 * The modal received the `Role` object the list already held. A route cannot:
 * this URL is reachable from a bookmark, a refresh, or a link someone pasted
 * into chat, with no list in front of it. So it loads the roles and finds the
 * one named in the path.
 *
 * `getRoles()` rather than a by-id call because the API has no
 * `GET /admin/roles/:id` — the list is the only read. Reusing the `['roles']`
 * query key means arriving from the list is served from cache and costs no
 * request, while a cold load fetches once.
 *
 * ── Two refusals that are NOT errors ──────────────────────────────────────
 *
 * A missing id and a system role both render a message rather than a form.
 * A system role is refused by the backend, and the roles table offers no Edit
 * action for one — but the URL is still typeable, and "the form saved and then
 * 403'd" is a worse answer than "this cannot be edited".
 */
export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const roleId = params?.id ?? '';
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'roles.edit');
  const router = useRouter();
  const queryClient = useQueryClient();

  // The roles list, the permission catalog, and the RBAC-03 field vocabulary —
  // the mask section is back (13 Aug), so the form needs all three.
  const query = useResource(keys.roles.edit(roleId), async () => {
    const [roles, catalog, fieldCatalog] = await Promise.all([
      api.admin.getRoles(),
      api.admin.getPermissions(),
      api.admin.getClientFields(),
    ]);
    return { role: roles.find((r) => r.id === roleId) ?? null, catalog, fieldCatalog };
  });

  const role = query.data?.role ?? null;

  const save = useMutation({
    mutationFn: (values: RoleFormValues) => api.admin.updateRole(roleId, values),
    onSuccess: async (_data, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.roles.all() });
      // A role's permissions decide what its holders may do, so the directory's
      // cache is stale from here too.
      await queryClient.invalidateQueries({ queryKey: keys.adminUsers.all() });
      router.push('/roles');
      // After the navigation — the form unmounts, so the root-layout Toaster is
      // the only thing left that can confirm the save. See roles/new.
      toastSuccess(t('roles.saveSucceeded', { name: values.name }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/roles"
          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('roles.backToRoles')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('roles.editTitle', { name: role?.name ?? '' })}
        </h1>
        <p className="text-sm text-muted-foreground">{t('roles.editSubtitle')}</p>
      </div>

      {!canManage ? (
        <div
          className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
          role="alert"
        >
          {t('session.deniedBody')}
        </div>
      ) : (
        <AsyncBoundary
          status={query.status}
          label={t('common.loading')}
          endpoints={['GET /admin/roles', 'GET /admin/permissions', 'GET /admin/client-fields']}
          onRetry={query.refetch}
          errorMessage={t('roles.loadFailed')}
          error={query.error}
        >
          {!role ? (
            <div
              className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
              role="alert"
            >
              {t('roles.notFound')}
            </div>
          ) : role.isSystem ? (
            <div
              className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
              role="alert"
            >
              {t('roles.systemReadOnly')}
            </div>
          ) : /*
           * YOUR OWN ROLE — the same shape as a system role, and for a
           * related reason: the API refuses the write either way, so the
           * form would be a way to lose your work rather than a way to
           * save it. The roles list hides the Edit action too; this branch
           * is what makes the URL itself safe when it is typed, bookmarked
           * or followed from an older tab.
           */
          role.id === admin?.roleId ? (
            <div
              className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
              role="alert"
            >
              {t('roles.selfReadOnly')}
            </div>
          ) : (
            <RoleForm
              // Remounts when the loaded role changes, so the fields hold that
              // role rather than the useState defaults captured on first render.
              key={role.id}
              initial={role}
              catalog={query.data?.catalog ?? {}}
              fieldCatalog={query.data?.fieldCatalog ?? {}}
              busy={save.isPending}
              error={save.isError ? apiErrorMessage(save.error, t('roles.saveFailed')) : ''}
              submitLabel={t('roles.saveEdit')}
              onSubmit={(values) => save.mutate(values)}
            />
          )}
        </AsyncBoundary>
      )}
    </div>
  );
}
