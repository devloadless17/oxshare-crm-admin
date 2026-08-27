'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { IbProgramForm, type IbProgramFormValues } from '@/components/ib/ib-program-form';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied } from '@/components/access-denied';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Create a commission programme — was the "create" state of a modal on
 * /ib-programs.
 *
 * A programme is a rate card: a mode, the revenue it is priced on, a ladder of
 * any length, a client rebate and an order. The ladder grows a row per level,
 * so the part an operator is actually reasoning about is the tallest thing on
 * the screen — and a modal answers that by scrolling inside itself, hiding the
 * running total and the Save button together.
 *
 * `canManage` is checked BEFORE rendering the form, not only in the sidebar.
 * `canAccess` gates the /ib-programs prefix on `ib.view`, so an admin who may
 * READ programmes can reach this URL directly. The API refuses the POST
 * regardless, but offering a form that always 403s is not an answer.
 */
export default function NewIbProgramPage() {
  const { admin } = useAdmin();
  /*
   * `ib.programs.create` — the key the API enforces on the POST.
   *
   * NOT `ib.programs.manage`, which does not exist: the catalogue publishes
   * `create`, `edit` and `delete` separately. `hasPermission` returns false for
   * an unknown key, so an invented one denies EVERY admin, including a master
   * — a page nobody can use, failing the same way a genuine refusal does.
   */
  const canManage = hasPermission(admin, 'ib.programs.create');
  const router = useRouter();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (values: IbProgramFormValues) => api.admin.createIbProgram(values),
    onSuccess: async (_data, values) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'ib-programs'] });
      router.push('/ib-programs');
      /*
       * AFTER the navigation, and that is why this is a toast rather than
       * anything on this page: the form unmounts on success, so there is no
       * component left to render a confirmation. The operator lands on the list
       * and would otherwise have to find their new row to know it worked. The
       * Toaster lives in the root layout, so it survives the route change.
       */
      toastSuccess(t('ibPrograms.createSucceeded', { name: values.name }));
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
        <h1 className="text-2xl font-bold tracking-tight">{t('ibPrograms.createTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('ibPrograms.createSubtitle')}</p>
      </div>

      {!canManage ? (
        <AccessDenied />
      ) : (
        <IbProgramForm
          saving={save.isPending}
          error={save.isError ? apiErrorMessage(save.error, t('ibPrograms.saveFailed')) : ''}
          submitLabel={t('ibPrograms.createSave')}
          onCancel={() => router.push('/ib-programs')}
          onSubmit={(values) => save.mutate(values)}
        />
      )}
    </div>
  );
}
