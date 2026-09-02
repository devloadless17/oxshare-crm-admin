'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Wallet } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type RivalSettings, type RivalWebhookKey } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The Rival connection — the Payments tab.
 *
 * Rival is Loadless's own payments platform: Whish is integrated once, inside
 * it, and this CRM is one of its "companies". Deposits and payouts route
 * through the connection configured here, which makes this credential pair
 * SMTP-tier sensitive with a sharper edge — the API key can create payout
 * requests against the company balance, and whoever controls the base URL
 * receives every payout instruction this system issues.
 *
 * ── Two secrets with opposite lifecycles ───────────────────────────────────
 *
 * The API KEY is Rival's, pasted in: write-only, three-state (untouched keeps,
 * cleared removes, typed replaces), never read back.
 *
 * The WEBHOOK KEY is OURS, minted here: shown in plaintext EXACTLY ONCE in the
 * modal below, then only its fingerprint. The operator pastes it — with the
 * endpoint URL beside it — into Rival's dashboard, whose own CRM-config write
 * is deliberately session-only so a leaked integration key cannot repoint the
 * money-event stream.
 *
 * ── `lastEventAt` is the pipe's pulse ──────────────────────────────────────
 *
 * Bumped on every VERIFIED delivery. "Never" after go-live means the two
 * sides do not agree on the key or the URL — the test button's comparison
 * view exists for exactly that conversation.
 */
export function RivalSettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useResource<RivalSettings>(keys.settings.rival(), () =>
    adminApi.getRivalSettings(),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('rival.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('rival.subtitle')}</p>
      </header>

      <AsyncBoundary
        status={settings.status}
        label={t('rival.loading')}
        endpoints={['GET /admin/settings/rival']}
        onRetry={() => void settings.refetch()}
        errorMessage={apiErrorMessage(settings.error, t('rival.loadFailed'))}
        error={settings.error}
      >
        {settings.data && <RivalForm settings={settings.data} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

function RivalForm({ settings, canManage }: { settings: RivalSettings; canManage: boolean }) {
  const [baseUrl, setBaseUrl] = React.useState(settings.baseUrl ?? '');
  const [apiKey, setApiKey] = React.useState('');
  const [enabled, setEnabled] = React.useState(settings.enabled);

  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [minted, setMinted] = React.useState<RivalWebhookKey | null>(null);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateRivalSettings({
        baseUrl: baseUrl.trim() || null,
        // Untouched field → undefined → the stored key is kept (three-state).
        apiKey: apiKey !== '' ? apiKey : undefined,
        enabled,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setApiKey('');
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: keys.settings.rival() });
      toastSuccess(t('rival.saved'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('rival.updateFailed'))),
  });

  const mint = useMutation({
    mutationFn: () => adminApi.mintRivalWebhookKey(),
    onSuccess: (key) => {
      setError(null);
      setMinted(key);
      void queryClient.invalidateQueries({ queryKey: keys.settings.rival() });
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('rival.mintFailed'))),
  });

  const test = useMutation({
    mutationFn: () => adminApi.testRivalConnection(),
    onSuccess: (result) => {
      setError(null);
      const theirUrl = result.rivalCrmConfig.apiUrl ?? t('rival.testNotSet');
      const oursUrl = result.expectedApiUrl ?? t('rival.testNotSet');
      const matches = result.rivalCrmConfig.apiUrl === result.expectedApiUrl;
      setTestResult(
        matches
          ? t('rival.testOkMatch', { url: oursUrl })
          : t('rival.testOkMismatch', { theirs: theirUrl, ours: oursUrl }),
      );
    },
    onError: (e: unknown) => {
      setTestResult(null);
      setError(apiErrorMessage(e, t('rival.testFailed')));
    },
  });

  const dirty =
    (baseUrl.trim() || null) !== (settings.baseUrl ?? null) ||
    enabled !== settings.enabled ||
    apiKey !== '';

  const busy = save.isPending || !canManage;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="rival-base-url" className="block text-xs font-semibold text-foreground">
          {t('rival.baseUrl')}
        </label>
        <input
          id="rival-base-url"
          type="url"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setError(null);
          }}
          disabled={busy}
          maxLength={2048}
          placeholder="https://portal.rivalpayments.com/v1"
          className={INPUT_CLASS}
        />
        <p className="text-[11px] text-muted-foreground">{t('rival.baseUrlHint')}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rival-api-key" className="block text-xs font-semibold text-foreground">
          {t('rival.apiKey')}
        </label>
        <input
          id="rival-api-key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setError(null);
          }}
          disabled={busy}
          maxLength={300}
          placeholder="tsk_…"
          className={INPUT_CLASS}
        />
        {/* Without this, an empty box on a freshly loaded screen reads as
            "no key configured". */}
        <p className="text-[11px] text-muted-foreground">
          {settings.apiKeySet ? t('rival.apiKeySetHint') : t('rival.apiKeyNoneHint')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="rival-enabled"
          checked={enabled}
          onCheckedChange={(value) => {
            setEnabled(value === true);
            setError(null);
          }}
          disabled={busy}
        />
        <label
          htmlFor="rival-enabled"
          className="cursor-pointer text-xs font-semibold text-foreground"
        >
          {t('rival.enabled')}
        </label>
      </div>

      {/* ── The webhook half ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <h4 className="flex items-center gap-2 text-xs font-bold text-foreground">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {t('rival.webhookTitle')}
        </h4>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('rival.webhookExplainer')}
        </p>

        <ReadonlyRow
          label={t('rival.webhookEndpoint')}
          value={settings.webhookEndpoint ?? t('rival.webhookEndpointUnset')}
          copyable={settings.webhookEndpoint !== null}
        />
        <ReadonlyRow
          label={t('rival.webhookFingerprint')}
          value={settings.webhookKeyFingerprint ?? t('rival.webhookKeyNone')}
          copyable={false}
        />
        <ReadonlyRow
          label={t('rival.lastEvent')}
          value={
            settings.lastEventAt
              ? new Date(settings.lastEventAt).toLocaleString()
              : t('rival.lastEventNever')
          }
          copyable={false}
        />

        <button
          type="button"
          disabled={mint.isPending || !canManage}
          onClick={() => mint.mutate()}
          className={SECONDARY_BUTTON_CLASS}
        >
          {mint.isPending ? <Spinner /> : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>
            {settings.webhookKeyFingerprint
              ? t('rival.rotateWebhookKey')
              : t('rival.generateWebhookKey')}
          </span>
        </button>
        {settings.webhookKeyFingerprint && (
          <p className="text-[11px] text-warning">{t('rival.rotateWarning')}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {testResult && (
        <p role="status" className="text-[11px] text-muted-foreground whitespace-pre-line">
          {testResult}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={busy || !dirty} className={BUTTON_CLASS}>
          {save.isPending ? (
            <>
              <Spinner />
              <span>{t('rival.saving')}</span>
            </>
          ) : saved ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span>{t('rival.savedShort')}</span>
            </>
          ) : (
            <span>{t('rival.save')}</span>
          )}
        </button>
        <button
          type="button"
          disabled={test.isPending || !settings.apiKeySet}
          onClick={() => test.mutate()}
          className={SECONDARY_BUTTON_CLASS}
        >
          {test.isPending && <Spinner />}
          <span>{t('rival.test')}</span>
        </button>
      </div>

      {/* The shown-once modal. Closing it is the last time the key exists
          outside Rival's dashboard and the encrypted row. */}
      <Modal
        open={minted !== null}
        onClose={() => setMinted(null)}
        title={t('rival.mintedTitle')}
        description={t('rival.mintedDescription')}
      >
        {minted && (
          <div className="space-y-3">
            <CopyBlock label={t('rival.mintedKey')} value={minted.webhookKey} />
            {minted.endpoint && (
              <CopyBlock label={t('rival.webhookEndpoint')} value={minted.endpoint} />
            )}
            <p className="text-[11px] text-warning">{t('rival.mintedWarning')}</p>
            <button type="button" onClick={() => setMinted(null)} className={BUTTON_CLASS}>
              {t('rival.mintedDone')}
            </button>
          </div>
        )}
      </Modal>
    </form>
  );
}

function ReadonlyRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-semibold text-foreground shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground truncate">
        <span className="truncate font-mono">{value}</span>
        {copyable && <CopyButton value={value} />}
      </span>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
        <code className="flex-1 break-all text-[11px] text-foreground">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={t('rival.copy')}
      title={t('rival.copy')}
      className="rounded p-1 text-muted-foreground hover:text-foreground focus-outline"
      onClick={() => {
        // A silent failure here (plain HTTP, denied permission) looks exactly
        // like a button nobody pressed — say so instead.
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            setFailed(false);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
            setFailed(true);
          }
        })();
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className={`h-3.5 w-3.5 ${failed ? 'text-destructive' : ''}`} aria-hidden="true" />
      )}
    </button>
  );
}

const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus-outline disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold ' +
  'text-primary-foreground hover:bg-primary/90 focus-outline disabled:cursor-not-allowed ' +
  'disabled:opacity-60';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 ' +
  'text-xs font-semibold text-foreground hover:bg-accent focus-outline ' +
  'disabled:cursor-not-allowed disabled:opacity-60';
