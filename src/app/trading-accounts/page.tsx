'use client';

import { BackendPending } from '@/components/backend-pending';
import { t } from '@/lib/i18n';

/**
 * MT5 accounts per client — waiting on its endpoint.
 *
 * There is no `GET /admin/trading-accounts`. MetaTrader is the system of record
 * for logins, groups and leverage (ARCHITECTURE §1), and the bridge that reads
 * it is not wired to an admin listing route yet.
 *
 * Same rule as `/wallets`: nothing is invented. A fabricated row here would be
 * a trading account an operator believes exists, and the first thing anyone
 * does with this screen is look up an account somebody is asking about.
 */
export default function TradingAccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('tradingAccounts.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('tradingAccounts.subtitle')}</p>
      </div>

      <BackendPending
        title={t('tradingAccounts.pendingTitle')}
        endpoints={['GET /admin/trading-accounts?userId&environment&cursor&limit']}
      />
    </div>
  );
}
