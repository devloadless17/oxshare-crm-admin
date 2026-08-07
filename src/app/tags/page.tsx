'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Tags as TagsIcon, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import type { ClientTag, ClientTagWithCount } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { ExportButton } from '@/components/export-button';
import { Badge } from '@/components/ui/badge';
import { TagFormModal, type TagFormValues } from '@/components/tags/tag-form-modal';
import { t } from '@/lib/i18n';

/**
 * ADM-14's vocabulary — the tags themselves, not the clients carrying them.
 *
 * IT LIVES IN THE MANAGEMENT SECTION, beside Roles and Admin Users, rather than
 * as a tab in Settings. A tag stopped being merely descriptive when
 * `admin_client_tag_scopes` arrived: it now decides which administrators can
 * see a client, which makes it an access-control primitive and puts it with the
 * other privileged, audited objects.
 *
 * Assignment happens where the work is — on a client's profile — not here. This
 * screen answers "what segments exist and how big are they".
 *
 * ── THERE ARE NO FILTERS HERE, AND THAT IS NOT AN OVERSIGHT ─────────────────
 *
 * `GET /admin/tags` takes no query parameters at all — `AdminTagsController.list()`
 * has an empty signature and returns the whole vocabulary in one response. So
 * there is nothing for a filter control to drive: it could only filter the rows
 * already in the browser, which is the client-side-filtering lie R-2.5 names
 * (it looks identical to filtering the dataset and is wrong the moment the list
 * outgrows one response).
 *
 * A tag vocabulary is also the one list here that does not grow without bound —
 * ADM-14 is segmentation, not folksonomy — so paging and filtering it would be
 * machinery for a problem this screen does not have. If the vocabulary ever
 * does outgrow a single response, the filter and the endpoint's parameters
 * arrive TOGETHER; a control the server cannot honour is worse than none.
 *
 * The table itself is the shared one: `DataTable fill` inside `AsyncBoundary
 * fill`, the same treatment `/clients` and `/kyc` use, so a failed load says so
 * rather than rendering as an empty vocabulary.
 */
export default function TagsPage() {
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'tags.manage');
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState<ClientTag | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const query = useResource<ClientTagWithCount[]>(['tags'], (signal) => api.admin.getTags(signal));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tags'] });

  const saveTag = useMutation({
    mutationFn: (values: TagFormValues) =>
      editing ? api.admin.updateTag(editing.id, values) : api.admin.createTag(values),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
    },
  });

  const deleteTag = useMutation({
    mutationFn: (id: string) => api.admin.deleteTag(id),
    onSuccess: invalidate,
  });

  /*
   * WHICH row is deleting, not merely THAT one is.
   *
   * `deleteTag.variables` is the id passed to the in-flight `mutate`, so the
   * spinner lands on the row being acted on. The buttons this replaced disabled
   * every row's delete during any delete, which read as the whole table
   * freezing over one action.
   */
  const deletingId = deleteTag.isPending ? deleteTag.variables : undefined;

  const openCreate = () => {
    setEditing(undefined);
    saveTag.reset();
    setFormOpen(true);
  };

  const openEdit = (tag: ClientTag) => {
    setEditing(tag);
    saveTag.reset();
    setFormOpen(true);
  };

  const confirmDelete = (tag: ClientTagWithCount) => {
    /*
     * The confirmation names the CONSEQUENCE, not "are you sure".
     *
     * Two of them, and the second is the one nobody expects: deleting a tag
     * removes it from every client that carries it, AND any administrator
     * scoped to it loses that scope. The API refuses the second case outright
     * (an empty scope means UNRESTRICTED, so cascading would promote them to
     * seeing every client) — but saying so here means the operator learns it
     * before the refusal rather than from it.
     */
    if (!window.confirm(t('tags.confirmDelete', { label: tag.label, count: tag.clientCount }))) {
      return;
    }
    deleteTag.mutate(tag.id);
  };

  const columns: Column<ClientTagWithCount>[] = [
    {
      header: t('tags.colTag'),
      cell: (tag) => (
        <Badge
          variant="tag"
          style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined}
        >
          {tag.label}
        </Badge>
      ),
    },
    {
      header: t('tags.colSlug'),
      cell: (tag) => tag.slug,
      cellClassName: 'font-mono text-[11px] text-muted-foreground',
    },
    {
      header: t('tags.colDescription'),
      cell: (tag) => tag.description ?? '—',
      cellClassName: 'text-muted-foreground',
    },
    {
      header: t('tags.colClients'),
      cell: (tag) =>
        tag.clientCount === 0 ? (
          <span className="text-muted-foreground">0</span>
        ) : (
          // The link that made URL-state on the client list non-optional. A
          // count nobody can act on is a number on a screen.
          <Link
            href={`/clients?tag=${tag.slug}`}
            className="text-link hover:underline focus-outline"
          >
            {t('tags.clientCount', { count: tag.clientCount })}
          </Link>
        ),
    },
    ...(canManage
      ? [
          actionsColumn<ClientTagWithCount>(
            (tag) => (
              <RowActions
                label={t('table.rowActions', { name: tag.label })}
                busy={deleteTag.isPending && deletingId === tag.id}
                items={[
                  { label: t('tags.edit'), icon: Pencil, onSelect: () => openEdit(tag) },
                  {
                    label: t('tags.delete'),
                    icon: Trash2,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => confirmDelete(tag),
                  },
                ]}
              />
            ),
            t('tags.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('tags.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('tags.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton resource="tags" disabled={(query.data ?? []).length === 0} />
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('tags.create')}
            </button>
          )}
        </div>
      </div>

      {deleteTag.isError && (
        <div
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {/* The API's own refusal, verbatim — it explains the escalation a
              cascade would have caused, which no generic message could. */}
          {apiErrorMessage(deleteTag.error, t('tags.deleteFailed'))}
        </div>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('tags.loading')}
        endpoints={['GET /admin/tags', 'POST /admin/tags', 'DELETE /admin/tags/:id']}
        onRetry={query.refetch}
        errorMessage={t('tags.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('tags.caption')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(tag) => tag.id}
          dimmed={query.isFetching}
          empty={<EmptyState icon={TagsIcon} message={t('tags.empty')} />}
        />
      </AsyncBoundary>

      <TagFormModal
        open={formOpen}
        tag={editing}
        saving={saveTag.isPending}
        error={saveTag.isError ? apiErrorMessage(saveTag.error, t('tags.saveFailed')) : undefined}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveTag.mutate(values)}
      />
    </div>
  );
}
