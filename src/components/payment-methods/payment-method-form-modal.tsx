'use client';

import * as React from 'react';
import type { Currency, PaymentMethod, PaymentMethodKind } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

export interface PaymentMethodFormValues {
  key: string;
  name: string;
  kind: PaymentMethodKind;
  currency: string;
  logoUrl: string;
  instructions: string;
  payTo: string;
  /** Money — a STRING all the way to the wire. Empty means "no limit". */
  minAmount: string;
  maxAmount: string;
  enabled: boolean;
  sortOrder: number;
}

const KINDS: Array<{
  value: PaymentMethodKind;
  labelKey:
    'paymentMethods.kindManual' | 'paymentMethods.kindGateway' | 'paymentMethods.kindCrypto';
}> = [
  { value: 'manual', labelKey: 'paymentMethods.kindManual' },
  { value: 'gateway', labelKey: 'paymentMethods.kindGateway' },
  { value: 'crypto', labelKey: 'paymentMethods.kindCrypto' },
];

/**
 * Add a deposit method, or edit one.
 *
 * ## The key is fixed once it exists
 *
 * It is the stable machine key stored transactions reference, so changing it
 * would orphan their provider history rather than rename a label. Shown
 * read-only on edit rather than hidden: hiding it leaves the operator guessing
 * which method they are changing, while a disabled field says "this one, and it
 * is fixed". `name` is the field that carries what a client sees.
 *
 * ## Pay-to is the field that decides whether this method exists at all
 *
 * A method with none is never offered to a client, whatever `enabled` says —
 * the backend's `listAvailable` filters on it. That makes the empty case a
 * silent one: the method looks configured, sits in the list marked Enabled, and
 * nobody can deposit through it. The hint under the field states the
 * consequence rather than describing the field.
 */
export function PaymentMethodFormModal({
  open,
  method,
  currencies,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  method?: PaymentMethod;
  currencies: Currency[];
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: PaymentMethodFormValues) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={method ? t('paymentMethods.editTitle') : t('paymentMethods.createTitle')}
    >
      {/*
        KEYED, so opening the modal on a different method REMOUNTS the form and
        its state starts from that method's values. A `useEffect` re-seeding ten
        useStates is what `react-hooks/set-state-in-effect` exists to catch: it
        renders once with the PREVIOUS method's values before correcting itself,
        and one of those values is a pay-to account somebody could read and act
        on. Same pattern as `IbLevelFormModal` and `CurrencyFormModal`.
      */}
      <PaymentMethodForm
        key={`${method?.key ?? 'new'}-${String(open)}`}
        method={method}
        currencies={currencies}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function PaymentMethodForm({
  method,
  currencies,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  method?: PaymentMethod;
  currencies: Currency[];
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: PaymentMethodFormValues) => void;
}) {
  const editing = Boolean(method);

  const [key, setKey] = React.useState(method?.key ?? '');
  const [name, setName] = React.useState(method?.name ?? '');
  const [kind, setKind] = React.useState<PaymentMethodKind>(method?.kind ?? 'manual');
  const [currency, setCurrency] = React.useState(method?.currency ?? 'USD');
  const [logoUrl, setLogoUrl] = React.useState(method?.logoUrl ?? '');
  const [instructions, setInstructions] = React.useState(method?.instructions ?? '');
  const [payTo, setPayTo] = React.useState(method?.payTo ?? '');
  // Money, held as the string the API sent. An empty string is "no limit",
  // which is what null means on the wire — and a `type="number"` input cannot
  // hold a decimal string faithfully, so these are text inputs throughout.
  const [minAmount, setMinAmount] = React.useState(method?.minAmount ?? '');
  const [maxAmount, setMaxAmount] = React.useState(method?.maxAmount ?? '');
  const [enabled, setEnabled] = React.useState(method?.enabled ?? true);
  const [sortOrder, setSortOrder] = React.useState(method?.sortOrder ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      key: key.trim(),
      name: name.trim(),
      kind,
      currency,
      logoUrl: logoUrl.trim(),
      instructions: instructions.trim(),
      payTo: payTo.trim(),
      // Sent as STRINGS, never parsed: these are deposit limits compared
      // against a client's amount, and a round trip through a float is exactly
      // what §6.1 forbids. `Number()` and `parseFloat` are lint errors here.
      minAmount: minAmount.trim(),
      maxAmount: maxAmount.trim(),
      enabled,
      sortOrder,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('paymentMethods.key')}</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            readOnly={editing}
            required
            maxLength={40}
            pattern="[a-z0-9_-]+"
            placeholder="whish"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs read-only:cursor-not-allowed read-only:opacity-60 focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {editing ? t('paymentMethods.keyLocked') : t('paymentMethods.keyHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('paymentMethods.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Whish Money"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.nameHint')}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('paymentMethods.kind')}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentMethodKind)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {t(k.labelKey)}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.kindHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('paymentMethods.currency')}
          </span>
          {/*
            The platform's own currency list, not a hardcoded pair. Currencies
            are operator data — see app/currencies — so a method offered in one
            that was never configured would be a deposit route into a wallet
            that cannot be opened.
          */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('paymentMethods.payTo')}</span>
        <input
          value={payTo}
          onChange={(e) => setPayTo(e.target.value)}
          maxLength={200}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs focus-outline"
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('paymentMethods.payToHint')}
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('paymentMethods.instructions')}
        </span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs focus-outline"
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('paymentMethods.instructionsHint')}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('paymentMethods.minAmount')}
          </span>
          {/*
            `inputMode="decimal"`, never `type="number"`. A number input hands
            back a value the browser has already coerced, and it offers
            spinners on a field holding a decimal string — both are ways for a
            deposit limit to arrive subtly different from what was typed.
          */}
          <input
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            inputMode="decimal"
            pattern="\d*(\.\d{1,8})?"
            placeholder="10.00"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs tabular focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.amountHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('paymentMethods.maxAmount')}
          </span>
          <input
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            inputMode="decimal"
            pattern="\d*(\.\d{1,8})?"
            placeholder="5000.00"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs tabular focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.amountHint')}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('paymentMethods.logoUrl')}
          </span>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            type="url"
            maxLength={500}
            placeholder="https://…"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus-outline"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('paymentMethods.sortOrder')}
          </span>
          {/* An ordinal, not money — a number input is right here. */}
          <input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.valueAsNumber || 0)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs tabular focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.sortOrderHint')}
          </span>
        </label>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 focus-outline"
        />
        <span className="space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('paymentMethods.enabled')}
          </span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('paymentMethods.enabledHint')}
          </span>
        </span>
      </label>

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
          {saving ? t('paymentMethods.saving') : t('paymentMethods.save')}
        </button>
      </div>
    </form>
  );
}
