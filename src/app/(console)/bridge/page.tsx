'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Radio } from 'lucide-react';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Tabs, type TabDefinition } from '@/components/ui/tabs';
import { t } from '@/lib/i18n';
import { BridgeLogsPanel } from '@/components/bridge/bridge-logs-panel';
import { BridgeOperationsPanel } from '@/components/bridge/bridge-operations-panel';
import { BridgeOutboxPanel } from '@/components/bridge/bridge-outbox-panel';

/**
 * Is the MT5 bridge doing its job — and did it leave anything unresolved.
 *
 * ## Why this screen exists at all
 *
 * The bridge sits between MT5 and this system, and both of its failure modes are
 * INVISIBLE from either side alone.
 *
 * A deal that never arrives leaves no row anywhere. There is nothing to notice
 * the absence of, so ingestion can be broken for weeks while every screen looks
 * correct — that is not hypothetical, it is what happened: `mt5_deals` was empty
 * from launch because the bridge could not read a deal page, and the only
 * symptom was a commission engine quietly paying nobody.
 *
 * A balance operation can be sent to MT5 with its outcome never confirmed. The
 * bridge holds the idempotency key claimed so a retry cannot double-credit,
 * which also means the row sits there until a person reconciles it. Nothing
 * surfaced those rows before this page.
 *
 * ## Read-only, and there is no "retry" button
 *
 * The queue retries on its own; a button would only race it. And an unresolved
 * balance operation must NOT get a one-click retry — that is precisely the
 * action that turns "we do not know whether the money moved" into "it moved
 * twice". Resolving one means checking MT5's own deal history first, which is
 * work this screen can inform but must not appear to automate.
 *
 * ## `trading.view`
 *
 * Shared with `/trading-accounts` deliberately: this is the same client data one
 * layer down. `permissions.ts` records why a dedicated key would have been worse.
 */
export default function BridgePage() {
  const [tab, setTab] = React.useState('outbox');

  const tabs: TabDefinition[] = [
    { value: 'outbox', label: t('bridge.tab.outbox') },
    { value: 'operations', label: t('bridge.tab.operations') },
    { value: 'logs', label: t('bridge.tab.logs') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t('bridge.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('bridge.subtitle')}</p>
      </header>

      <Tabs tabs={tabs} value={tab} onValueChange={setTab} idPrefix="bridge" />

      {/*
        Mounted one at a time rather than hidden with CSS, so switching tabs does
        not fire three requests at the bridge. Every one of these is a round trip
        to a service behind a single lock — the same reason the account screens
        read one window at a time.
      */}
      {tab === 'outbox' && <OutboxTab />}
      {tab === 'operations' && <OperationsTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  );
}

function OutboxTab() {
  const [pendingOnly, setPendingOnly] = React.useState(false);

  const outbox = useResource(
    ['bridge-outbox', pendingOnly],
    (signal) => api.admin.getBridgeOutbox({ pending: pendingOnly, limit: 200 }, signal),
    // One attempt. A bridge that is down should say so immediately rather than
    // after three silent retries — the delay is the whole cost on a screen
    // somebody opened because something is already wrong.
    { retry: 0 },
  );

  return (
    <AsyncBoundary
      status={outbox.status}
      label={t('bridge.loading')}
      endpoints={['GET /admin/bridge/outbox']}
      onRetry={() => void outbox.refetch()}
      errorMessage={t('bridge.loadFailed')}
      error={outbox.error}
    >
      <BridgeOutboxPanel
        data={outbox.data}
        dimmed={outbox.isFetching}
        pendingOnly={pendingOnly}
        onPendingOnlyChange={setPendingOnly}
      />
    </AsyncBoundary>
  );
}

function OperationsTab() {
  const [stuckOnly, setStuckOnly] = React.useState(false);

  const operations = useResource(
    ['bridge-operations', stuckOnly],
    (signal) => api.admin.getBridgeOperations({ stuck: stuckOnly, limit: 200 }, signal),
    { retry: 0 },
  );

  return (
    <AsyncBoundary
      status={operations.status}
      label={t('bridge.loading')}
      endpoints={['GET /admin/bridge/operations']}
      onRetry={() => void operations.refetch()}
      errorMessage={t('bridge.loadFailed')}
      error={operations.error}
    >
      <BridgeOperationsPanel
        data={operations.data}
        dimmed={operations.isFetching}
        stuckOnly={stuckOnly}
        onStuckOnlyChange={setStuckOnly}
      />
    </AsyncBoundary>
  );
}

function LogsTab() {
  const [contains, setContains] = React.useState('');

  /*
   * The FILTER is in the query key, so each one is its own cached result rather
   * than a refetch that briefly shows the previous filter's lines under the new
   * term — the one moment a log view actively misleads.
   */
  const logs = useResource(
    ['bridge-logs', contains],
    (signal) => api.admin.getBridgeLogs({ lines: 400, contains: contains || undefined }, signal),
    { retry: 0 },
  );

  return (
    <AsyncBoundary
      status={logs.status}
      label={t('bridge.loading')}
      endpoints={['GET /admin/bridge/logs']}
      onRetry={() => void logs.refetch()}
      errorMessage={t('bridge.loadFailed')}
      error={logs.error}
    >
      <BridgeLogsPanel
        data={logs.data}
        dimmed={logs.isFetching}
        contains={contains}
        onContainsChange={setContains}
      />
    </AsyncBoundary>
  );
}

/**
 * A summary figure, with `tone` carrying whether it is bad news.
 *
 * Exported because all three panels use it and a fourth copy of a status colour
 * is how two of them end up disagreeing about what red means.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <div
        className={`mt-1 text-lg font-bold tabular-nums ${
          tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''
        }`}
      >
        {value}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The banner above each table: healthy, or a specific count of what is wrong.
 *
 * Takes the SENTENCE rather than composing one, because the two screens it
 * serves need different words for their bad case — a queued deal is late, an
 * unresolved balance operation is money in an unknown state — and a shared
 * "something is wrong" would flatten that distinction.
 */
export function StatusBanner({ healthy, message }: { healthy: boolean; message: string }) {
  const Icon = healthy ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
        healthy
          ? 'border-success/20 bg-success/10 text-success'
          : 'border-destructive/20 bg-destructive/10 text-destructive'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

/** Shared empty-state icon, so the three panels look like one screen. */
export const BridgeIcon = Radio;
