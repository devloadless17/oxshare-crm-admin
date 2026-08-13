'use client';

import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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

/**
 * Create a role — was the "create" state of a modal on /roles.
 *
 * The two vocabularies load HERE rather than on the list, and together: an
 * editor that opened with the permission matrix but no field catalog would
 * offer half of what a role decides, which is worse than making the operator
 * wait for both (R-4.5).
 *
 * `canManage` is checked before rendering the form, not only in the sidebar.
 * `canAccess` gates the /roles prefix on `roles.view`, so an admin who may READ
 * roles can reach this URL directly; the API refuses the POST regardless, but
 * offering a form that always 403s is not an answer.
 */
export default function NewRolePage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'roles.create');
  const router = useRouter();
  const queryClient = useQueryClient();

  // The permission catalog and the RBAC-03 field vocabulary, together — the
  // mask section is back (13 Aug), so the form needs both to render.
  const query = useResource(['role-form-catalogs'], async () => {
    const [catalog, fieldCatalog] = await Promise.all([
      api.admin.getPermissions(),
      api.admin.getClientFields(),
    ]);
    return { catalog, fieldCatalog };
  });

  const save = useMutation({
    mutationFn: (values: RoleFormValues) => api.admin.createRole(values),
    onSuccess: async (_data, values) => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      router.push('/roles');
      /*
       * AFTER the navigation, and that is the point of a toast here rather than
       * anything on this page: the form unmounts on success, so there is no
       * component left to render a confirmation. The operator lands on the role
       * list and has to find their new row to know it worked. The Toaster lives
       * in the root layout, so it survives the route change.
       */
      toastSuccess(t('roles.createSucceeded', { name: values.name }));
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
        <h1 className="text-2xl font-bold tracking-tight">{t('roles.newTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('roles.newSubtitle')}</p>
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
          endpoints={['GET /admin/permissions', 'GET /admin/client-fields']}
          onRetry={query.refetch}
          errorMessage={t('roles.loadFailed')}
          error={query.error}
        >
          <RoleForm
            catalog={query.data?.catalog ?? {}}
            fieldCatalog={query.data?.fieldCatalog ?? {}}
            busy={save.isPending}
            error={save.isError ? apiErrorMessage(save.error, t('roles.saveFailed')) : ''}
            submitLabel={t('roles.saveNew')}
            onSubmit={(values) => save.mutate(values)}
          />
        </AsyncBoundary>
      )}
    </div>
  );
}
