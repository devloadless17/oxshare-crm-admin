'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, Trash2, TriangleAlert } from 'lucide-react';
import api from '@/lib/api';
import type { ApiKey } from '@/lib/api/admin';

import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';

/** A row plus the expiry verdict stamped when it was fetched. */
type ApiKeyRow = ApiKey & { isExpired: boolean };

/**
 * Machine credentials for the admin API — the list, and the one-time reveal.
 *
 * ## Creating is its own PAGE, not a modal
 *
 * `/api-keys/new`. The form carries the whole permission catalog plus an expiry
 * picker, which is more than a dialog should hold — and it is a decision worth
 * being able to link to, leave, and come back to. A modal also makes the
 * catalog scroll inside a scroll, which is where a reviewer stops reading the
 * permissions they are about to grant.
 *
 * ## The one-time reveal stays a modal, deliberately
 *
 * It is the opposite kind of moment: a single fact, shown once, that must not
 * be navigated away from by accident. It arrives here as `?issued=` — the
 * create page redirects with the secret in the URL, this page shows it and
 * strips the parameter immediately, so it never survives into history.
 *
 * ## What is deliberately absent
 *
 * There is no edit. Changing a key's permissions in place would mean a
 * credential quietly gaining power that whoever installed it never agreed to;
 * revoke and issue instead, which leaves both facts in the audit trail.
 */
export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  /*
   * Shadows the GLOBAL `window.confirm`, which is the point — and is why
   * forgetting this line is not a silent bug. Without it `confirm({ title })`
   * resolves to the browser's own function, which takes a string and returns a
   * boolean, so it compiles as a call and fails on `.then`. TypeScript caught it
   * here; on a plain-JS codebase it would have shipped as a dialog printing
   * "[object Object]".
   */
  const confirm = useConfirm();
  /*
   * The writes behind their own keys. `apikeys.view` lists; `apikeys.create`
   * mints a standing credential carrying the creator's permission set, and
   * `apikeys.revoke` kills one. The API enforces both independently — this is
   * what keeps a holder of the read key from being offered two dead buttons
   * (or, worse, believing the screen when it offers them).
   */
  const { admin } = useAdmin();
  const canCreate = hasPermission(admin, 'apikeys.create');
  const canRevoke = hasPermission(admin, 'apikeys.revoke');
  /*
   * Expiry is resolved WHERE THE DATA ARRIVES, not during render.
   *
   * `Date.now()` in a component (or in a `useMemo`) makes it impure — the same
   * render can produce two answers — and React's lint rule refuses it. Stamping
   * each row as it is fetched is both rule-clean and more correct: every row in
   * one table is judged against one instant, so two rows can never disagree
   * about "now".
   *
   * It is only a DISPLAY hint. The backend makes the same comparison and
   * refuses the key regardless of what this screen shows.
   */
  const keys = useResource(['api-keys'], async (signal) => {
    const rows = await api.admin.listApiKeys(signal);
    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      isExpired: row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now,
    }));
  });

  /*
   * Take the secret out of the URL on arrival.
   *
   * Read in a LAZY INITIALISER rather than an effect: an effect that calls
   * setState on mount is a cascading render, and this value is known before the
   * first paint — it is initial state, not a correction applied after one.
   *
   * `history.replaceState` (below, in an effect, because it is a side effect
   * rather than state) and not a router push: this must not add a history
   * entry, or "back" would put the plaintext key back in the address bar.
   */
  const [issued, setIssued] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('issued');
  });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('issued')) return;
    params.delete('issued');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }, []);

  const revoke = useMutation({
    mutationFn: (key: ApiKeyRow) => api.admin.revokeApiKey(key.id),
    onSuccess: async (_data, key) => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toastSuccess(t('apiKeys.revokeSucceeded', { name: key.name }));
    },
    onError: (err) => toastError(err, t('apiKeys.revokeFailed')),
  });

  const columns: Array<Column<ApiKeyRow>> = React.useMemo(
    () => [
      { key: 'name', header: t('apiKeys.column.name'), cell: (row) => row.name },
      {
        key: 'prefix',
        header: t('apiKeys.column.key'),
        // The prefix, never the secret — no field in the response could
        // authenticate, so there is nothing here to leak over a shoulder.
        cell: (row) => (
          <span className="font-mono text-xs">
            {t('apiKeys.prefixTruncated', { prefix: row.prefix })}
          </span>
        ),
      },
      {
        key: 'permissions',
        header: t('apiKeys.column.permissions'),
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.permissions.join(', ')}</span>
        ),
      },
      {
        key: 'createdByName',
        header: t('apiKeys.column.createdBy'),
        cell: (row) => row.createdByName ?? '—',
      },
      {
        key: 'lastUsedAt',
        header: t('apiKeys.column.lastUsed'),
        cell: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—'),
      },
      {
        key: 'expiresAt',
        header: t('apiKeys.column.expires'),
        cell: (row) =>
          row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : t('apiKeys.never'),
      },
      {
        key: 'status',
        header: t('apiKeys.column.status'),
        // The clock is read ONCE per data change, not per rendered cell: the
        // lint rule is right that reading it during render makes a component
        // impure, and a table where two rows disagree about "now" would be a
        // real (if rare) inconsistency rather than only a rule violation.
        cell: (row) => <StatusBadge row={row} />,
      },
      actionsColumn<ApiKeyRow>((row) =>
        row.revokedAt || !canRevoke ? null : (
          <RowActions
            // The accessible name for the trigger — it is an icon button, so a
            // screen reader has nothing else to announce.
            label={row.name}
            items={[
              {
                label: t('apiKeys.revoke'),
                icon: Trash2,
                destructive: true,
                onSelect: () => {
                  void confirm({
                    title: t('apiKeys.revokeConfirmTitle', { name: row.name }),
                    description: t('apiKeys.revokeConfirm', { name: row.name }),
                    confirmLabel: t('apiKeys.revoke'),
                    destructive: true,
                  }).then((ok) => {
                    if (ok) revoke.mutate(row);
                  });
                },
              },
            ]}
          />
        ),
      ),
    ],
    // `confirm` is a `useCallback([])` from the provider and never changes
    // identity, so listing it satisfies the rule without costing a rebuild.
    [revoke, confirm, canRevoke],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('apiKeys.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('apiKeys.subtitle')}</p>
        </div>
        {canCreate && (
          <Link
            href="/api-keys/new"
            className="focus-outline inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('apiKeys.create')}
          </Link>
        )}
      </div>

      <AsyncBoundary
        status={keys.status}
        label={t('apiKeys.loading')}
        endpoints={['GET /admin/api-keys']}
        onRetry={keys.refetch}
        errorMessage={t('apiKeys.loadFailed')}
        error={keys.error}
        fill
      >
        <DataTable
          fill
          caption={t('apiKeys.caption')}
          columns={columns}
          rows={keys.data ?? []}
          rowKey={(row) => row.id}
          dimmed={keys.isFetching}
          empty={<EmptyState icon={KeyRound} message={t('apiKeys.empty')} />}
        />
      </AsyncBoundary>

      {/*
       * Keyed on the secret and mounted only when there is one, so a second key
       * issued in the same session cannot inherit the first one's copied state
       * — and there is no reset effect to cascade a render.
       */}
      {issued !== null && (
        <RevealModal key={issued} plaintext={issued} onClose={() => setIssued(null)} />
      )}
    </div>
  );
}

/**
 * Active / Expired / Revoked, derived rather than stored.
 *
 * The same comparison the backend makes when it refuses the key. A screen
 * reading "Active" for a key the API rejects would be the more confusing
 * failure.
 */
function StatusBadge({ row }: { row: ApiKeyRow }) {
  if (row.revokedAt) return <Badge variant="destructive">{t('apiKeys.status.revoked')}</Badge>;
  if (row.isExpired) {
    return <Badge variant="warning">{t('apiKeys.status.expired')}</Badge>;
  }
  return <Badge variant="success">{t('apiKeys.status.active')}</Badge>;
}

/**
 * The one-time reveal.
 *
 * Not dismissible by clicking the backdrop, deliberately: an accidental click
 * outside would destroy the only copy of a credential, and the recovery is to
 * revoke the key and issue another. The operator has to say they have it.
 */
function RevealModal({ plaintext, onClose }: { plaintext: string; onClose: () => void }) {
  // No reset effect: the call site keys this component on `plaintext`, so a new
  // secret mounts a new component and `copied` starts false by construction.
  const [copied, setCopied] = React.useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('apiKeys.reveal.title')}
      dismissOnBackdrop={false}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            {t('apiKeys.reveal.done')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('apiKeys.reveal.body')}</p>
        </div>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs">
            {plaintext}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(plaintext).then(() => setCopied(true));
            }}
            className="focus-outline inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? t('apiKeys.reveal.copied') : t('apiKeys.reveal.copy')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
