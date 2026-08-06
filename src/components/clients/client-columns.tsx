import Link from 'next/link';
import type { ClientRow, ClientSortKey } from '@/lib/api/admin';
import { CLIENT_SORT_KEYS } from '@/lib/api/admin';
import type { Column } from '@/components/data-table';
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
    columns.push({
      header: t('clients.colActions'),
      // Explicitly false. `DataTable` treats a column as sortable unless told
      // otherwise, so without this the Actions header is sortable by accident —
      // on a key the API has never heard of.
      sortable: false,
      cell: (c) => (
        <button
          type="button"
          onClick={() => onToggleStatus(c)}
          disabled={actingId === c.id}
          aria-busy={actingId === c.id}
          className={`h-8 px-3 rounded-md border text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-outline ${
            c.status === 'suspended'
              ? 'border-success/30 bg-success/10 text-success hover:bg-success/20'
              : 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
          }`}
        >
          {actingId === c.id
            ? t('clients.saving')
            : c.status === 'suspended'
              ? t('clients.reactivate')
              : t('clients.suspend')}
        </button>
      ),
    });
  }

  return columns;
}

/** Every sortable key this file declares is one the API accepts. */
export const DECLARED_SORT_KEYS: readonly ClientSortKey[] = CLIENT_SORT_KEYS;
