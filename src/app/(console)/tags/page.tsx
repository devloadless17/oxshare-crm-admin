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
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { TagFormModal, type TagFormValues } from '@/components/tags/tag-form-modal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { OutsideTerritoryCount } from '@/components/clients/outside-territory-count';

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
/*
 * `GET /admin/tags` returns every tag in one response, so the rows this table
 * holds ARE the dataset and paging them is a view concern rather than a lie
 * about scope. It is what gives this screen the same footer — numbered pages,
 * First/Last, rows-per-page — as the server-paginated tables next to it, in
 * place of the inert "Showing all N" bar it drew before.
 *
 * A module constant, not an inline object: a fresh `{}` every render would be a
 * new prop identity on every keystroke elsewhere in the page.
 */
const TAG_PAGING = { noun: ['tag', 'tags'] as [string, string] };

export default function TagsPage() {
  const { admin } = useAdmin();
  /*
   * Split from `tags.manage`, which bundled all three verbs — so "may rename a
   * tag" also meant "may delete the tag an administrator is scoped to", and an
   * empty scope means UNRESTRICTED. That is a privilege change hiding inside an
   * edit permission.
   */
  const canCreate = hasPermission(admin, 'tags.create');
  const canEdit = hasPermission(admin, 'tags.edit');
  const canDelete = hasPermission(admin, 'tags.delete');
  const canManage = canEdit || canDelete;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<ClientTag | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);
  /*
   * Two vocabularies on one screen (0193): the business's own tags, and one
   * tag per country — derived from each client's country, never assigned. The
   * countries tab lists only countries somebody lives in unless asked.
   */
  const [tab, setTab] = React.useState<'tags' | 'countries'>('tags');
  const [allCountries, setAllCountries] = React.useState(false);

  const query = useResource<ClientTagWithCount[]>(keys.tags.all(), (signal) =>
    api.admin.getTags(signal),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.tags.all() });

  const saveTag = useMutation({
    mutationFn: (values: TagFormValues) =>
      editing ? api.admin.updateTag(editing.id, values) : api.admin.createTag(values),
    onSuccess: async (_data, values) => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('tags.saveSucceeded', { label: values.label }));
    },
    /*
     * No error TOAST: the form modal stays open on failure and renders
     * `saveTag.error` beside the fields, which is where a validation refusal
     * ("slug already taken") has to be read. Reporting it twice at once reads
     * as two failures.
     */
  });

  const deleteTag = useMutation({
    mutationFn: (tag: ClientTagWithCount) => api.admin.deleteTag(tag.id),
    onSuccess: async (_data, tag) => {
      await invalidate();
      toastSuccess(t('tags.deleteSucceeded', { label: tag.label }));
    },
    /*
     * The API's own message first. A delete is refused while any administrator
     * is scoped to the tag, and that refusal names them — replacing it with
     * "failed to delete" leaves the operator with no idea what to unpick.
     */
    onError: (error) => toastError(error, t('tags.deleteFailed')),
  });

  /*
   * WHICH row is deleting, not merely THAT one is.
   *
   * `deleteTag.variables` is the id passed to the in-flight `mutate`, so the
   * spinner lands on the row being acted on. The buttons this replaced disabled
   * every row's delete during any delete, which read as the whole table
   * freezing over one action.
   */
  const rows = (query.data ?? []).filter((tag) =>
    tab === 'tags'
      ? !tag.countryCode
      : Boolean(tag.countryCode) && (allCountries || tag.clientCount + tag.clientsOutsideScope > 0),
  );

  const deletingId = deleteTag.isPending ? deleteTag.variables?.id : undefined;

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

  const confirmDelete = async (tag: ClientTagWithCount) => {
    /*
     * The confirmation names the CONSEQUENCE, not "are you sure".
     *
     * Two of them, and the second is the one nobody expects: deleting a tag
     * removes it from every client that carries it, AND any administrator
     * scoped to it loses that scope. The API refuses the second case outright
     * (an empty scope means UNRESTRICTED, so cascading would promote them to
     * seeing every client) — but saying so here means the operator learns it
     * before the refusal rather than from it.
     *
     * That consequence is the DESCRIPTION now rather than a second clause of
     * one long `window.confirm` sentence, which is the whole argument for the
     * dialog: the question is readable at a glance and the reasoning is still
     * there under it.
     */
    const ok = await confirm({
      title: t('tags.confirmDeleteTitle', { label: tag.label }),
      description: t('tags.confirmDelete', { label: tag.label, count: tag.clientCount }),
      confirmLabel: t('tags.delete'),
      destructive: true,
    });
    if (ok) deleteTag.mutate(tag);
  };

  const columns: Column<ClientTagWithCount>[] = [
    {
      header: t('tags.colTag'),
      cell: (tag) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge
            variant="tag"
            style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined}
          >
            {tag.label}
          </Badge>
        </span>
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
      cell: (tag) => (
        <>
          {tag.clientCount === 0 ? (
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
          )}
          <OutsideTerritoryCount count={tag.clientsOutsideScope} />
        </>
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
                  // A country tag is never deleted — it follows its clients.
                  ...(tag.countryCode
                    ? []
                    : [
                        {
                          label: t('tags.delete'),
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => void confirmDelete(tag),
                        },
                      ]),
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('tags.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('tags.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton resource="tags" disabled={(query.data ?? []).length === 0} />
          {/* The CREATE key — see `canManage` above, which is the union the row
              menu is drawn from. */}
          {canCreate && (
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

      <div className="flex shrink-0 flex-col gap-2">
        <Tabs
          idPrefix="tags"
          tabs={[
            { value: 'tags', label: t('tags.tabTags') },
            { value: 'countries', label: t('tags.tabCountries') },
          ]}
          value={tab}
          onValueChange={(next) => setTab(next === 'countries' ? 'countries' : 'tags')}
        />
        {tab === 'countries' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{t('tags.countriesHint')}</p>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allCountries}
                onChange={(e) => setAllCountries(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t('tags.countriesShowAll')}
            </label>
          </div>
        )}
      </div>

      <TabPanel
        idPrefix="tags"
        value={tab}
        activeValue={tab}
        className="flex min-h-0 flex-1 flex-col"
      >
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
            rows={rows}
            rowKey={(tag) => tag.id}
            dimmed={query.isFetching}
            empty={
              <EmptyState
                icon={TagsIcon}
                message={tab === 'tags' ? t('tags.empty') : t('tags.countriesEmpty')}
              />
            }
            clientPagination={TAG_PAGING}
          />
        </AsyncBoundary>
      </TabPanel>

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
