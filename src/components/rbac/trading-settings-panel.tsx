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
        errorMessage={t('tradingSettings.loadFailed')}
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
   * Held as STRINGS. The two account caps that sat here are per PRODUCT now
   * (backend 0201): each product's "Max accounts per client", on its own page.
   */
  // Trailing zeros trimmed for display: the column is numeric(28,8) and
  // '1000000.00000000' in a text box is a number nobody typed.
  const [maxDemoDeposit, setMaxDemoDeposit] = React.useState(trimAmount(settings.maxDemoDeposit));
  /*
   * The ladder ceiling (0105) — the ONE IB number on this form, and it is a
   * different kind of thing from the four below. Those decided what partners
   * are PAID; this bounds what the Commission Programmes page will accept.
   */
  /*
   * The interval is stored in SECONDS and edited as a number plus a unit,
   * because "3600" is not how anybody thinks about how often partners are paid.
   * `splitInterval` picks the largest unit that divides cleanly, so a stored
   * 3600 reads back as "1 hour" rather than "60 minutes".
   */
  const initialInterval = splitInterval(settings.ibCommissionIntervalSeconds);
  const [intervalValue, setIntervalValue] = React.useState(String(initialInterval.value));
  const [intervalUnit, setIntervalUnit] = React.useState<IntervalUnit>(initialInterval.unit);
  /*
   * ── THE TWO PAYOUT CEILINGS ARE NOT ON THIS FORM (0112) ──────────────────
   *
   * `ibMaxTotalPayoutPct` and `ibMaxPayoutPerLot` had inputs here. Both are
   * still stored and still enforced on every accrual — they are the
   * unit-error backstop that refuses a rate meaning 70x rather than 70%.
   * What went is the CONTROL, on an explicit instruction.
   *
   * The API dropped them from the PUT with the fields, so this form no longer
   * sends them and the columns keep whatever they hold — 100% and $50 a lot by
   * default, both far above any real rate card.
   */
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
  /*
   * Flash timer held and cleared on unmount — see `payment-providers/copy-controls.tsx`
   * for what an unguarded one costs (`ReferenceError: window is not defined`,
   * blamed on an unrelated test). Enforced by `flash-timer-census.test.ts`.
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateTradingSettings({
        maxDemoDeposit: maxDemoDeposit.trim(),
        ibCommissionIntervalSeconds: parseInterval(
          intervalValue,
          intervalUnit,
          settings.ibCommissionIntervalSeconds,
        ),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      flashTimer.current = window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: keys.settings.trading() });
      // The commission interval is ALSO a scheduled job's interval (the jobs
      // panel invalidates this key on its side for the same reason).
      void queryClient.invalidateQueries({ queryKey: keys.settings.scheduledJobs() });
      toastSuccess(t('tradingSettings.saved'));
    },
    // The API's own message. It names the offending leverage — "1OO is not a
    // leverage" — which a generic failure cannot.
    onError: (e: unknown) => setError(apiErrorMessage(e, t('tradingSettings.updateFailed'))),
  });

  const dirty =
    maxDemoDeposit.trim() !== trimAmount(settings.maxDemoDeposit) ||
    parseInterval(intervalValue, intervalUnit, settings.ibCommissionIntervalSeconds) !==
      settings.ibCommissionIntervalSeconds;

  const disabled = !canManage || mutation.isPending;
  const clear = () => setError(null);

  /*
   * `submit` IS GONE (0104), and it existed only for the backlog decision.
   *
   * It gated Save behind a confirmation when the accrual start CHANGED —
   * that field decides which trades are ever paid for, marks the rest decided
   * for ever, and is not undone by setting it back. Nothing left on this form
   * has that shape: the demo ceiling is a term an operator
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
        id="trading-commission-interval"
        label={t('tradingSettings.commissionInterval')}
        hint={t('tradingSettings.commissionIntervalHint')}
      >
        <div className="flex gap-2">
          <input
            id="trading-commission-interval"
            type="number"
            value={intervalValue}
            onChange={(e) => {
              setIntervalValue(e.target.value);
              clear();
            }}
            disabled={disabled}
            required
            /*
             * The FLOOR is expressed in the chosen unit rather than hardcoded:
             * one minute is the API's minimum, so a minute-based value may not
             * go below 1, while an hour-based one already clears it.
             */
            min={intervalUnit === 'seconds' ? 60 : 1}
            step={1}
            className={`${INPUT_CLASS} font-mono tabular-nums`}
          />
          <select
            aria-label={t('tradingSettings.commissionIntervalUnit')}
            value={intervalUnit}
            onChange={(e) => {
              setIntervalUnit(e.target.value as IntervalUnit);
              clear();
            }}
            disabled={disabled}
            className="h-9 shrink-0 rounded-lg border border-input bg-card px-2 text-xs focus-outline disabled:cursor-not-allowed"
          >
            <option value="minutes">{t('tradingSettings.unitMinutes')}</option>
            <option value="hours">{t('tradingSettings.unitHours')}</option>
            <option value="days">{t('tradingSettings.unitDays')}</option>
          </select>
        </div>
        {/*
          ⚠️ THE WARNING IS PART OF THE CONTROL, not decoration.

          This number is also the REVIEW WINDOW: it is how long a commission
          matures before it becomes spendable. At a minute a partner is paid
          before anybody could look at the trade behind it, and a reversal then
          has to claw back a balance they may already have moved. Shown only
          when the chosen value is genuinely short, so it stays meaningful.
        */}
        {parseInterval(intervalValue, intervalUnit, settings.ibCommissionIntervalSeconds) <
          3600 && (
          <span className="mt-1 block text-[11px] leading-relaxed text-warning">
            {t('tradingSettings.commissionIntervalShortWarning')}
          </span>
        )}
      </Field>

      {/*
        ── EVERY OTHER IB CONTROL IS GONE FROM THIS FORM (0104, 0112) ────────

        Four fields went in 0104 and each changed what partners are paid:
        "Maximum paid to partners (%)", the settlement window, "Commission is
        paid from" / "Paying from", and "Partners are paid on". The two payout
        ceilings followed them in 0112.

        Commission is configured on the Commission Levels page. A second screen
        that also decides partner pay is a second place for two answers to
        disagree, with nothing telling an operator which one the money used.

        What is LEFT here passes the test those failed: the ladder ceiling
        BOUNDS how deep that page may reach rather than restating what it pays.
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

/** The units the interval control offers. Seconds only ever arrive from a stored value. */
type IntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const UNIT_SECONDS: Record<IntervalUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/**
 * Seconds → the largest unit that divides them exactly.
 *
 * 3600 reads back as "1 hour", not "60 minutes" — an operator should see the
 * value they typed, and a form that silently rewrites their unit on every load
 * looks like it did not save.
 *
 * Falls back to SECONDS for a value no larger unit divides, which is the only
 * lossless answer: showing "1 minute" for 90 seconds would be a lie the next
 * save would make true.
 */
function splitInterval(seconds: number): { value: number; unit: IntervalUnit } {
  for (const unit of ['days', 'hours', 'minutes'] as const) {
    if (seconds >= UNIT_SECONDS[unit] && seconds % UNIT_SECONDS[unit] === 0) {
      return { value: seconds / UNIT_SECONDS[unit], unit };
    }
  }
  return { value: seconds, unit: 'seconds' };
}

/**
 * The typed number and its unit → seconds, or the stored value.
 *
 * Falling back to what is STORED rather than to the minimum, and the direction
 * is the whole point: the floor would make a typo shorten the review window,
 * which is the change nobody would choose deliberately. The stored value is the
 * only answer that changes nothing.
 *
 * `Number(x) || fallback` is banned here for the reason it is banned on every
 * other numeric control in this app: it is the idiom that turns a typo into a
 * plausible number nobody typed.
 */
function parseInterval(value: string, unit: IntervalUnit, fallback: number): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;

  const parsed = Number.parseInt(trimmed, 10) * UNIT_SECONDS[unit];
  /* The API's floor. Below it the payout job cannot finish before its next
     tick, so the server refuses it and the form should not offer it. */
  if (parsed < 60) return fallback;
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
