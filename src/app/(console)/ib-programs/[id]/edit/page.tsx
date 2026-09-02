'use client';

import { use } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import type { IbProgram } from '@/lib/api/admin';
import { IbProgramForm, type IbProgramFormValues } from '@/components/ib/ib-program-form';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Edit a commission programme — was the "edit" state of a modal on
 * /ib-programs.
 *
 * ## The programme is FETCHED here rather than passed from the list
 *
 * A row the operator clicked minutes ago is a snapshot, and this form seeds
 * every rate from it. Editing a stale ladder and pressing Save writes the
 * numbers as they were on that screen, silently reverting whatever somebody
 * else changed in between — on the one screen where the values ARE what
 * partners are paid.
 *
 * It also makes the URL work on its own. A modal state cannot be linked to, so
 * "look at Gold's ladder" was a description rather than an address.
 */
export default function EditIbProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { admin } = useAdmin();
  /* `ib.programs.edit` — the key the API enforces on the PATCH, and a
     separate power from `create`: a role may hold one without the other. */
  const canManage = hasPermission(admin, 'ib.programs.edit');
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useResource<IbProgram[]>(keys.ibPrograms.all(), (signal) =>
    api.admin.getIbPrograms(signal),
  );
  const program = query.data?.find((entry) => entry.id === id);

  const save = useMutation({
    mutationFn: (values: IbProgramFormValues) => api.admin.updateIbProgram(id, values),
    onSuccess: async (_data, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.ibPrograms.all() });
      router.push('/ib-programs');
      toastSuccess(t('ibPrograms.saveSucceeded', { name: values.name }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/ib-programs"
          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('ibPrograms.backToList')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {program ? program.name : t('ibPrograms.editTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('ibPrograms.editSubtitle')}</p>
      </div>

      {!canManage ? (
        <AccessDenied />
      ) : (
        <AsyncBoundary
          status={query.status}
          label={t('common.loading')}
          endpoints={['GET /admin/ib-programs']}
          onRetry={query.refetch}
          errorMessage={t('ibPrograms.loadFailed')}
          error={query.error}
        >
          {program ? (
            <IbProgramForm
              /*
               * KEYED on the programme, so navigating between two edit URLs
               * REMOUNTS with the new one's numbers. Re-seeding state in an
               * effect renders once with the previous programme's rates before
               * correcting itself, and on a payout screen that intermediate
               * state is one somebody could read and act on.
               */
              key={program.id}
              program={program}
              saving={save.isPending}
              error={save.isError ? apiErrorMessage(save.error, t('ibPrograms.saveFailed')) : ''}
              submitLabel={t('ibPrograms.save')}
              onCancel={() => router.push('/ib-programs')}
              onSubmit={(values) => save.mutate(values)}
            />
          ) : (
            /* Loaded, and no such programme — deleted, or a mistyped id. Said
               plainly rather than rendering an empty form that would CREATE
               something on save. */
            <div
              className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground"
              role="status"
            >
              {t('ibPrograms.notFound')}
            </div>
          )}
        </AsyncBoundary>
      )}
    </div>
  );
}
