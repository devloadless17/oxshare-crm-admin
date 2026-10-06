'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, Pencil, Plus, Power } from 'lucide-react';
import api from '@/lib/api';
import type { AcquisitionLink, AdminUser, ClientTagWithCount } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/payment-providers/copy-controls';
import { LinkFormModal, type LinkFormValues } from '@/components/acquisition-links/link-form-modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Sign-up links (backend 0195) — the buyer's old CRM: every administrator hands
 * out a link, and a client who signs up through it arrives carrying its tags,
 * i.e. in its owner's book (a tag is a territory). Counts per link are
 * aggregates — sign-ups, verified, funded — never who.
 *
 * `links.create` manages your own links, tagged from your own territory;
 * `links.manage` manages anyone's and can hand a link to someone else.
 */
export default function AcquisitionLinksPage() {
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'links.create');
  const canManage = hasPermission(admin, 'links.manage');
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<AcquisitionLink | undefined>(undefined);
  const [formOpen, setFormOpen] = React.useState(false);

  const links = useResource<AcquisitionLink[]>(keys.acquisitionLinks.all(), (signal) =>
    api.admin.getAcquisitionLinks(signal),
  );
  const tags = useResource<ClientTagWithCount[]>(keys.tags.all(), (signal) =>
    api.admin.getTags(signal),
  );
  // The owner picker (links.manage only) — never fetched without it.
  const admins = useResource<AdminUser[]>(keys.adminUsers.all(), () => api.admin.getAdminUsers(), {
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.acquisitionLinks.all() });

  const mayEdit = (link: AcquisitionLink) =>
    canManage || (canCreate && link.ownerAdminId === admin?.id);

  // Without links.manage, only tags from your own territory (the API's rule).
  const allowedTagIds =
    canManage || admin?.seesAllClients
      ? undefined
      : (admin?.scopedTags ?? []).map((tag) => tag.tagId);

  const save = useMutation({
    mutationFn: (values: LinkFormValues) =>
      editing
        ? api.admin.updateAcquisitionLink(editing.id, values)
        : api.admin.createAcquisitionLink(values),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await invalidate();
      toastSuccess(t('links.saved'));
    },
  });

  const toggle = useMutation({
    mutationFn: (link: AcquisitionLink) =>
      api.admin.updateAcquisitionLink(link.id, { disabled: link.disabledAt === null }),
    onSuccess: async (updated) => {
      await invalidate();
      toastSuccess(updated.disabledAt ? t('links.disabled') : t('links.enabled'));
    },
    onError: (error) => toastError(error, t('links.saveFailed')),
  });

  /** "Copy my link": your first live link, or a new one tagged with your own book. */
  const myLink = useMutation({
    mutationFn: async () => {
      const own = (links.data ?? []).find(
        (link) => link.ownerAdminId === admin?.id && link.disabledAt === null,
      );
      const link =
        own ?? (await api.admin.createAcquisitionLink({ name: admin?.name ?? 'My link' }));
      await navigator.clipboard.writeText(link.url);
      return { created: !own };
    },
    onSuccess: async ({ created }) => {
      if (created) await invalidate();
      toastSuccess(created ? t('links.myLinkCreated') : t('links.copied'));
    },
    onError: (error) => toastError(error, t('links.saveFailed')),
  });

  const openForm = (link?: AcquisitionLink) => {
    setEditing(link);
    save.reset();
    setFormOpen(true);
  };

  const columns: Column<AcquisitionLink>[] = [
    {
      header: t('links.colName'),
      cell: (link) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">{link.name}</span>
          <span className="flex items-center gap-1.5">
            <code className="truncate text-[11px] text-muted-foreground">{link.url}</code>
            <CopyButton value={link.url} />
          </span>
        </div>
      ),
    },
    {
      header: t('links.colOwner'),
      cell: (link) => (
        <div className="flex flex-col gap-0.5">
          <span>{link.ownerName}</span>
          {!link.ownerActive && (
            <span className="text-[11px] text-warning">{t('links.ownerSuspended')}</span>
          )}
        </div>
      ),
    },
    {
      header: t('links.colTags'),
      cell: (link) =>
        link.tags.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">{t('links.noTags')}</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap gap-1">
              {link.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="tag"
                  style={
                    tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined
                  }
                >
                  {tag.label}
                </Badge>
              ))}
            </span>
            {!link.ownerSeesSignups && (
              <span className="flex items-center gap-1 text-[11px] text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t('links.ownerBlind')}
              </span>
            )}
          </div>
        ),
    },
    { header: t('links.colSignups'), cell: (link) => link.signups, align: 'right' },
    { header: t('links.colVerified'), cell: (link) => link.verified, align: 'right' },
    { header: t('links.colFunded'), cell: (link) => link.funded, align: 'right' },
    {
      header: t('links.colStatus'),
      cell: (link) =>
        link.disabledAt ? (
          <span className="text-muted-foreground">{t('links.off')}</span>
        ) : (
          <span className="text-success">{t('links.active')}</span>
        ),
    },
    ...(canCreate || canManage
      ? [
          actionsColumn<AcquisitionLink>(
            (link) =>
              mayEdit(link) ? (
                <RowActions
                  label={t('table.rowActions', { name: link.name })}
                  busy={toggle.isPending && toggle.variables?.id === link.id}
                  items={[
                    { label: t('links.edit'), icon: Pencil, onSelect: () => openForm(link) },
                    {
                      label: link.disabledAt ? t('links.enable') : t('links.disable'),
                      icon: Power,
                      separatorBefore: true,
                      onSelect: () => toggle.mutate(link),
                    },
                  ]}
                />
              ) : null,
            t('links.colActions'),
          ),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('links.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('links.subtitle')}</p>
        </div>
        {(canCreate || canManage) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => myLink.mutate()}
              disabled={myLink.isPending || links.status !== 'ready'}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {t('links.myLink')}
            </button>
            <button
              type="button"
              onClick={() => openForm()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('links.create')}
            </button>
          </div>
        )}
      </div>

      <AsyncBoundary
        status={links.status}
        label={t('links.loading')}
        endpoints={['GET /admin/acquisition-links']}
        onRetry={links.refetch}
        errorMessage={t('links.loadFailed')}
        error={links.error}
        fill
      >
        <DataTable
          fill
          caption={t('links.caption')}
          columns={columns}
          rows={links.data ?? []}
          rowKey={(link) => link.id}
          dimmed={links.isFetching}
          empty={<EmptyState icon={Link2} message={t('links.empty')} />}
        />
      </AsyncBoundary>

      <LinkFormModal
        open={formOpen}
        link={editing}
        tags={tags.data ?? []}
        admins={admins.data ?? []}
        allowedTagIds={allowedTagIds}
        canManage={canManage}
        selfId={admin?.id ?? ''}
        saving={save.isPending}
        error={save.isError ? apiErrorMessage(save.error, t('links.saveFailed')) : undefined}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
