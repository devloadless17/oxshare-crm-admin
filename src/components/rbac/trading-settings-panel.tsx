'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LineChart } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type TradingSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * The terms a client may open a trading account on — the Trading tab.
 *
 * Four numbers that used to be neither settings nor visible: the leverage
 * ladder came from `MT5_CLIENT_LEVERAGES` on the server, the demo funding
 * ceiling was a constant compiled into two apps, and the per-client account
 * caps were a constant in one. Every one of them is a commercial decision, and
 * the people who make those do not have shell access.
 *
 * Behind `settings.edit`, the same pair as the download links rather than the
 * master-admin lock on SMTP. Nothing here is a path to an administrator
 * account; the worst a bad value does is offer clients terms the broker did not
 * intend, which is attributable in the audit log and reversible from this
 * screen.
 */
export function TradingSettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useResource<TradingSettings>(['trading-settings'], () =>
    adminApi.getTradingSettings(),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <LineChart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('tradingSettings.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('tradingSettings.subtitle')}
        </p>
        {!canManage && (
          <p className="text-xs font-medium text-warning">{t('tradingSettings.readOnly')}</p>
        )}
      </header>

      <AsyncBoundary
        status={settings.status}
        label={t('tradingSettings.loading')}
        endpoints={['GET /admin/settings/trading']}
        onRetry={() => void settings.refetch()}
        errorMessage={apiErrorMessage(settings.error, t('tradingSettings.loadFailed'))}
        error={settings.error}
      >
        {settings.data && <TradingForm settings={settings.data} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

function TradingForm({ settings, canManage }: { settings: TradingSettings; canManage: boolean }) {
  /*
   * Seeded from the server value and then owned by the fields, matching the
   * other panels: a `value` bound straight to query data would let a background
   * refetch wipe what the operator is halfway through typing.
   *
   * All four are held as STRINGS, including the two counts. A number-typed
   * state forces a decision about what an empty box means, and the usual answer
   * — `Number(e.target.value) || 0` — turns a mid-edit blank into a saved zero,
   * which on `maxLiveAccounts` closes live account opening.
   */
  const [maxLiveAccounts, setMaxLiveAccounts] = React.useState(String(settings.maxLiveAccounts));
  const [maxDemoAccounts, setMaxDemoAccounts] = React.useState(String(settings.maxDemoAccounts));
  // Trailing zeros trimmed for display: the column is numeric(28,8) and
  // '1000000.00000000' in a text box is a number nobody typed.
  const [maxDemoDeposit, setMaxDemoDeposit] = React.useState(trimAmount(settings.maxDemoDeposit));
  const [ibCap, setIbCap] = React.useState(trimAmount(settings.ibMaxRevenueSharePct));
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateTradingSettings({
        maxLiveAccounts: parseCount(maxLiveAccounts),
        maxDemoAccounts: parseCount(maxDemoAccounts),
        maxDemoDeposit: maxDemoDeposit.trim(),
        ibMaxRevenueSharePct: ibCap.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['trading-settings'] });
      toastSuccess(t('tradingSettings.saved'));
    },
    // The API's own message. It names the offending leverage — "1OO is not a
    // leverage" — which a generic failure cannot.
    onError: (e: unknown) => setError(apiErrorMessage(e, t('tradingSettings.updateFailed'))),
  });

  const dirty =
    maxLiveAccounts.trim() !== String(settings.maxLiveAccounts) ||
    maxDemoAccounts.trim() !== String(settings.maxDemoAccounts) ||
    maxDemoDeposit.trim() !== trimAmount(settings.maxDemoDeposit) ||
    ibCap.trim() !== trimAmount(settings.ibMaxRevenueSharePct);

  const disabled = !canManage || mutation.isPending;
  const clear = () => setError(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {/*
        The LEVERAGE LADDER is not edited here any more.

        It was a comma-separated text box on this form, which could say what the
        ladder is but not that a rung had been WITHDRAWN — deleting a number
        from the string is indistinguishable from never having offered it, and
        says nothing about the accounts already opened on it.

        It has its own screen and its own table now (backend migration 0067),
        alongside currencies and the IB levels, which are operator catalogues of
        exactly the same class. Nothing links to it from here on purpose: two
        surfaces that appear to own one list is how the CSV and the table would
        drift.
      */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="trading-max-live"
          label={t('tradingSettings.maxLiveAccounts')}
          hint={t('tradingSettings.maxLiveAccountsHint')}
        >
          <input
            id="trading-max-live"
            type="number"
            inputMode="numeric"
            value={maxLiveAccounts}
            onChange={(e) => {
              setMaxLiveAccounts(e.target.value);
              clear();
            }}
            disabled={disabled}
            required
            min={0}
            max={100}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          id="trading-max-demo"
          label={t('tradingSettings.maxDemoAccounts')}
          hint={t('tradingSettings.maxDemoAccountsHint')}
        >
          <input
            id="trading-max-demo"
            type="number"
            inputMode="numeric"
            value={maxDemoAccounts}
            onChange={(e) => {
              setMaxDemoAccounts(e.target.value);
              clear();
            }}
            disabled={disabled}
            required
            min={0}
            max={100}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field
        id="trading-max-demo-deposit"
        label={t('tradingSettings.maxDemoDeposit')}
        hint={t('tradingSettings.maxDemoDepositHint')}
      >
        {/*
          `type="text"` with a numeric pattern, NOT `type="number"`.

          This is money and it stays a decimal string end to end. A number input
          hands back a value the browser has already normalised through a float,
          which is the coercion §6 exists to prevent — and its spinner on a
          seven-figure ceiling is useless anyway.
        */}
        <input
          id="trading-max-demo-deposit"
          type="text"
          inputMode="decimal"
          value={maxDemoDeposit}
          onChange={(e) => {
            setMaxDemoDeposit(e.target.value);
            clear();
          }}
          disabled={disabled}
          required
          pattern="\d+(\.\d{1,2})?"
          maxLength={20}
          placeholder="1000000"
          className={`${INPUT_CLASS} font-mono tabular-nums`}
        />
      </Field>

      <Field
        id="trading-ib-cap"
        label={t('tradingSettings.ibCap')}
        hint={t('tradingSettings.ibCapHint')}
      >
        {/*
          Text with a numeric pattern, not `type="number"` — this is a rate that
          reaches a money calculation, and a number input hands back a value the
          browser has already normalised through a float.
        */}
        <input
          id="trading-ib-cap"
          type="text"
          inputMode="decimal"
          value={ibCap}
          onChange={(e) => {
            setIbCap(e.target.value);
            clear();
          }}
          disabled={disabled}
          required
          pattern="(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)"
          maxLength={6}
          className={`${INPUT_CLASS} font-mono tabular-nums`}
        />
      </Field>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled || !dirty}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
      >
        {mutation.isPending ? (
          <>
            <Spinner />
            <span>{t('tradingSettings.saving')}</span>
          </>
        ) : saved ? (
          <>
            <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            <span>{t('tradingSettings.saved')}</span>
          </>
        ) : (
          <span>{t('tradingSettings.save')}</span>
        )}
      </button>
    </form>
  );
}

/**
 * A count box's contents, as an integer the API will accept.
 *
 * `Number(x) || fallback` is the idiom this replaces, and on this form it is a
 * live bug: `|| 5` turns a deliberate 0 — "stop opening new live accounts" —
 * into five. `NaN` maps to 0 instead, which is the safe direction here: a
 * malformed count closes the door rather than opening it wider, and the API
 * validates the value regardless.
 */
function parseCount(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `'1000000.00000000'` → `'1000000'`, for the text box only.
 *
 * String surgery rather than arithmetic — this is money, and the whole point of
 * keeping it as a string is that it never goes through a float. What is trimmed
 * is trailing zeros after a decimal point, and then the point itself.
 */
function trimAmount(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
      </label>
      {children}
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
