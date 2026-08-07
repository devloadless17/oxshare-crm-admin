import Link from 'next/link';
import { Eye, PauseCircle, PlayCircle } from 'lucide-react';
import type { ClientRow, ClientSortKey } from '@/lib/api/admin';
import { CLIENT_SORT_KEYS } from '@/lib/api/admin';
import type { Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import { MaskedValue } from '@/components/masked-value';
import { isMasked } from '@/lib/masking';
import { ClientTagChips } from './client-tag-chips';
import { t } from '@/lib/i18n';

const TYPE_LABELS: Record<string, string> = {
  individual: t('clients.typeIndividual'),
  referral: t('clients.typeReferral'),
  partner: t('clients.typePartner'),
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'destructive',
};

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: ClientSortKey) => ({
  sortable: true as const,
  sortKey: key,
});

/**
 * The client table's columns.
 *
 * Extracted from the page because three things now decide what appears: the
 * viewer's permissions, the viewer's field mask, and the sortable allowlist.
 * Inline, that is three conditionals wrapped around eighty lines of JSX in a
 * file with a 400-line cap.
 *
 * ── A MASKED FIELD LOSES ITS WHOLE COLUMN ───────────────────────────────────
 *
 * Not a column of `••••`. The mask is a property of the VIEWER, so every row
 * carries the same set — twenty-five identical redaction chips would spend
 * horizontal space communicating one fact. The column goes, its filter goes
 * with it, and `MaskedFieldsNotice` says so once above the table.
 *
 * The per-cell `MaskedValue` still exists and is used on the PROFILE, where
 * fields sit in a fixed labelled grid and dropping one leaves a hole.
 */
export function clientColumns({
  canSuspend,
  canViewTags,
  maskedFields,
  actingId,
  onToggleStatus,
}: {
  canSuspend: boolean;
  canViewTags: boolean;
  maskedFields: readonly string[];
  actingId: string | null | undefined;
  onToggleStatus: (client: ClientRow) => void;
}): Column<ClientRow>[] {
  const hidden = (field: string) => isMasked(field, maskedFields);

  const columns: Column<ClientRow>[] = [];

  if (!hidden('client.firstName') && !hidden('client.lastName')) {
    columns.push({
      header: t('clients.colName'),
      ...sortableBy('firstName'),
      cell: (c) => (
        // The entry point to the profile (FR-ADM-01). A row that opens
        // something is the one affordance a directory needs, and putting it on
        // the name means no extra column.
        <Link href={`/clients/${c.id}`} className="text-link hover:underline focus-outline">
          {[c.firstName, c.lastName].filter(Boolean).join(' ') || t('clients.unnamed')}
        </Link>
      ),
      cellClassName: 'font-medium',
    });
  }

  if (!hidden('client.email')) {
    columns.push({
      header: t('clients.colEmail'),
      ...sortableBy('email'),
      cell: (c) => c.email ?? '—',
      cellClassName: 'text-muted-foreground',
    });
  }

  columns.push(
    {
      header: t('clients.colType'),
      ...sortableBy('type'),
      cell: (c) => TYPE_LABELS[c.type] ?? c.type,
    },
    {
      header: t('clients.colStatus'),
      ...sortableBy('status'),
      cell: (c) => (
        <Badge variant={STATUS_VARIANT[c.status] ?? 'default'} className="capitalize">
          {c.status}
        </Badge>
      ),
    },
    {
      header: t('clients.colKycLevel'),
      ...sortableBy('verificationLevel'),
      cell: (c) => (
        <span
          className={`text-xs font-semibold ${
            c.verificationLevel >= 1 ? 'text-success' : 'text-muted-foreground'
          }`}
        >
          {c.verificationLevel >= 1 ? t('clients.levelVerified') : t('clients.levelUnverified')}
        </span>
      ),
    },
  );

  if (!hidden('client.country')) {
    columns.push({
      header: t('clients.colCountry'),
      ...sortableBy('country'),
      cell: (c) => <MaskedValue field="client.country" row={c} />,
      cellClassName: 'text-muted-foreground',
    });
  }

  if (canViewTags && !hidden('client.tags')) {
    columns.push({
      header: t('clients.colTags'),
      // Not sortable: `tags` is a collection, and there is no ordering of
      // "these three labels" the API could honour. Declaring it would promise
      // an order that produces a 400 (R-2.5).
      sortable: false,
      cell: (c) => <ClientTagChips tags={c.tags ?? []} />,
    });
  }

  columns.push({
    header: t('clients.colCreated'),
    ...sortableBy('createdAt'),
    cell: (c) => (
      <MaskedValue field="client.createdAt" row={c}>
        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
      </MaskedValue>
    ),
    cellClassName: 'text-muted-foreground',
  });

  if (canSuspend) {
    /*
     * `actionsColumn` rather than a hand-written column, so this table gets the
     * same pinned, unsortable, right-aligned Actions affordance as every other
     * one. It also carries the `sortable: false` that used to be spelled out
     * here — DataTable treats a column as sortable unless told otherwise, so
     * without it the Actions header becomes a sort button on a key the API has
     * never heard of.
     */
    columns.push(
      actionsColumn<ClientRow>(
        (c) => (
          <RowActions
            /* Falls through to the id: name AND email are both maskable
               (RBAC-03), so on a masked row neither is available to name the
               trigger — and an unnamed one announces as a bare "button". */
            label={t('table.rowActions', {
              name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.id,
            })}
            busy={actingId === c.id}
            items={[
              {
                label: t('clients.viewProfile'),
                icon: Eye,
                href: `/clients/${c.id}`,
              },
              {
                label: c.status === 'suspended' ? t('clients.reactivate') : t('clients.suspend'),
                icon: c.status === 'suspended' ? PlayCircle : PauseCircle,
                // Only suspending is destructive. They are the same control,
                // but only one of them locks somebody out of their account.
                destructive: c.status !== 'suspended',
                separatorBefore: true,
                onSelect: () => onToggleStatus(c),
              },
            ]}
          />
        ),
        t('clients.colActions'),
      ),
    );
  }

  return columns;
}

/** Every sortable key this file declares is one the API accepts. */
export const DECLARED_SORT_KEYS: readonly ClientSortKey[] = CLIENT_SORT_KEYS;
