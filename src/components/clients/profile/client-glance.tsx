'use client';

import type { ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Handshake,
  History,
  LineChart,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import type {
  IbPartnerDetail,
  TradingAccountListResponse,
  TransactionListResponse,
  TransactionsSummary,
  WalletListResponse,
} from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { kindLabel } from '@/components/financial/transaction-badges';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/** The tabs a tile opens — the profile's own tab values. */
export type GlanceTab = 'money' | 'accounts' | 'transactions' | 'partner';

/**
 * THE CLIENT AT A GLANCE — one row of figures above the Overview's cards.
 *
 * The owner's correction (29 Sep 2026): the Overview had grown the tabs' own
 * lists — wallets, accounts, movements — so the same rows sat in two places.
 * An overview SUMMARISES: each tile is one figure, read from a count or a
 * single row (`limit: 1`, the server's totals), never a list, and clicking it
 * opens the tab that holds the detail.
 *
 * A tile whose data the reader may not see is left out. Money stays decimal
 * STRINGS, one line per currency, never added across currencies (§6.1).
 */
export function ClientGlance({
  userId,
  partner,
  onOpen,
}: {
  userId: number;
  partner: IbPartnerDetail | null;
  onOpen: (tab: GlanceTab) => void;
}) {
  const { admin } = useAdmin();
  const may = (key: string) => hasPermission(admin, key);
  const seesMovements = may('transactions.view');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      {may('wallets.view') && <BalanceTile userId={userId} onOpen={() => onOpen('money')} />}
      {may('trading.view') && <AccountsTile userId={userId} onOpen={() => onOpen('accounts')} />}
      {seesMovements && <TotalsTiles userId={userId} onOpen={() => onOpen('transactions')} />}
      {seesMovements && <LastActivityTile userId={userId} onOpen={() => onOpen('transactions')} />}
      {partner && may('ib.partners.view') && (
        <PartnerTile partner={partner} onOpen={() => onOpen('partner')} />
      )}
    </div>
  );
}

function BalanceTile({ userId, onOpen }: { userId: number; onOpen: () => void }) {
  const params = { userId, limit: 25 };
  const query = useResource<WalletListResponse>(keys.wallets.list(params), (signal) =>
    api.admin.getWallets(params, signal),
  );
  // Main wallets only: a partner's commission balance is theirs to move, not
  // the client's spendable money, and has its own figure on the Partner tile.
  const main = (query.data?.items ?? []).filter((wallet) => wallet.kind === 'main');
  return (
    <Tile
      icon={Wallet}
      label={t('clientProfile.glanceBalance')}
      onOpen={onOpen}
      status={query.status}
    >
      {main.length === 0 ? (
        <Muted>{t('clientProfile.glanceNoWallet')}</Muted>
      ) : (
        main.map((wallet) => (
          <span key={wallet.id} className="tabular block">
            {formatMoney(wallet.balance, wallet.currency)}
          </span>
        ))
      )}
    </Tile>
  );
}

function AccountsTile({ userId, onOpen }: { userId: number; onOpen: () => void }) {
  // Two COUNTS — a page of one row each, for its total.
  const all = { userId, limit: 1 };
  const live = { userId, limit: 1, environment: 'live' as const };
  const allQuery = useResource<TradingAccountListResponse>(keys.tradingAccounts.list(all), (s) =>
    api.admin.getTradingAccounts(all, s),
  );
  const liveQuery = useResource<TradingAccountListResponse>(keys.tradingAccounts.list(live), (s) =>
    api.admin.getTradingAccounts(live, s),
  );
  const total = allQuery.data?.total ?? 0;
  const liveCount = liveQuery.data?.total ?? 0;
  return (
    <Tile
      icon={LineChart}
      label={t('clientProfile.glanceAccounts')}
      onOpen={onOpen}
      status={allQuery.status}
      hint={
        total > 0
          ? t('clientProfile.glanceAccountsSplit', {
              live: String(liveCount),
              demo: String(total - liveCount),
            })
          : undefined
      }
    >
      <span className="tabular">{total}</span>
    </Tile>
  );
}

/** Deposited, withdrawn and pending — three tiles from ONE server summary. */
function TotalsTiles({ userId, onOpen }: { userId: number; onOpen: () => void }) {
  const params = { userId };
  const query = useResource<TransactionsSummary>(keys.transactions.summary(params), (signal) =>
    api.admin.getTransactionsSummary(params, signal),
  );
  const rows = query.data?.rows ?? [];
  const settled = (direction: 'deposit' | 'withdrawal') =>
    rows.filter(
      (row) => row.kind === 'payment' && row.direction === direction && row.state === 'success',
    );
  const pending = rows
    .filter(
      (row) =>
        row.kind === 'payment' &&
        (row.state === 'pending' || (row.direction === 'withdrawal' && row.state === 'approved')),
    )
    .reduce((sum, row) => sum + row.count, 0); // a count of rows, not money
  const lines = (list: typeof rows) =>
    list.length === 0 ? (
      <Muted>—</Muted>
    ) : (
      list.map((row) => (
        <span key={row.currency} className="tabular block">
          {formatMoney(row.total, row.currency)}
        </span>
      ))
    );
  return (
    <>
      <Tile
        icon={ArrowDownToLine}
        label={t('clientProfile.glanceDeposited')}
        onOpen={onOpen}
        status={query.status}
      >
        {lines(settled('deposit'))}
      </Tile>
      <Tile
        icon={ArrowUpFromLine}
        label={t('clientProfile.glanceWithdrawn')}
        onOpen={onOpen}
        status={query.status}
      >
        {lines(settled('withdrawal'))}
      </Tile>
      <Tile
        icon={Clock}
        label={t('clientProfile.glancePending')}
        onOpen={onOpen}
        status={query.status}
        tone={pending > 0 ? 'warning' : undefined}
      >
        <span className="tabular">{pending}</span>
      </Tile>
    </>
  );
}

function LastActivityTile({ userId, onOpen }: { userId: number; onOpen: () => void }) {
  const params = { userId, limit: 1, sort: 'createdAt' as const, order: 'desc' as const };
  const query = useResource<TransactionListResponse>(keys.transactions.list(params), (signal) =>
    api.admin.getTransactions(params, signal),
  );
  const last = query.data?.items[0];
  return (
    <Tile
      icon={History}
      label={t('clientProfile.glanceLastActivity')}
      onOpen={onOpen}
      status={query.status}
      hint={
        last
          ? `${last.kind === 'payment' ? t(last.direction === 'deposit' ? 'clientProfile.txTypeDeposit' : 'clientProfile.txTypeWithdrawal') : kindLabel(last.kind)} · ${formatMoney(last.amount, last.currency)}`
          : undefined
      }
    >
      {last ? (
        new Date(last.createdAt).toLocaleDateString()
      ) : (
        <Muted>{t('clientProfile.glanceNever')}</Muted>
      )}
    </Tile>
  );
}

function PartnerTile({ partner, onOpen }: { partner: IbPartnerDetail; onOpen: () => void }) {
  return (
    <Tile
      icon={Handshake}
      label={t('clientProfile.glancePartner')}
      onOpen={onOpen}
      status="ready"
      hint={t('clientProfile.glancePartnerHint', {
        clients: String(partner.referredClientCount),
        partners: String(partner.directPartners.length),
      })}
    >
      {partner.earnings.length === 0 ? (
        <Muted>—</Muted>
      ) : (
        partner.earnings.map((line) => (
          <span key={line.currency} className="tabular block">
            {formatMoney(line.confirmed, line.currency)}
          </span>
        ))
      )}
    </Tile>
  );
}

/* ── The tile ──────────────────────────────────────────────────────────────── */

function Tile({
  icon: Icon,
  label,
  hint,
  status,
  tone,
  onOpen,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  status: string;
  tone?: 'warning';
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-outline"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      <span
        className={`text-lg font-bold leading-tight ${tone === 'warning' ? 'text-warning' : 'text-foreground'}`}
      >
        {status === 'ready' ? children : <Muted>{status === 'loading' ? '…' : '—'}</Muted>}
      </span>
      {hint && status === 'ready' && (
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-sm font-normal text-muted-foreground">{children}</span>;
}
