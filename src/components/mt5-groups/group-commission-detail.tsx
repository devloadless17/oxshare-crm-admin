'use client';

import { t } from '@/lib/i18n';
import {
  chargeLabel,
  commissionSummary,
  tierBounds,
  tierLine,
  tierRange,
  type GroupCommission,
} from './group-commission';

/**
 * The MT5 groups table's COMMISSION cell: one line per rule.
 *
 * NULL and EMPTY are different answers and read differently. Empty is the
 * server saying "this group charges nothing"; null is an older bridge that did
 * not report the rules at all, and "None" there would be a claim nobody made.
 */
export function GroupCommissionCell({
  commissions,
  currency,
}: {
  commissions: GroupCommission[] | null | undefined;
  currency: string;
}) {
  if (!commissions) {
    return <span className="text-muted-foreground">{t('mt5Groups.commissionUnknown')}</span>;
  }
  if (commissions.length === 0) {
    return <span className="text-muted-foreground">{t('mt5Groups.commissionNone')}</span>;
  }
  return (
    <div className="space-y-0.5">
      {commissions.map((rule, index) => (
        <div key={`${rule.name}-${index}`}>{commissionSummary(rule, currency)}</div>
      ))}
    </div>
  );
}

/**
 * Every rule and tier of a group, for the expanded row.
 *
 * Says where these come from in so many words: they are set on the trading
 * server by the broker, and an operator looking for the switch in this console
 * would otherwise look for a long time.
 */
export function GroupCommissionDetail({
  commissions,
  currency,
}: {
  commissions: GroupCommission[] | null | undefined;
  currency: string;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('mt5Groups.detailTitle')}</p>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t('mt5Groups.detailExplain')}</p>
      </div>

      {!commissions ? (
        <p className="text-muted-foreground">{t('mt5Groups.detailUnknown')}</p>
      ) : commissions.length === 0 ? (
        <p className="text-muted-foreground">{t('mt5Groups.detailNone')}</p>
      ) : (
        commissions.map((rule, index) => (
          <section
            key={`${rule.name}-${index}`}
            aria-label={rule.name || commissionSummary(rule, currency)}
            className="rounded-lg border border-border p-3"
          >
            <p className="font-semibold text-foreground">
              {rule.name || commissionSummary(rule, currency)}
            </p>
            {rule.description && <p className="text-muted-foreground">{rule.description}</p>}

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">{t('mt5Groups.detailSymbols')}</dt>
              {/* The MT5 path mask exactly, backslashes and all. */}
              <dd className="font-mono">{rule.symbolPath || '*'}</dd>
              <dt className="text-muted-foreground">{t('mt5Groups.detailCharged')}</dt>
              <dd>{chargeLabel(rule) ?? '—'}</dd>
            </dl>

            {rule.tiers.length > 0 && (
              <table className="mt-3 w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4 font-medium">{t('mt5Groups.detailTier')}</th>
                    <th className="py-1 pr-4 font-medium">{t('mt5Groups.detailRange')}</th>
                    <th className="py-1 font-medium">{t('mt5Groups.detailMinMax')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.tiers.map((tier, tierIndex) => (
                    <tr key={tierIndex} className="border-t border-border/60">
                      <td className="py-1 pr-4 tabular">{tierLine(tier, currency)}</td>
                      <td className="py-1 pr-4 tabular">{tierRange(tier) ?? '—'}</td>
                      <td className="py-1 tabular">{tierBounds(tier, currency) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))
      )}
    </div>
  );
}
