'use client';

import * as React from 'react';
import type { Currency } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';
import { LimitInput, plainAmount } from './limit-input';

/** The five money limits, in the currency's own units (0162). Decimal strings. */
export interface CurrencyLimitValues {
  minDeposit: string;
  maxDeposit: string;
  minWithdrawal: string;
  maxWithdrawal: string;
  maxWithdrawalDaily: string;
}

export interface CurrencyFormValues extends CurrencyLimitValues {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  enabled: boolean;
  isDefault: boolean;
}

const LIMIT_KEYS = [
  'minDeposit',
  'maxDeposit',
  'minWithdrawal',
  'maxWithdrawal',
  'maxWithdrawalDaily',
] as const satisfies readonly (keyof CurrencyLimitValues)[];

/**
 * Add a currency, or edit one that exists.
 *
 * ## The code is not editable once it exists
 *
 * It is the primary key, and `wallets`, `transactions`, `transfers` and
 * `commission_accruals` all reference it. Renaming it is a data migration
 * across four money tables, not an edit — so on edit the field is shown
 * read-only rather than hidden. Hiding it would leave the operator wondering
 * whether they are editing the right row; showing it disabled says "this is
 * fixed" in the one place they would look.
 *
 * ## `decimals` is display precision, and the form says so
 *
 * Storage is NUMERIC(28,8) for every currency regardless. Someone setting this
 * to 2 for USD is choosing how balances are FORMATTED, not truncating what the
 * ledger holds — and a form that did not say that invites the reading where
 * lowering it destroys money.
 *
 * ## The limits are this currency's, in its own units (0162)
 *
 * Six amounts: what a client may deposit, withdraw (once and per day), and what
 * an operator may credit in one action. They were one set of numbers for every
 * currency, so an LBP withdrawal stopped at 50,000 — about fifty cents. They are
 * REQUIRED on a new currency: a default would be another currency's numbers.
 */
export function CurrencyFormModal({
  open,
  currency,
  saving,
  error,
  fieldErrors = {},
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  currency?: Currency;
  saving: boolean;
  error?: string;
  /** The API's per-field sentences, shown under the box each one is about. */
  fieldErrors?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: CurrencyFormValues) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={currency ? t('currencies.editTitle') : t('currencies.createTitle')}
    >
      {/*
       * KEYED, so opening the modal on a different currency REMOUNTS the form
       * and its state starts from that currency's values.
       *
       * The obvious alternative — a `useEffect` re-seeding seven useStates when
       * `open` or `currency` changes — is exactly what
       * `react-hooks/set-state-in-effect` exists to catch: it renders once with
       * the PREVIOUS currency's values before correcting itself, which on a
       * slow machine is long enough to type into and submit. A remount has no
       * intermediate state to be wrong in. Same pattern, and same reasoning, as
       * `TagFormModal`.
       */}
      <CurrencyForm
        key={`${currency?.code ?? 'new'}-${String(open)}`}
        currency={currency}
        saving={saving}
        error={error}
        fieldErrors={fieldErrors}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function CurrencyForm({
  currency,
  saving,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  currency?: Currency;
  saving: boolean;
  error?: string;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: CurrencyFormValues) => void;
}) {
  const editing = Boolean(currency);

  const [code, setCode] = React.useState(currency?.code ?? '');
  const [name, setName] = React.useState(currency?.name ?? '');
  const [symbol, setSymbol] = React.useState(currency?.symbol ?? '');
  const [decimals, setDecimals] = React.useState(currency?.decimals ?? 2);
  const [enabled, setEnabled] = React.useState(currency?.enabled ?? true);
  const [isDefault, setIsDefault] = React.useState(currency?.isDefault ?? false);
  // Empty on a new currency — REQUIRED, never pre-filled with another's numbers.
  const [limits, setLimits] = React.useState<CurrencyLimitValues>(() => ({
    minDeposit: plainAmount(currency?.minDeposit),
    maxDeposit: plainAmount(currency?.maxDeposit),
    minWithdrawal: plainAmount(currency?.minWithdrawal),
    maxWithdrawal: plainAmount(currency?.maxWithdrawal),
    maxWithdrawalDaily: plainAmount(currency?.maxWithdrawalDaily),
  }));
  const setLimit = (key: keyof CurrencyLimitValues) => (value: string) =>
    setLimits((current) => ({ ...current, [key]: value }));
  // The read-back under each box names the currency being typed.
  const unit = code.trim().toUpperCase() || '—';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      // Upper-cased here as well as in the API. The server is the authority —
      // this is so the operator sees what they are about to create.
      code: code.trim().toUpperCase(),
      name: name.trim(),
      symbol: symbol.trim(),
      decimals,
      enabled,
      isDefault,
      ...(Object.fromEntries(
        LIMIT_KEYS.map((key) => [key, limits[key].trim()]),
      ) as unknown as CurrencyLimitValues),
    });
  };

  const limitField = (key: keyof CurrencyLimitValues, placeholder: string, hint?: string) => (
    <LimitInput
      id={`currency-${key}`}
      label={t(`currencies.limit.${key}`)}
      value={limits[key]}
      onChange={setLimit(key)}
      currency={unit}
      error={fieldErrors[key]}
      hint={hint}
      placeholder={placeholder}
      required
    />
  );

  /*
   * The banner repeats nothing a box already says: when every sentence the API
   * sent has a box of its own, the boxes carry them. Anything else — a field
   * this form does not draw, or no field at all — still shows up here.
   */
  const fieldKeys = Object.keys(fieldErrors);
  const allInline =
    fieldKeys.length > 0 &&
    fieldKeys.every((key) => (LIMIT_KEYS as readonly string[]).includes(key));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && !allInline && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('currencies.code')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            readOnly={editing}
            required
            maxLength={10}
            pattern="[A-Za-z0-9]{2,10}"
            placeholder="EUR"
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-xs read-only:cursor-not-allowed read-only:opacity-60 focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {editing ? t('currencies.codeLocked') : t('currencies.codeHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('currencies.symbol')}</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            maxLength={8}
            placeholder="€"
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('currencies.name')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          placeholder="Euro"
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('currencies.decimals')}</span>
        <input
          type="number"
          min={0}
          max={8}
          value={decimals}
          onChange={(e) => setDecimals(Number(e.target.value))}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('currencies.decimalsHint')}
        </span>
      </label>

      {/*
        THE LIMITS, grouped by what they bound. In this currency's own units:
        for LBP that is millions, for USD tens — the reason they live here.
      */}
      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-foreground">
          {t('currencies.limitsTitle')}
        </legend>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('currencies.limitsHint')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {limitField('minDeposit', '10')}
          {limitField('maxDeposit', '250000')}
          {limitField('minWithdrawal', '10')}
          {limitField('maxWithdrawal', '50000')}
          {limitField('maxWithdrawalDaily', '100000', t('currencies.limitDailyHint'))}
        </div>
      </fieldset>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        {/* `htmlFor` rather than wrapping: the Radix checkbox is a button, and
            the shadcn pairing is an explicit id. See ui/checkbox.tsx. */}
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="currency-enabled"
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            className="mt-0.5"
          />
          <label htmlFor="currency-enabled" className="cursor-pointer space-y-0.5">
            <span className="block text-xs font-semibold text-foreground">
              {t('currencies.enabled')}
            </span>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              {t('currencies.enabledHint')}
            </span>
          </label>
        </div>

        <div className="flex items-start gap-2.5">
          <Checkbox
            id="currency-is-default"
            checked={isDefault}
            onCheckedChange={(value) => setIsDefault(value === true)}
            className="mt-0.5"
          />
          <label htmlFor="currency-is-default" className="cursor-pointer space-y-0.5">
            <span className="block text-xs font-semibold text-foreground">
              {t('currencies.isDefault')}
            </span>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              {t('currencies.isDefaultHint')}
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('currencies.saving') : t('currencies.save')}
        </button>
      </div>
    </form>
  );
}
