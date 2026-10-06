'use client';

import * as React from 'react';
import { Coins, Network, Users } from 'lucide-react';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { SubPartnerTermsDialog } from '@/components/clients/profile/client-partner-dialogs';
import { ClientIdentity, clientName } from '@/components/clients/client-identity';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import type { IbPartnerDetail, IbPartnerEarnings, IbSubPartnerRow } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { PermittedLink } from '@/components/permitted-link';
import { ProfileCard } from '@/components/clients/profile/profile-cards';
import { formatDecimal, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { PortalIdTag } from '@/components/clients/client-identity';

/**
 * Everything about a client's standing AS A PARTNER.
 *
 * ## Why this is a tab and not another card
 *
 * A partner's profile answers a different set of questions from a client's, and
 * there are enough of them that interleaving the two makes both harder to read:
 * which rung they stand on and what it pays, what they may sell, who placed
 * them, who they placed, how many clients they introduced, and what all of it
 * has earned. On an individual client every one of those is blank, which is why
 * the tab is rendered only for a partner rather than shown empty.
 *
 * ## Money is a STRING, all the way through
 *
 * Each earnings line's `confirmed` and `pending` are decimal strings at
 * NUMERIC(28,8) scale and are handed to `formatMoney` untouched. `Number()` on this path is a
 * lint error in this repo, and the reason is §6.1: the value can exceed what a
 * double represents exactly, so the conversion is wrong before formatting
 * starts.
 *
 * `rateValue` is a percentage rather than money, and is trimmed for display —
 * the stored scale is for arithmetic, not for reading.
 */
export function ClientPartnerPanel({ detail }: { detail: IbPartnerDetail }) {
  const { admin } = useAdmin();
  const [editingTerms, setEditingTerms] = React.useState(false);
  // 0197 — only a sub-partner has terms of their own.
  const isSub = detail.level >= 2 && (detail.parent !== null || detail.parentOutsideTerritory);
  const commissionShare = detail.commissionShareOverride ?? detail.levelCommissionShare;
  const rebateShare = detail.rebateShareOverride ?? detail.levelRebateShare;
  const custom = detail.commissionShareOverride !== null || detail.rebateShareOverride !== null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileCard title={t('clientProfile.partnerStanding')}>
        <dl className="grid grid-cols-2 gap-4">
          {/*
              The RUNG and the terms it carries (0112). Both replaced a named
              programme with its per-depth ladder — and, before that, a rung and
              a rate that had decided nothing since the programmes landed.

              The terms are NULLABLE and are not rendered as zeroes when absent:
              a partner standing deeper than the ladder is configured for has no
              terms at all, and showing "0%" would present that as a decision
              somebody made rather than as the gap it is.
          */}
          <Cell label={t('clientProfile.partnerLevel')}>
            <span className="font-semibold">
              {detail.levelName === null
                ? t('clientProfile.partnerLevelUnconfigured', { level: String(detail.level) })
                : t('clientProfile.levelOption', {
                    level: String(detail.level),
                    name: detail.levelName,
                  })}
            </span>
            {!detail.levelEnabled && (
              <span className="mt-0.5 block text-[11px] text-warning">
                {t('clientProfile.partnerLevelNotPaying')}
              </span>
            )}
          </Cell>

          <Cell label={t('clientProfile.partnerTerms')}>
            {commissionShare === null ? (
              <span className="text-muted-foreground">—</span>
            ) : !isSub ? (
              /* A main partner takes the rest (0197); their own share decides nothing. */
              <span className="tabular font-semibold">
                {t('clientProfile.mainTerms', { rebate: formatDecimal(rebateShare ?? '0') })}
              </span>
            ) : (
              /*
               * Shares of the traded product's commission type (0140). What
               * they come to in money depends on which product the client
               * trades, so the line names the fraction rather than a figure.
               */
              <span className="tabular font-semibold">
                {t('clientProfile.levelTerms', {
                  commission: t('clientProfile.termCommissionShare', {
                    share: formatDecimal(commissionShare),
                  }),
                  rebate: t('clientProfile.termRebateShare', {
                    share: formatDecimal(rebateShare ?? '0'),
                  }),
                })}
              </span>
            )}
            {isSub && custom && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {t('clientProfile.customTerms')}
              </span>
            )}
            {isSub && hasPermission(admin, 'ib.partners.edit') && (
              <button
                type="button"
                onClick={() => setEditingTerms(true)}
                className="mt-1 block text-xs text-link hover:underline focus-outline"
              >
                {t('clientProfile.editTerms')}
              </button>
            )}
            {editingTerms && (
              <SubPartnerTermsDialog
                open
                onClose={() => setEditingTerms(false)}
                partner={detail}
                name={detail.referralCode}
              />
            )}
          </Cell>

          <Cell label={t('clientProfile.partnerCode')}>
            <span className="font-mono text-sm font-semibold tracking-wider">
              {detail.referralCode}
            </span>
          </Cell>

          <Cell label={t('clientProfile.partnerState')}>
            {detail.active ? (
              <Badge variant="success">{t('clientProfile.partnerActive')}</Badge>
            ) : (
              <Badge variant="warning">{t('clientProfile.partnerSuspended')}</Badge>
            )}
          </Cell>

          <Cell label={t('clientProfile.partnerSince')}>
            {new Date(detail.approvedAt).toLocaleDateString()}
          </Cell>

          <Cell label={t('clientProfile.partnerParent')}>
            {detail.parent ? (
              <PersonLink
                person={detail.parent}
                className="text-link hover:underline focus-outline"
              />
            ) : detail.parentOutsideTerritory ? (
              /* They HAVE a parent, whom this reader may not see — never the
                 false "deals with the broker directly". */
              <span className="text-muted-foreground">
                {t('clientProfile.partnerParentOutsideTerritory')}
              </span>
            ) : (
              /* Not an absence to apologise for: no parent means they deal with
                 the broker directly, which is the top of a chain. */
              <span className="text-muted-foreground">{t('clientProfile.partnerNoParent')}</span>
            )}
          </Cell>

          {/*
            THE AGENCY, as a field of their standing (owner, 29 Sep 2026) — it
            was a card of its own for one name. It decides what their clients
            may trade, so the products ride with it.
          */}
          <div className="col-span-2">
            <Cell label={t('clientProfile.partnerAgency')}>
              {detail.agencyName ? (
                <div className="space-y-1.5">
                  <span className="font-semibold">{detail.agencyName}</span>
                  {detail.products.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.products.map((product) => (
                        <Badge key={product} variant="tag">
                          {product}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      {t('clientProfile.partnerAgencyNoProducts')}
                    </span>
                  )}
                </div>
              ) : (
                /* No agency is not "nothing configured" — their clients are
                   offered the FULL catalogue. */
                <span className="text-xs text-muted-foreground">
                  {t('clientProfile.partnerNoAgency')}
                </span>
              )}
            </Cell>
          </div>
        </dl>
      </ProfileCard>

      <ProfileCard title={t('clientProfile.partnerEarnings')}>
        <div className="grid grid-cols-2 gap-4">
          {/*
            ONE LINE PER CURRENCY, each in its own currency.

            This took a `currency` prop — hard-coded "USD" by the profile — and
            printed one total in it. The total was summed across every currency
            the partner had accrued in, so 100 USD and 90 EUR read as $190.00:
            a plausible figure describing nothing, on the number a partner is
            paid against. The API returns a line per currency now, and there is
            no FX source to add them with, so neither does this.
          */}
          <Stat
            icon={Coins}
            label={t('clientProfile.partnerConfirmed')}
            value={<EarningsLines earnings={detail.earnings} field="confirmed" />}
            hint={t('clientProfile.partnerConfirmedHint')}
            tone="primary"
          />
          <Stat
            icon={Coins}
            label={t('clientProfile.partnerPending')}
            value={<EarningsLines earnings={detail.earnings} field="pending" />}
            hint={t('clientProfile.partnerPendingHint')}
          />
          <Stat
            icon={Users}
            label={t('clientProfile.partnerClients')}
            value={String(detail.referredClientCount)}
            hint={withOutside(
              t('clientProfile.partnerClientsHint'),
              detail.referredClientsOutsideScope,
            )}
          />
          <Stat
            icon={Network}
            label={t('clientProfile.partnerSubCount')}
            value={String(detail.directPartners.length)}
            hint={withOutside(
              t('clientProfile.partnerSubCountHint'),
              detail.directPartnersOutsideScope,
            )}
          />
        </div>
      </ProfileCard>

      {/*
        THE PARTNERS BENEATH THEM, full width (owner, 29 Sep 2026): a table with
        each one's own line — level, agency, how many clients and partners they
        brought in — where it was a half-width list of names.
      */}
      <section className="space-y-2 lg:col-span-2" aria-labelledby="partner-sub-partners">
        {/* The table alone, no card around it (owner, 29 Sep 2026). */}
        <h2
          id="partner-sub-partners"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t('clientProfile.partnerSubPartners')}
        </h2>
        <DataTable
          caption={t('clientProfile.partnerSubPartners')}
          columns={SUB_PARTNER_COLUMNS}
          rows={detail.directPartners}
          rowKey={(sub) => String(sub.userId)}
          empty={
            <EmptyState
              icon={Network}
              message={
                detail.directPartnersOutsideScope > 0
                  ? t('clientProfile.networkPartnersOutsideScope', {
                      count: String(detail.directPartnersOutsideScope),
                    })
                  : t('clientProfile.partnerNoSubPartners')
              }
            />
          }
        />
        {detail.directPartners.length > 0 && detail.directPartnersOutsideScope > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('clientProfile.networkPartnersOutsideScope', {
              count: String(detail.directPartnersOutsideScope),
            })}
          </p>
        )}
      </section>
    </div>
  );
}

/** The sub-partner table: the person, then their own line. Small list, sorted here. */
const SUB_PARTNER_COLUMNS: Column<IbSubPartnerRow>[] = [
  {
    header: t('clientProfile.subColPartner'),
    sortable: false,
    cell: (sub) => (
      <ClientIdentity
        name={clientName(sub.firstName, sub.lastName)}
        email={sub.email}
        portalId={sub.portalId}
      />
    ),
  },
  {
    header: t('clientProfile.subColLevel'),
    sortable: true,
    sortKey: 'level',
    sortType: 'number',
    cell: (sub) =>
      sub.levelName
        ? t('clientProfile.levelOption', { level: String(sub.level), name: sub.levelName })
        : t('clientProfile.levelBadge', { level: String(sub.level) }),
    cellClassName: 'whitespace-nowrap',
  },
  {
    header: t('clientProfile.subColAgency'),
    sortable: true,
    sortKey: 'agencyName',
    cell: (sub) =>
      sub.agencyName ?? (
        <span className="text-muted-foreground">{t('clientProfile.subNoAgency')}</span>
      ),
  },
  {
    header: t('clientProfile.subColClients'),
    align: 'right',
    sortable: true,
    sortKey: 'clientCount',
    sortType: 'number',
    cell: (sub) => <span className="tabular">{sub.clientCount}</span>,
  },
  {
    header: t('clientProfile.subColPartners'),
    align: 'right',
    sortable: true,
    sortKey: 'subPartnerCount',
    sortType: 'number',
    cell: (sub) => <span className="tabular">{sub.subPartnerCount}</span>,
  },
  {
    header: t('clientProfile.subColCode'),
    sortable: false,
    cell: (sub) => <span className="font-mono text-xs">{sub.referralCode}</span>,
  },
  {
    header: t('clientProfile.subColStatus'),
    sortable: true,
    sortKey: 'active',
    cell: (sub) =>
      sub.active ? (
        <Badge variant="success">{t('clientProfile.partnerActive')}</Badge>
      ) : (
        <Badge variant="warning">{t('clientProfile.partnerSuspended')}</Badge>
      ),
  },
  {
    header: t('clientProfile.subColSince'),
    sortable: true,
    sortKey: 'approvedAt',
    sortType: 'date',
    cell: (sub) => new Date(sub.approvedAt).toLocaleDateString(),
    cellClassName: 'whitespace-nowrap text-muted-foreground',
  },
];

/** A label over a value, matching the identity grid's shape. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      {/* Wrapped, never truncated: "What they earn" is a sentence, and cutting it
          off mid-way hid the terms (owner, 26 Sep 2026). */}
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * One figure per currency the partner has earned in, stacked.
 *
 * An em dash, never a zero, when nothing has accrued: `$0.00` would name a
 * currency nobody chose and state a total nobody computed.
 */
function EarningsLines({
  earnings,
  field,
}: {
  earnings: IbPartnerEarnings[];
  field: 'confirmed' | 'pending';
}) {
  if (earnings.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="block space-y-0.5">
      {earnings.map((line) => (
        <span key={line.currency} className="block">
          {formatMoney(line[field], line.currency)}
        </span>
      ))}
    </span>
  );
}

/**
 * A scoped figure with what it leaves out: the count outside the reader's
 * territory, never who (R2). Every figure beside it is scoped, so without
 * this a partner whose book sits in another territory reads as having none.
 */
function withOutside(hint: string, outside: number): string {
  return outside > 0
    ? `${hint} · ${t('clientProfile.outsideTerritoryCount', { count: String(outside) })}`
    : hint;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: 'primary';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'primary' ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={`mt-1 text-lg font-bold tabular ${tone === 'primary' ? 'text-link' : ''}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * A partner named by name, else email, else — both being maskable (RBAC-03) —
 * the Portal ID alone. The tag beside it is shown only when it adds something.
 */
function PersonLink({
  person,
  className,
}: {
  person: {
    userId: ClientRef;
    firstName: string | null;
    lastName: string | null;
    email?: string;
    portalId: number;
  };
  className: string;
}) {
  const known = [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <PermittedLink href={`/clients/${person.portalId}`} className={className}>
        {known || `#${person.portalId}`}
      </PermittedLink>
      {known && <PortalIdTag id={person.portalId} />}
    </span>
  );
}
