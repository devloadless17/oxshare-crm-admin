import { Eye, PauseCircle, PlayCircle, Wallet } from 'lucide-react';
import type { ClientRow, ClientSortKey } from '@/lib/api/admin';
import { kycStatusLabel, kycStatusVariant } from '@/lib/kyc-status';
import { CLIENT_SORT_KEYS } from '@/lib/api/admin';
import type { Column } from '@/components/data-table';
import { RowActions, actionsColumn } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import { MaskedValue } from '@/components/masked-value';
import { CopyableId } from '@/components/copyable-id';
import { isMasked } from '@/lib/masking';
import { ClientTagChips } from './client-tag-chips';
import { t } from '@/lib/i18n';
import { PermittedLink } from '@/components/permitted-link';

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

/*
 * The KYC decision, as a badge — LABEL AND COLOUR FROM `lib/kyc-status.ts`.
 *
 * This used to hold its own `clients.kyc*` map, one of three parallel families
 * describing the same six statuses. Renaming `submitted` for the review desk
 * changed the queue and left this list saying "Submitted", so one client read
 * two ways depending on the screen. The vocabulary has one owner now.
 *
 * The colour rule it used to state lives there too: `submitted` and
 * `under_review` are warm because they are the states that mean work is owed;
 * `not_started` and `in_progress` are muted because the client has not asked
 * for a decision yet.
 */

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
  canEditPartners,
  maskedFields,
  actingId,
  onToggleStatus,
  onChangeProgram,
}: {
  canSuspend: boolean;
  canViewTags: boolean;
  /** `ib.partners.edit` — the same permission the API enforces on the PATCH. */
  canEditPartners: boolean;
  maskedFields: readonly string[];
  actingId: string | null | undefined;
  onToggleStatus: (client: ClientRow) => void;
  onChangeProgram: (client: ClientRow) => void;
}): Column<ClientRow>[] {
  const hidden = (field: string) => isMasked(field, maskedFields);

  const columns: Column<ClientRow>[] = [];

  /*
   * ⚠️ EITHER half of the name is enough to keep this column.
   *
   * This read `!hidden(firstName) && !hidden(lastName)` — drop the column
   * unless BOTH are permitted — so a role that hid only the first name lost
   * the surname too. Reported: "when I choose to hide a first name only, both
   * first and last name are hidden."
   *
   * They are separate entries in the backend catalog with separate aliases,
   * so the server strips exactly the one that was masked and leaves the other
   * on the row. Nothing needed a partial renderer: the cell already joins the
   * parts it was given, so with `firstName` stripped it renders the surname
   * alone, which is the truthful answer to "what of this person's name may I
   * see". The column goes only when there is nothing left to put in it.
   *
   * `MaskedFieldsNotice` above the table is what says WHICH half is hidden,
   * so a half-name is never mistaken for a whole one.
   */
  if (!hidden('client.firstName') || !hidden('client.lastName')) {
    columns.push({
      header: t('clients.colName'),
      /*
       * Sortable only while the first name is actually visible. The API orders
       * by `users.first_name`, so offering the header to a viewer who cannot
       * see that column turns it into an ordering oracle: click, and the
       * alphabetical sequence of names you are not allowed to read is on
       * screen beside the ids.
       *
       * ⚠️ This is the UI half only. `GET /admin/clients?sort=firstName` still
       * accepts it for a masked viewer — `applyMaskAll` strips the field from
       * the response and nothing consults the mask when choosing the ORDER.
       * The same is true of `?q=`, which matches against names the caller
       * cannot see. Both are worth closing server-side; neither is closed by
       * this line.
       */
      ...(hidden('client.firstName') ? { sortable: false as const } : sortableBy('firstName')),
      cell: (c) => (
        // The entry point to the profile (FR-ADM-01). A row that opens
        // something is the one affordance a directory needs, and putting it on
        // the name means no extra column.
        <PermittedLink
          href={`/clients/${c.id}`}
          className="text-link hover:underline focus-outline"
        >
          {[c.firstName, c.lastName].filter(Boolean).join(' ') || t('clients.unnamed')}
        </PermittedLink>
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

  columns.push({
    /*
     * The client's uuid, truncated with copy-the-full-value — see CopyableId
     * for why it is not rendered whole. NO mask gate: `client.id` is declared
     * non-maskable in the backend catalog ("every row and every link is
     * addressed by it"), so on a fully masked row this is the one identifier
     * an operator can still quote to support.
     */
    header: t('clients.colId'),
    // NOT sortable: `id` is not in the backend's `CLIENT_SORT_COLUMNS`, and
    // R-2.5 makes an unrecognised sort a 400 rather than a silent fallback.
    sortable: false,
    cell: (c) => <CopyableId value={c.id} />,
  });

  columns.push(
    {
      header: t('clients.colType'),
      /*
       * NOT sortable, and this column is why the whole table used to vanish
       * behind an error card. `type` is DERIVED server-side — a CASE over
       * `ib_accounts` and `referred_by_ib_user_id`, because `users.type` is a
       * label nothing maintains — and an expression reading another table
       * cannot be indexed, so `CLIENT_SORT_COLUMNS` has never offered it as an
       * ordering. R-2.5 makes an unrecognised sort a 400 rather than a silent
       * fallback, which is the right call and is exactly what the operator saw.
       *
       * The FILTER above the table answers the same question ("show me the
       * partners") and is offered. `CLIENT_SORT_KEYS` is derived from the
       * generated contract now, so `sortableBy('type')` no longer compiles.
       */
      sortable: false,
      cell: (c) => TYPE_LABELS[c.type] ?? c.type,
    },
    {
      // The ACCOUNT state, and only that: whether this person may sign in.
      // Named "Account status" on the header because the row now carries a KYC
      // status beside it, and "Status" alone invited the two to be confused.
      header: t('clients.colStatus'),
      ...sortableBy('status'),
      cell: (c) => (
        <Badge variant={STATUS_VARIANT[c.status] ?? 'default'} className="capitalize">
          {c.status}
        </Badge>
      ),
    },
    {
      /*
       * THE KYC DECISION — this replaced the "KYC level" column.
       *
       * The level is a TIER (0 or 1) and it could not tell "never applied" from
       * "applied and was refused": a rejection leaves the level at 0, exactly
       * where a client who has done nothing sits. Those are opposite pieces of
       * work — one needs chasing, the other has already been decided — and the
       * column that was on screen showed both as "L0 · Unverified".
       */
      header: t('clients.colKycStatus'),
      // NOT sortable: `kycStatus` is not in the backend's
      // `CLIENT_SORT_COLUMNS`. It is joined from `kyc_submissions` rather than
      // being a column on `users`, and R-2.5 makes an unrecognised sort a 400
      // rather than a silent fallback — so declaring it would turn a header
      // click into an error page instead of rows.
      sortable: false,
      cell: (c) => (
        <Badge variant={kycStatusVariant(c.kycStatus)}>{kycStatusLabel(c.kycStatus)}</Badge>
      ),
    },
    {
      /*
       * Whether the client confirmed the address they registered with — and it
       * is a column of its own rather than a shade of the KYC one on purpose.
       *
       * An unconfirmed email is a SELF-SERVICE problem: the client clicks a
       * link and it is fixed, and nobody needs to look at a document. Folding
       * it into KYC would send an operator chasing paperwork for somebody who
       * only ever needed to open their inbox.
       */
      header: t('clients.colEmailVerified'),
      // NOT sortable — `emailVerified` is absent from `CLIENT_SORT_COLUMNS`
      // for the same reason as `kycStatus` above.
      sortable: false,
      cell: (c) => (
        <Badge variant={c.emailVerified ? 'success' : 'default'}>
          {c.emailVerified ? t('clients.emailVerifiedYes') : t('clients.emailVerifiedNo')}
        </Badge>
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

  /*
   * The Actions column appears if EITHER action is permitted, not only
   * suspension. Gating the whole column on `canSuspend` would hide the
   * level control from somebody who holds `ib.partners.edit` and not
   * `clients.suspend` — a commission operator, which is exactly the role that
   * needs it most.
   */
  if (canSuspend || canEditPartners) {
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
              /*
               * PARTNERS ONLY, and `type` is what says so — an individual or a
               * referral client has no `ib_accounts` row, so the PATCH behind
               * this would 404. An action whose only outcome is a "not found"
               * is worse than an absent one: it reads as a broken screen.
               */
              ...(canEditPartners && c.type === 'partner'
                ? [
                    {
                      label: t('clientProfile.actionChangeLevel'),
                      icon: Wallet,
                      separatorBefore: true,
                      onSelect: () => onChangeProgram(c),
                    },
                  ]
                : []),
              ...(canSuspend
                ? [
                    {
                      label:
                        c.status === 'suspended' ? t('clients.reactivate') : t('clients.suspend'),
                      icon: c.status === 'suspended' ? PlayCircle : PauseCircle,
                      // Only suspending is destructive. They are the same
                      // control, but only one locks somebody out of their
                      // account.
                      destructive: c.status !== 'suspended',
                      separatorBefore: true,
                      onSelect: () => onToggleStatus(c),
                    },
                  ]
                : []),
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
