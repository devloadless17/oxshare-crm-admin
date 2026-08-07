'use client';

import { BackendPending } from '@/components/backend-pending';
import { t } from '@/lib/i18n';

/**
 * Client balances — waiting on its endpoint.
 *
 * There is no `GET /admin/wallets`. The money layer exposes a client's own
 * wallet and the admin ledger, but nothing that lists wallets across clients,
 * so there is no honest way to draw this table.
 *
 * The page exists anyway, and that is the point: a balance screen rendering
 * `$0.00` for want of an endpoint is indistinguishable from a client who
 * genuinely holds nothing, and the portal shipped exactly that bug — `/wallet`
 * showed $0.00 to a client holding $700 while `GET /wallet` worked fine. On a
 * money system a plausible-looking zero is worse than a blank, because nobody
 * investigates a number that looks reasonable.
 *
 * `BackendPending` names the missing endpoint, so the state doubles as a to-do
 * for whoever owns the API rather than as a screen somebody has to remember is
 * fake.
 */
export default function WalletsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('wallets.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('wallets.subtitle')}</p>
      </div>

      <BackendPending
        title={t('wallets.pendingTitle')}
        endpoints={['GET /admin/wallets?userId&currency&cursor&limit']}
      />
    </div>
  );
}
