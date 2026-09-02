'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { ExternalLink } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLinkFormModal,
  type ExternalLinkFormValues,
} from '@/components/external-links/external-link-form-modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The links the operator puts on the client portal's sidebar.
 *
 * An economic calendar, the broker's help centre, a Telegram channel, a
 * market-analysis blog. A row added here appears in the menu of every signed-in
 * client, so this screen is closer to the platform download links than to a
 * settings field — and it carries its own permission keys for that reason.
 *
 * ## Hiding is the normal way to take one down
 *
 * Deleting works and orphans nothing, but it takes the title, the description
 * and the position with it — so the fix for a supplier's five-minute outage
 * would be retyping the row. `enabled: false` takes the link off the client menu
 * and keeps all three, which is what an operator almost always means. The row
 * menu puts hide first for that reason, with delete behind a separator and a
 * confirmation.
 *
 * Deliberately shaped like `/leverages` and `/currencies` — same list, same row
 * menu, same modal. The one thing this screen does that they do not is render
 * the destination as a real anchor, because "does this link go where I think it
 * does" is the question an operator has about a row here.
 */
export default function ExternalLinksPage() {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  /*
   * Three keys, not one. `create`, `edit` and `delete` are separate grants on
   * the API, so a role holding only `externallinks.edit` can hide a link
   * without being able to remove one — and the controls follow, rather than
   * offering an action the API will refuse.
   */
  const canCreate = hasPermission(admin, 'externallinks.create');
  const canEdit = hasPermission(admin, 'externallinks.edit');
  const canDelete = hasPermission(admin, 'externallinks.delete');
  const canManage = canCreate || canEdit || canDelete;

  const query = useResource(keys.externalLinks.all(), (signal) =>
    api.admin.getExternalLinks(signal),
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExternalLink | null>(null);
  const [formError, setFormError] = React.useState<string | undefined>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.externalLinks.all() });

  const save = useMutation({
    mutationFn: (values: ExternalLinkFormValues) =>
      editing
        ? api.admin.updateExternalLink(editing.id, {
            title: values.title,
            // Sent even when empty: `''` CLEARS the description, which is how a
            // stale line of copy comes off without a control of its own.
            description: values.description,
            url: values.url,
            enabled: values.enabled,
            sortOrder: values.sortOrder,
          })
        : api.admin.createExternalLink({
            title: values.title,
            description: values.description || undefined,
            url: values.url,
            enabled: values.enabled,
            /*
             * ALWAYS sent, never conditionally.
             *
             * This was `...(values.sortOrder ? { sortOrder } : {})`, which is
             * the falsy-zero bug in its natural habitat: position 0 is the TOP
             * of the sidebar, and dropping the field made the API append
             * instead. Choosing "first" put the link last, silently. The form
             * now always has an answer, so there is nothing to omit.
             */
            sortOrder: values.sortOrder,
          }),
    onSuccess: async () => {
      await invalidate();
      setFormOpen(false);
      setFormError(undefined);
      toastSuccess(editing ? t('externalLinks.updated') : t('externalLinks.created'));
    },
    /*
     * Inline in the modal, which stays OPEN. The refusals here are the
     * informative part — "a link must be http or https", "that is not a
     * complete URL" — and closing the form would throw away both the
     * explanation and what the operator had typed.
     */
    onError: (error) => setFormError(apiErrorMessage(error, t('externalLinks.saveFailed'))),
  });

  const toggleEnabled = useMutation({
    mutationFn: (row: ExternalLink) =>
      api.admin.updateExternalLink(row.id, { enabled: !row.enabled }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toastSuccess(row.enabled ? t('externalLinks.hidden') : t('externalLinks.shown'));
    },
    onError: (error) => toastError(error, t('externalLinks.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteExternalLink(id),
    onSuccess: async () => {
      await invalidate();
      toastSuccess(t('externalLinks.deleted'));
    },
    onError: (error) => toastError(error, t('externalLinks.deleteFailed')),
  });

  const confirmDelete = async (row: ExternalLink) => {
    const ok = await confirm({
      title: t('externalLinks.confirmDeleteTitle', { title: row.title }),
      description: t('externalLinks.confirmDelete'),
      confirmLabel: t('externalLinks.delete'),
      destructive: true,
    });
    if (ok) remove.mutate(row.id);
  };

  const rows = query.data ?? [];

  const columns: Column<ExternalLink>[] = [
    {
      header: t('externalLinks.colTitle'),
      cell: (row) => <span className="text-sm font-semibold">{row.title}</span>,
    },
    {
      header: t('externalLinks.colDescription'),
      cell: (row) =>
        row.description ? (
          <span className="line-clamp-2 max-w-xs text-xs text-muted-foreground">
            {row.description}
          </span>
        ) : (
          /* Not an absence to apologise for: a link called "Economic calendar"
             needs no gloss, and the portal renders the entry either way. */
          <span className="text-xs text-muted-foreground/60">
            {t('externalLinks.noDescription')}
          </span>
        ),
    },
    {
      header: t('externalLinks.colUrl'),
      cell: (row) => (
        /*
         * A real anchor, because "does this go where I think it does" is the
         * question an operator has about a row here, and a truncated string
         * they have to copy out answers it badly.
         *
         * `rel="noopener noreferrer"` even though the value came from this
         * console: it is stored operator input, and the API's http(s) check is
         * what makes it safe to render at all — this adds the second half, so
         * the destination gets no handle on the opener window and no referrer.
         */
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.url}
          aria-label={t('externalLinks.openInNewTab', { title: row.title })}
          className="focus-outline block max-w-[22rem] truncate text-xs text-link hover:underline"
        >
          {row.url}
        </a>
      ),
    },
    {
      header: t('externalLinks.colStatus'),
      cell: (row) =>
        row.enabled ? (
          <Badge variant="success">{t('externalLinks.statusShown')}</Badge>
        ) : (
          /* "Hidden", not "Disabled" — the link works, it is simply not on the
             client's menu. The row keeps everything about it. */
          <Badge variant="warning">{t('externalLinks.statusHidden')}</Badge>
        ),
    },
    {
      header: t('externalLinks.colOrder'),
      align: 'right',
      /*
       * `+ 1`, because `sort_order` is zero-based in the database and no
       * operator reads "0" as the top of a menu. The form's position select
       * counts from 1 for the same reason, so the two agree — and the raw value
       * stays where it belongs, on the wire.
       */
      cell: (row) => (
        <span className="tabular text-xs text-muted-foreground">{row.sortOrder + 1}</span>
      ),
    },
    ...(canManage
      ? [
          actionsColumn<ExternalLink>(
            (row) => (
              <RowActions
                busy={toggleEnabled.isPending || remove.isPending}
                label={t('externalLinks.actionsFor', { title: row.title })}
                items={[
                  ...(canEdit
                    ? [
                        {
                          label: t('externalLinks.edit'),
                          icon: Pencil,
                          onSelect: () => {
                            setEditing(row);
                            setFormError(undefined);
                            setFormOpen(true);
                          },
                        },
                        {
                          // Hiding is an EDIT, not a delete — it takes the link
                          // off the client menu and keeps the row intact.
                          label: row.enabled ? t('externalLinks.hide') : t('externalLinks.show'),
                          icon: row.enabled ? EyeOff : Eye,
                          onSelect: () => toggleEnabled.mutate(row),
                        },
                      ]
                    : []),
                  ...(canDelete
                    ? [
                        {
                          label: t('externalLinks.delete'),
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: canEdit,
                          onSelect: () => void confirmDelete(row),
                        },
                      ]
                    : []),
                ]}
              />
            ),
            t('externalLinks.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('externalLinks.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('externalLinks.subtitle')}</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(undefined);
              setFormOpen(true);
            }}
            className="focus-outline inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('externalLinks.add')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('externalLinks.loading')}
        endpoints={['GET /admin/external-links']}
        onRetry={query.refetch}
        errorMessage={t('externalLinks.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          fill
          loading={query.status === 'loading'}
          empty={<EmptyState icon={Link2} message={t('externalLinks.empty')} />}
        />
      </AsyncBoundary>

      {/*
        RENDERED ONLY WHILE OPEN, which is what makes "seeded at mount" mean
        "seeded when the operator opened the form".
        
        Mounted unconditionally it seeded once, on the page's FIRST render —
        before `useResource` had answered, so `linkCount` was 0. The add form
        then offered one slot and defaulted to position 0, and neither corrected
        itself when the links arrived, because nothing remounted it. Every new
        link went to the TOP of the sidebar unless the operator noticed and
        changed it.
        
        Keying on `rows.length` would also fix that and would be worse: a
        background refetch that changed the count would remount the form under
        somebody mid-sentence and throw away what they had typed. `Modal`
        already returns null while closed, so this costs nothing.
      */}
      {formOpen && (
        <ExternalLinkFormModal
          /*
           * KEYED on the subject, so switching rows remounts the form and its
           * fields re-seed from the new link — see the component's note on why
           * that is not done with an effect.
           */
          key={editing ? `edit-${editing.id}` : 'add'}
          open={formOpen}
          /*
           * The list the position select is built from. Passed as a COUNT rather
           * than the rows themselves: the options are positions, not links, and
           * handing over the rows would invite the form to render titles it
           * would then have to keep in step with a reorder happening under it.
           */
          linkCount={rows.length}
          editing={
            editing
              ? {
                  title: editing.title,
                  description: editing.description ?? '',
                  url: editing.url,
                  enabled: editing.enabled,
                  sortOrder: editing.sortOrder,
                }
              : null
          }
          saving={save.isPending}
          error={formError}
          onClose={() => {
            setFormOpen(false);
            setFormError(undefined);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      )}
    </div>
  );
}
