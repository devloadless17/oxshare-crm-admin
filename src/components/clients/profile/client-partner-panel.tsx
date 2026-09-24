'use client';

import { Coins, Network, Users } from 'lucide-react';
import type { IbPartnerDetail } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { PermittedLink } from '@/components/permitted-link';
import { EmptySection, ProfileCard } from '@/components/clients/profile/profile-cards';
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
 * `earnings.confirmed` and `.pending` are decimal strings at NUMERIC(28,8)
 * scale and are handed to `formatMoney` untouched. `Number()` on this path is a
 * lint error in this repo, and the reason is §6.1: the value can exceed what a
 * double represents exactly, so the conversion is wrong before formatting
 * starts.
 *
 * `rateValue` is a percentage rather than money, and is trimmed for display —
 * the stored scale is for arithmetic, not for reading.
 */
export function ClientPartnerPanel({
  detail,
  currency,
}: {
  detail: IbPartnerDetail;
  /** What the earnings are denominated in — the platform default. */
  currency: string;
}) {
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
            {detail.levelCommissionMode === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="tabular font-semibold">
                {t('clientProfile.levelTerms', {
                  commission:
                    detail.levelCommissionMode === 'per_lot'
                      ? t('clientProfile.termPerLot', {
                          amount: formatDecimal(detail.levelCommissionAmountPerLot ?? '0'),
                        })
                      : t('clientProfile.termPercent', {
                          rate: formatDecimal(detail.levelCommissionRate ?? '0'),
                        }),
                  rebate:
                    detail.levelRebateMode === 'per_lot'
                      ? t('clientProfile.termPerLot', {
                          amount: formatDecimal(detail.levelRebateAmountPerLot ?? '0'),
                        })
                      : t('clientProfile.termPercent', {
                          rate: formatDecimal(detail.levelRebateRate ?? '0'),
                        }),
                })}
              </span>
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
            ) : (
              /* Not an absence to apologise for: no parent means they deal with
                 the broker directly, which is the top of a chain. */
              <span className="text-muted-foreground">{t('clientProfile.partnerNoParent')}</span>
            )}
          </Cell>
        </dl>
      </ProfileCard>

      <ProfileCard title={t('clientProfile.partnerEarnings')}>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            icon={Coins}
            label={t('clientProfile.partnerConfirmed')}
            value={formatMoney(detail.earnings.confirmed, currency)}
            hint={t('clientProfile.partnerConfirmedHint')}
            tone="primary"
          />
          <Stat
            icon={Coins}
            label={t('clientProfile.partnerPending')}
            value={formatMoney(detail.earnings.pending, currency)}
            hint={t('clientProfile.partnerPendingHint')}
          />
          <Stat
            icon={Users}
            label={t('clientProfile.partnerClients')}
            value={String(detail.referredClientCount)}
            hint={t('clientProfile.partnerClientsHint')}
          />
          <Stat
            icon={Network}
            label={t('clientProfile.partnerSubCount')}
            value={String(detail.directPartners.length)}
            hint={t('clientProfile.partnerSubCountHint')}
          />
        </div>
      </ProfileCard>

      <ProfileCard title={t('clientProfile.partnerAgency')}>
        {detail.agencyName ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{detail.agencyName}</p>
            {detail.products.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.products.map((product) => (
                  <Badge key={product} variant="tag">
                    {product}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('clientProfile.partnerAgencyNoProducts')}
              </p>
            )}
          </div>
        ) : (
          /*
           * No agency is not "nothing configured" — their clients are offered
           * the FULL catalogue. Saying "none" would read as the opposite, which
           * is the note the backend DTO carries for the same field.
           */
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('clientProfile.partnerNoAgency')}
          </p>
        )}
      </ProfileCard>

      <ProfileCard title={t('clientProfile.partnerSubPartners')}>
        {detail.directPartners.length > 0 ? (
          <ul className="space-y-2">
            {detail.directPartners.map((sub) => (
              <li
                key={sub.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5"
              >
                <div className="min-w-0">
                  <PersonLink
                    person={sub}
                    className="truncate text-sm font-medium text-link hover:underline focus-outline"
                  />
                  <p className="truncate text-[11px] text-muted-foreground">{sub.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {sub.referralCode}
                  </span>
                  <Badge variant="tag">
                    {t('clientProfile.levelBadge', { level: String(sub.level) })}
                  </Badge>
                  {!sub.active && (
                    <Badge variant="warning">{t('clientProfile.partnerSuspended')}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptySection message={t('clientProfile.partnerNoSubPartners')} />
        )}
      </ProfileCard>
    </div>
  );
}

/** A label over a value, matching the identity grid's shape. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
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
  value: string;
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
    userId: string;
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
