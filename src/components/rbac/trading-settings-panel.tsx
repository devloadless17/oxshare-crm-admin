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
import { SettingsSavedLine } from './settings-saved-line';
import { keys } from '@/lib/query-keys';

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
  const settings = useResource<TradingSettings>(keys.settings.trading(), () =>
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
  /*
   * The ladder ceiling (0105) — the ONE IB number on this form, and it is a
   * different kind of thing from the four below. Those decided what partners
   * are PAID; this bounds what the Commission Programmes page will accept.
   */
  const [maxLevels, setMaxLevels] = React.useState(String(settings.ibMaxLevels));
  /*
   * The total payout ceiling (0106) — the SECOND number of that kind, and it
   * bounds something no programme can see about itself.
   *
   * `ib_programs_share_fits` already stops ONE programme paying out more than
   * 100%. It cannot stop two: the earners on a trade may hold different
   * programmes, each inside its own limit and together over the broker's. The
   * seeded catalogue was exactly that — 60% at depth 1 and 40% at depth 2 paid
   * out the entire revenue and nothing refused it.
   *
   * Kept as the RAW STRING the user typed, like `maxDemoDeposit` beside it and
   * unlike the counts: it is a decimal that reaches the money path, and
   * round-tripping it through a number is what §6.1 exists to prevent.
   */
  const [maxPayout, setMaxPayout] = React.useState(trimAmount(settings.ibMaxTotalPayoutPct));
  /*
   * ── NO OTHER IB STATE HERE (0104) ────────────────────────────────────────
   *
   * Four more controls lived on this form and each changed what every partner
   * is paid: the broker cap, the settlement window, the backlog decision and
   * the revenue basis.
   *
   * The ceiling above is NOT that broker cap returning. That one SCALED every
   * leg pro rata to fit and paid immediately, so a partner quietly received
   * less than their programme promised with nothing saying so. This one
   * REFUSES: the deal defers, the queue alarm fires, and it pays in full once
   * the rates are corrected.
   *
   * Commission is configured on the Commission Programmes page. A second screen
   * that also decides partner pay is a second place for two answers to
   * disagree, with nothing telling an operator which one the money used — the
   * same fault removed from the catalogue itself when `ib_levels` sat beside
   * `ib_programs`.
   *
   * The window and the backlog decision read `IB_COMMISSION_HOLD_HOURS` and
   * `IB_ACCRUAL_START` from the environment. The aged-backlog guard is
   * unchanged: unset, a run facing months of ingested history HOLDS rather than
   * paying it.
   */
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateTradingSettings({
        maxLiveAccounts: parseCount(maxLiveAccounts),
        maxDemoAccounts: parseCount(maxDemoAccounts),
        maxDemoDeposit: maxDemoDeposit.trim(),
        ibMaxLevels: parseLevels(maxLevels, settings.ibMaxLevels),
        ibMaxTotalPayoutPct: maxPayout.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: keys.settings.trading() });
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
    maxLevels.trim() !== String(settings.ibMaxLevels) ||
    maxPayout.trim() !== trimAmount(settings.ibMaxTotalPayoutPct);

  const disabled = !canManage || mutation.isPending;
  const clear = () => setError(null);

  /*
   * `submit` IS GONE (0104), and it existed only for the backlog decision.
   *
   * It gated Save behind a confirmation when the accrual start CHANGED —
   * that field decides which trades are ever paid for, marks the rest decided
   * for ever, and is not undone by setting it back. Nothing left on this form
   * has that shape: the account caps and the demo ceiling are terms an operator
   * adjusts and re-adjusts, and a confirmation on every save trains people to
   * click through it.
   *
   * The decision still exists as `IB_ACCRUAL_START`, deliberate by being a
   * deploy rather than by being a dialog.
   */

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
        id="trading-max-levels"
        label={t('tradingSettings.maxLevels')}
        hint={t('tradingSettings.maxLevelsHint')}
      >
        <input
          id="trading-max-levels"
          type="number"
          value={maxLevels}
          onChange={(e) => {
            setMaxLevels(e.target.value);
            clear();
          }}
          disabled={disabled}
          required
          /*
           * 1 to 10, matching the API and the two depth CHECKs behind it. No
           * zero: unlike the account caps above, where 0 means "stop opening
           * new ones" and is a state somebody may want, a ceiling of zero would
           * make every commission-paying programme unsaveable.
           */
          min={1}
          max={10}
          step={1}
          className={`${INPUT_CLASS} font-mono tabular-nums`}
        />
      </Field>

      <Field
        id="trading-max-payout"
        label={t('tradingSettings.maxPayout')}
        hint={t('tradingSettings.maxPayoutHint')}
      >
        <input
          id="trading-max-payout"
          type="number"
          value={maxPayout}
          onChange={(e) => {
            setMaxPayout(e.target.value);
            clear();
          }}
          disabled={disabled}
          required
          /*
           * Above 0 and at most 100, matching the CHECK behind the column.
           *
           * Not zero, for a harder reason than the ladder ceiling above: zero
           * here refuses every chain on the platform, which is a way to stop
           * paying every partner by typing a number into a settings form.
           * Switching terms off is what a programme's own `enabled` flag does,
           * and that control says so on the screen it lives on.
           *
           * `step` is 0.01 rather than 1 because this is a rate, not a count —
           * 62.5 is an ordinary answer here and a whole-number stepper would
           * make it look like a mistake.
           */
          min={0.01}
          max={100}
          step={0.01}
          className={`${INPUT_CLASS} font-mono tabular-nums`}
        />
      </Field>

      {/*
        ── THE OTHER IB CONTROLS ARE GONE FROM THIS FORM (0104) ──────────────

        Four fields sat here and every one changed what partners are paid:
        "Maximum paid to partners (%)", the settlement window, "Commission is
        paid from" / "Paying from", and "Partners are paid on".

        Commission is configured on the Commission Programmes page. Keeping a
        second screen that also decides partner pay is a second place for two
        answers to disagree, with nothing telling an operator which one the
        money used — the same fault removed from the catalogue itself when
        `ib_levels` sat beside `ib_programs`.
      */}

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
      {/* WHO last saved this, and when — recorded on every save and shown
          nowhere until now. Renders nothing on a row still using its boot
          configuration, which has no author. */}
      <SettingsSavedLine updatedAt={settings.updatedAt} updatedByName={settings.updatedByName} />
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
 * A ladder ceiling the API will accept, or the SAVED value when the box is not
 * a usable number.
 *
 * Falling back to what is stored rather than to 1 or to 10, and the direction
 * is the point in both directions: 10 would let a typo widen what every future
 * trade pays out, and 1 would silently make deeper programmes unsaveable. The
 * stored value is the only answer that changes nothing.
 *
 * `Number(x) || fallback` is banned here for the reason it is banned on every
 * other numeric control in this app: it is the idiom that turns a typo into a
 * plausible number nobody typed.
 */
function parseLevels(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 1 || parsed > 10) return fallback;
  return parsed;
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

/*
 * `parseHours`, `REVENUE_BASES`, `ACCRUAL_MODES`, `accrualModeOf`,
 * `accrualDateOf`, `todayIso` and `accrualStartValue` all went in 0104 with the
 * IB controls they served.
 *
 * They were the interesting half of this file — a settlement window that must
 * never parse a typo into zero, and a backlog decision held as a mode plus a
 * date so each of its three meanings was a separate act. All of it belongs to
 * settings this form no longer owns: the window and the backlog start read
 * `IB_COMMISSION_HOLD_HOURS` and `IB_ACCRUAL_START` from the environment, and
 * the revenue basis is a constant.
 */

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
