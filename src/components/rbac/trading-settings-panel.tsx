'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LineChart } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type RevenueBasis, type TradingSettings } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { toastSuccess } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
  const [holdHours, setHoldHours] = React.useState(String(settings.ibCommissionHoldHours));
  /*
   * WHAT a partner is paid on — FR-IB-16. A closed set, so a <select>: the
   * other controls on this form are values an operator chooses freely, and
   * this one is a choice between three implementations. A text box here would
   * make a typo look like a decision.
   */
  const [revenueBasis, setRevenueBasis] = React.useState<RevenueBasis>(settings.ibRevenueBasis);
  /*
   * The BACKLOG DECISION, held as two pieces of state rather than one string.
   *
   * The stored value carries three meanings — `null` (undecided), `'all'`, and
   * an ISO instant — and only the third has a date in it. A single text box
   * would ask an operator to type one of three things correctly, with the
   * irreversible option one typo away. A mode plus a date makes each meaning a
   * separate act.
   */
  const [accrualMode, setAccrualMode] = React.useState<AccrualMode>(() =>
    accrualModeOf(settings.ibAccrualStart),
  );
  const [accrualDate, setAccrualDate] = React.useState(() =>
    accrualDateOf(settings.ibAccrualStart),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateTradingSettings({
        maxLiveAccounts: parseCount(maxLiveAccounts),
        maxDemoAccounts: parseCount(maxDemoAccounts),
        maxDemoDeposit: maxDemoDeposit.trim(),
        ibMaxRevenueSharePct: ibCap.trim(),
        ibCommissionHoldHours: parseHours(holdHours, settings.ibCommissionHoldHours),
        ibRevenueBasis: revenueBasis,
        /*
         * Always sent, never omitted. The API reads `undefined` as "the caller
         * did not touch this" and keeps what is stored — right for a console
         * that predates the field, wrong for this one, which is now the place
         * the decision is made.
         */
        ibAccrualStart: accrualStartValue(accrualMode, accrualDate),
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
    ibCap.trim() !== trimAmount(settings.ibMaxRevenueSharePct) ||
    holdHours.trim() !== String(settings.ibCommissionHoldHours) ||
    revenueBasis !== settings.ibRevenueBasis ||
    accrualStartValue(accrualMode, accrualDate) !== settings.ibAccrualStart ||
    /*
     * The MODE counts as a change even when the value it produces does not.
     *
     * Picking "from a date" and not yet choosing one resolves to `null`, which
     * equals the stored value when nothing was decided — so without this the
     * Save button stayed greyed out on a form the operator had visibly
     * changed, with nothing saying why and no way to reach the message that
     * explains the date is missing. A disabled control that looks like a bug
     * is worse than an enabled one that refuses and says what it needs.
     */
    accrualMode !== accrualModeOf(settings.ibAccrualStart);

  const disabled = !canManage || mutation.isPending;
  const clear = () => setError(null);

  /**
   * Everything that must happen between pressing Save and the request leaving.
   *
   * Only the backlog decision gets a gate, and only when it CHANGES. The other
   * fields on this form are terms an operator adjusts and re-adjusts; this one
   * decides which trades are paid for, marks the rest decided for ever, and is
   * not undone by setting the field back. A confirmation on every save would
   * train people to click through it, so it fires exactly when it means
   * something.
   */
  const submit = async () => {
    const next = accrualStartValue(accrualMode, accrualDate);

    // "From a date" with no date is not a decision, and the API would refuse
    // it with a pattern message that names a regex rather than the field.
    if (accrualMode === 'from' && next === null) {
      setError(t('tradingSettings.accrualStartDateMissing'));
      return;
    }

    if (next !== settings.ibAccrualStart && next !== null) {
      const ok = await confirm(
        next === 'all'
          ? {
              title: t('tradingSettings.confirmAccrualTitle'),
              description: t('tradingSettings.confirmAccrualAllBody'),
              confirmLabel: t('tradingSettings.confirmAccrualAction'),
              destructive: true,
            }
          : {
              title: t('tradingSettings.confirmAccrualFromTitle', { date: accrualDate }),
              description: t('tradingSettings.confirmAccrualFromBody'),
              confirmLabel: t('tradingSettings.confirmAccrualAction'),
              destructive: true,
            },
      );
      if (!ok) return;
    }

    mutation.mutate();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
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

      <Field
        id="trading-hold-hours"
        label={t('tradingSettings.holdHours')}
        hint={t('tradingSettings.holdHoursHint')}
      >
        {/*
          A whole number of hours, so `type="number"` is right here where it is
          wrong on the two money fields above: nothing about this value reaches
          a decimal calculation, and the spinner is genuinely useful on a value
          most brokers set once.

          `max` is a year — not a policy limit, a typo guard. A mistyped 24000
          would hold every partner's commission for three years while every
          component reported success, which looks exactly like the engine having
          stopped. The same bound is a CHECK on the column.
        */}
        <input
          id="trading-hold-hours"
          type="number"
          inputMode="numeric"
          value={holdHours}
          onChange={(e) => {
            setHoldHours(e.target.value);
            clear();
          }}
          disabled={disabled}
          required
          min={0}
          max={8760}
          className={`${INPUT_CLASS} font-mono tabular-nums`}
        />
      </Field>

      {/*
        WHAT a partner is paid on — FR-IB-16, and the only control on this form
        that changes the SIZE of every future accrual rather than its timing.

        Placed directly under the settlement window because the two are read
        together: that one decides when a commission becomes spendable, this one
        decides what it was a share of. Both were constants in the API's source
        until they became settings, for the same reason — the people who make a
        commercial decision should be able to see it and make it, and the change
        should record who made it.
      */}
      <Field
        id="trading-revenue-basis"
        label={t('tradingSettings.revenueBasis')}
        hint={t('tradingSettings.revenueBasisHint')}
      >
        <select
          id="trading-revenue-basis"
          value={revenueBasis}
          onChange={(e) => {
            setRevenueBasis(e.target.value as RevenueBasis);
            clear();
          }}
          disabled={disabled}
          className={INPUT_CLASS}
        >
          {REVENUE_BASES.map((basis) => (
            <option key={basis} value={basis}>
              {t(`tradingSettings.revenueBasis.${basis}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>

        {/*
          Shown only when the choice would actually read the markups, because a
          warning that is always on screen is one nobody reads. The ORDER is the
          whole content: a product left at 0 earns nothing, and a trade that
          earns nothing is closed permanently — so this cannot be undone by
          changing the field back, which is exactly what somebody would try.
        */}
        {revenueBasis !== 'commission_swap' && (
          <p role="status" className="text-[11px] font-medium text-warning">
            {t('tradingSettings.revenueBasisWarning')}
          </p>
        )}
      </Field>

      {/*
        The BACKLOG DECISION — which trades the engine will pay for at all.

        Beneath the basis because the three read as one paragraph: how long a
        commission is held, what it is a share of, and which trades earn one.
        Until now this field had an API, a column and an audit trail, and no
        control anywhere — so the only way to make the platform's single most
        irreversible decision was to write to the database by hand.
      */}
      <Field
        id="trading-accrual-mode"
        label={t('tradingSettings.accrualStart')}
        hint={t('tradingSettings.accrualStartHint')}
      >
        <select
          id="trading-accrual-mode"
          value={accrualMode}
          onChange={(e) => {
            setAccrualMode(e.target.value as AccrualMode);
            clear();
          }}
          disabled={disabled}
          className={INPUT_CLASS}
        >
          {ACCRUAL_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`tradingSettings.accrualStart.${mode}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>

        {accrualMode === 'from' && (
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor="trading-accrual-date"
              className="block text-[11px] font-semibold text-foreground"
            >
              {t('tradingSettings.accrualStartDate')}
            </label>
            {/*
              A date, not a datetime. An operator deciding "pay from the first
              of the month" is not choosing a minute, and offering one invites a
              precision the decision does not have. `accrualStartValue` widens
              it to local midnight, which is the instant they mean.

              `max` is today: paying from a FUTURE date would mark every trade
              between now and then decided-and-unpaid as it arrives, which is a
              way to lose commission that looks like scheduling.
            */}
            <input
              id="trading-accrual-date"
              type="date"
              value={accrualDate}
              max={todayIso()}
              onChange={(e) => {
                setAccrualDate(e.target.value);
                clear();
              }}
              disabled={disabled}
              className={`${INPUT_CLASS} font-mono tabular-nums`}
            />
          </div>
        )}

        {/*
          Two notes, and only ever one of them. Undecided is a STATE worth
          explaining — it looks exactly like "no trades yet" from outside, and
          it does not resolve itself. Anything else is a decision worth warning
          about before it is made, not after.
        */}
        {accrualMode === 'unset' ? (
          <p role="status" className="text-[11px] text-muted-foreground">
            {t('tradingSettings.accrualStartUnsetNote')}
          </p>
        ) : (
          <p role="status" className="text-[11px] font-medium text-warning">
            {t('tradingSettings.accrualStartWarning')}
          </p>
        )}
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
 * The settlement window, falling back to the SAVED value and never to zero.
 *
 * `parseCount` above answers 0 for anything unparseable, which is right for an
 * account cap — 0 means "no new ones" and is a state somebody may want. It is
 * wrong here: 0 hours means every commission becomes spendable the instant it
 * is calculated, so a half-deleted box submitted by an Enter key would turn the
 * one rule between earned and spendable off, and the save would look like a
 * success. Falling back to what is already stored makes the worst case "nothing
 * changed".
 */
export function parseHours(value: string, fallback: number): number {
  const trimmed = value.trim();
  /*
   * WHOLLY numeric, not `parseInt` alone. `parseInt('12.5h')` is 12 and
   * `parseInt('24 hours')` is 24 — it reads a prefix and discards the rest, so
   * a typed unit or a stray character would be saved as a window nobody chose
   * while the form reported success.
   */
  if (!/^\d+$/.test(trimmed)) return fallback;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed > 8760) return fallback;
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

/**
 * The order the options are OFFERED in, which is not arbitrary.
 *
 * The default first, so the list opens on what the platform is already doing;
 * then the two that re-price the book. Declared here rather than derived from
 * the generated union because a union has no order, and an operator scanning
 * three similar phrases should meet the safe one first.
 */
const REVENUE_BASES = ['commission_swap', 'spread', 'commission_swap_spread'] as const;

/**
 * The three shapes `ib_accrual_start` can hold, as a mode a person picks.
 *
 * `unset` FIRST, deliberately: it is the state a platform that has not decided
 * is already in, so the list opens on the truth rather than on an option.
 */
export const ACCRUAL_MODES = ['unset', 'all', 'from'] as const;
export type AccrualMode = (typeof ACCRUAL_MODES)[number];

/** Which mode a stored value represents. */
export function accrualModeOf(stored: string | null | undefined): AccrualMode {
  if (stored === 'all') return 'all';
  return stored ? 'from' : 'unset';
}

/**
 * The date part of a stored instant, for the date box.
 *
 * **Never `toISOString().split('T')[0]`.** That converts to UTC first, so a
 * value saved as local midnight in an eastern zone reads back as the previous
 * day — the operator opens the form and finds a decision they did not make,
 * one day earlier than the one they did. The stored string is already ISO, so
 * the date part is the first ten characters of it and no arithmetic is
 * involved at all.
 */
export function accrualDateOf(stored: string | null | undefined): string {
  if (!stored || stored === 'all') return '';
  return stored.slice(0, 10);
}

/** Today, from LOCAL getters — same reason `accrualDateOf` avoids UTC. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What the mode and the date mean as a value the API accepts.
 *
 * `null` for undecided, `'all'`, or an ISO instant — the three the DTO
 * validates, and nothing else.
 *
 * ## The date becomes LOCAL midnight, not UTC midnight
 *
 * An operator choosing "1 August" means their own first of August. Sending
 * `2026-08-01T00:00:00Z` would mean UTC midnight, which is the evening of 31
 * July in the Americas and mid-morning of the 1st in Asia — so trades either
 * side of the boundary would be decided against a day nobody picked. Parsing
 * without a `Z` gives local midnight, and `toISOString` then states that same
 * instant in the form the API asks for.
 *
 * An unparseable date returns `null` rather than an invalid string: the caller
 * checks for it and says which field is missing, which is a better answer than
 * the API's pattern message naming a regex.
 */
export function accrualStartValue(mode: AccrualMode, date: string): string | null {
  if (mode === 'unset') return null;
  if (mode === 'all') return 'all';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const at = new Date(`${date}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
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
