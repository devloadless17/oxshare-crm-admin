import { Ban, CheckCircle2, Eye, HandCoins, Network, Percent, Users } from 'lucide-react';
import type { Column } from '@/components/data-table';
import { RowActions, actionsColumn, type RowAction } from '@/components/row-actions';
import { Badge } from '@/components/ui/badge';
import { CopyableId } from '@/components/copyable-id';
import { PermittedLink } from '@/components/permitted-link';
import {
  ClientIdentity,
  PortalIdTag,
  clientLabel,
  clientName,
} from '@/components/clients/client-identity';
import type { IbPartnerRow, IbPartnerSortKey } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { isMasked } from '@/lib/masking';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/** A column may only claim to be sortable if the API will actually sort by it. */
const sortableBy = (key: IbPartnerSortKey) => ({ sortable: true as const, sortKey: key });

/**
 * The partner directory's columns.
 *
 * Extracted from the page for the reason the client list's are: permissions,
 * the viewer's field mask and the sortable allowlist all decide what appears,
 * and inline that is three conditionals wrapped around the table's JSX.
 *
 * ## What each column refuses to do
 *
 * - **Name a person by uuid.** A partner is named by Portal ID wherever a name
 *   or email is masked (`ClientIdentity`), and so is their parent — or the cell
 *   says the parent is outside this reader's territory. The uuid is never on
 *   the page (0133), and the API no longer sends the parent's at all.
 * - **Add currencies together.** Earnings arrive one line per currency and are
 *   drawn one line per currency, each formatted in its own. A partner with none
 *   says so in words, never as `$0.00` in a currency nobody chose.
 * - **Render "no agency" as nothing.** A partner on no agency has clients who
 *   are offered the WHOLE catalogue, so the cell says "All products".
 * - **Offer a sort the reader cannot see.** Sorting by first name orders the
 *   rows by a value a masked reader is refused — an ordering oracle — so the
 *   header only sorts while the name is visible, as on the client list.
 */
export function partnerColumns({
  maskedFields,
  canViewClients,
  canViewCommissions,
  canEditPartners,
  canSuspendPartners,
  actingId,
  onChangeLevel,
  onReassignParent,
  onToggleActive,
}: {
  maskedFields: readonly string[];
  /** `clients.view` — the profile and the introduced-clients list need it. */
  canViewClients: boolean;
  /** `ib.view` or `ib.commissions.view` — the ledger's own route requirement. */
  canViewCommissions: boolean;
  /** `ib.partners.edit` — the key the level and parent PATCHes enforce. */
  canEditPartners: boolean;
  /** `ib.partners.suspend` — the key the active PATCH enforces. */
  canSuspendPartners: boolean;
  /** The partner whose state is being changed, so their menu shows it working. */
  actingId: ClientRef | null | undefined;
  onChangeLevel: (row: IbPartnerRow) => void;
  onReassignParent: (row: IbPartnerRow) => void;
  onToggleActive: (row: IbPartnerRow) => void;
}): Column<IbPartnerRow>[] {
  const nameHidden = isMasked('client.firstName', maskedFields);

  const columns: Column<IbPartnerRow>[] = [
    {
      header: t('partners.colName'),
      ...(nameHidden ? { sortable: false as const } : sortableBy('userFirstName')),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <PermittedLink
            href={`/clients/${row.user.portalId}`}
            className="min-w-0 rounded-sm hover:underline focus-outline"
          >
            <ClientIdentity
              name={clientName(row.user.firstName, row.user.lastName)}
              email={row.user.email}
              portalId={row.user.portalId}
            />
          </PermittedLink>
          {!row.account.active && <Badge variant="warning">{t('partners.suspended')}</Badge>}
        </div>
      ),
    },
    {
      header: t('partners.colLevel'),
      ...sortableBy('level'),
      cell: (row) => t('partners.levelLine', { level: String(row.account.level) }),
      cellClassName: 'whitespace-nowrap font-medium',
    },
    {
      header: t('partners.colAgency'),
      cell: (row) =>
        row.agencyName ?? <span className="text-muted-foreground">{t('partners.noAgency')}</span>,
    },
    {
      header: t('partners.colReferralCode'),
      ...sortableBy('referralCode'),
      cell: (row) => (
        <CopyableId value={row.account.referralCode} full copyLabel={t('partners.copyCode')} />
      ),
    },
    {
      header: t('partners.colEarnings'),
      align: 'right',
      cell: (row) =>
        row.earnings.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t('partners.nothingEarned')}</span>
        ) : (
          <div className="space-y-0.5 tabular" title={t('partners.pendingHint')}>
            {row.earnings.map((line) => (
              <div key={line.currency} className="whitespace-nowrap">
                <span className="font-semibold">{formatMoney(line.confirmed, line.currency)}</span>
                {!isZeroMoney(line.pending) && (
                  <span className="ms-1.5 text-xs text-muted-foreground">
                    {t('partners.pendingAmount', {
                      amount: formatMoney(line.pending, line.currency),
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ),
    },
    {
      header: t('partners.colParent'),
      cell: (row) => {
        if (row.parentPortalId !== null) {
          return (
            <PermittedLink
              href={`/clients/${row.parentPortalId}`}
              className="rounded-sm hover:underline focus-outline"
            >
              <PortalIdTag id={row.parentPortalId} />
            </PermittedLink>
          );
        }
        // "Direct" and "hidden" decide different terms; one blank would say both.
        return row.parentOutsideTerritory ? (
          <span className="text-xs italic text-muted-foreground">{t('partners.parentHidden')}</span>
        ) : (
          <span className="text-xs text-muted-foreground" title={t('partners.directHint')}>
            {t('partners.direct')}
          </span>
        );
      },
    },
    {
      header: t('partners.colApproved'),
      ...sortableBy('approvedAt'),
      cell: (row) => new Date(row.account.approvedAt).toLocaleDateString(),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
    },
  ];

  const actionsFor = (row: IbPartnerRow): RowAction[] => [
    ...(canViewClients
      ? [
          { label: t('clients.viewProfile'), icon: Eye, href: `/clients/${row.user.portalId}` },
          {
            label: t('clientProfile.actionViewReferred'),
            icon: Users,
            href: `/clients?referredBy=${row.user.portalId}`,
          },
        ]
      : []),
    ...(canViewCommissions
      ? [
          {
            label: t('clientProfile.actionViewCommissions'),
            icon: HandCoins,
            href: `/commissions?ibUserId=${row.user.portalId}`,
          },
        ]
      : []),
    ...(canEditPartners
      ? [
          {
            label: t('clientProfile.actionChangeLevel'),
            icon: Percent,
            separatorBefore: true,
            onSelect: () => onChangeLevel(row),
          },
          {
            label: t('clientProfile.actionReassignParent'),
            icon: Network,
            onSelect: () => onReassignParent(row),
          },
        ]
      : []),
    ...(canSuspendPartners
      ? [
          {
            label: row.account.active
              ? t('clientProfile.actionSuspendPartner')
              : t('clientProfile.actionReactivatePartner'),
            icon: row.account.active ? Ban : CheckCircle2,
            destructive: row.account.active,
            separatorBefore: !canEditPartners,
            onSelect: () => onToggleActive(row),
          },
        ]
      : []),
  ];

  columns.push(
    actionsColumn((row) => (
      <RowActions
        label={t('partners.rowActions', { name: clientLabel(row.user) })}
        busy={actingId === row.account.userId}
        menuClassName="w-56"
        items={actionsFor(row)}
      />
    )),
  );

  return columns;
}
