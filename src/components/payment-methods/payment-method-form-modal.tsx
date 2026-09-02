'use client';

import * as React from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import api from '@/lib/api';
import type { Currency, PaymentMethod } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { assetUrl } from '@/lib/asset-url';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export interface PaymentMethodFormValues {
  key: string;
  name: string;
  currency: string;
  logoUrl: string;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Add a deposit method, or edit one.
 *
 * ## Four fields, and only one of them is a decision
 *
 * Key, name, currency, logo. Everything else this form once asked for has been
 * removed as the columns behind it went: pay-to and instructions and the
 * per-method bounds in migration 0042, and `kind` in 0043.
 *
 * The one thing an operator actually decides about a live method — whether
 * clients are offered it — is deliberately NOT here. It is a row action on the
 * table, because turning a method off when a provider goes down needs one click
 * rather than open-dialog → uncheck → save.
 *
 * ## The key is fixed once it exists
 *
 * It is the stable machine key stored transactions reference, so changing it
 * would orphan their provider history rather than rename a label. Shown
 * read-only on edit rather than hidden: hiding it leaves the operator guessing
 * which method they are changing, while a disabled field says "this one, and it
 * is fixed". `name` is the field that carries what a client sees.
 *
 * ## The key also decides the deposit FLOW, and nobody is asked about it
 *
 * A key the backend has a gateway implementation for redirects the client to a
 * hosted payment page; anything else files a declaration an operator confirms.
 * That used to be a `kind` dropdown on this form, which asked an operator to
 * restate something the code already knew — and a wrong answer sent clients down
 * the wrong path entirely.
 */
export function PaymentMethodFormModal({
  open,
  method,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  method?: PaymentMethod;
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
  saving,
  error,
  onClose,
  onSubmit,
}: {
  method?: PaymentMethod;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: PaymentMethodFormValues) => void;
}) {
  const editing = Boolean(method);

  const [key, setKey] = React.useState(method?.key ?? '');
  const [name, setName] = React.useState(method?.name ?? '');
  const [currency, setCurrency] = React.useState(method?.currency ?? '');
  const [logoUrl, setLogoUrl] = React.useState(method?.logoUrl ?? '');
  // A new method starts enabled; changing it is the row action, not this form.
  const enabled = method?.enabled ?? true;

  /*
   * `sortOrder` is not asked for, but IS sent, carrying whatever the method
   * already held.
   *
   * It is the presentation order the client's deposit screen is sorted by —
   * real, but not a decision worth a field. Dropping it from the payload would
   * blank an existing method's value on the next edit, which is a destructive
   * side effect of opening a dialog and pressing Save.
   */
  const sortOrder = method?.sortOrder ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      key: key.trim(),
      name: name.trim(),
      currency,
      logoUrl: logoUrl.trim(),
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
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-xs read-only:cursor-not-allowed read-only:opacity-60 focus-outline"
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
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline"
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('paymentMethods.nameHint')}
          </span>
        </label>
      </div>

      <CurrencyField value={currency} onChange={setCurrency} />

      <LogoField value={logoUrl} onChange={setLogoUrl} />

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
          /*
           * `!currency` is what replaces the native `required` the currency
           * `<select>` used to carry. Radix's Select is a button, not a form
           * control, so the browser has nothing left to validate — without this
           * the form would submit an empty currency, which is the silent 'USD'
           * bug reversed rather than fixed. See `CurrencyField` below.
           */
          disabled={saving || !currency}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {saving ? t('paymentMethods.saving') : t('paymentMethods.save')}
        </button>
      </div>
    </form>
  );
}

/**
 * What the method settles in — a choice, not a default.
 *
 * ## Why this is a field at all now
 *
 * It was not one. The form carried `method?.currency ?? 'USD'` in a constant and
 * sent it silently, on the reasoning that currency was not a decision an
 * operator had been asked to make. That was true right up until somebody added a
 * crypto method: it was created as USD, and a deposit through it would land in a
 * USD wallet holding money the operator never agreed to receive in that
 * denomination. The method decides the deposit's currency — nothing downstream
 * converts, because there is no FX source in this system.
 *
 * ## The list is the platform's OWN currencies
 *
 * Not a hardcoded pair. `currency` is a foreign key into `currencies`, so a code
 * that is not in that table is refused by the API — and a free-text field would
 * turn that into a 400 an operator has to decode. Disabled currencies are
 * filtered out: `create` refuses those too, for the same reason a method cannot
 * be denominated in something the platform does not hold.
 *
 * ## It is editable on an EXISTING method, deliberately
 *
 * Changing it does not touch a single historical deposit — those carry their own
 * `currency` on the transaction row. It changes where the NEXT one lands, which
 * is a correction an operator must be able to make without a developer.
 */
function CurrencyField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const currencies = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );

  const usable = (currencies.data ?? []).filter((c) => c.enabled);

  return (
    <label className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{t('paymentMethods.currency')}</span>
      {/*
        The placeholder is the ABSENCE of a value, not an option carrying `''`.

        The native version needed an empty `<option>` plus `required` so a
        create could not submit whatever happened to be first in the list —
        the silent `'USD'` this exists to stop. Radix gets there differently
        and more directly: an unset value renders `SelectValue`'s placeholder
        and there is no selectable item behind it, so "nothing chosen" is not a
        state the operator can land on by accident.

        `required` goes with it, because there is no form control for the
        browser to validate any more. The submit button is gated on `currency`
        being non-empty instead — see the form above.
      */}
      <Select
        value={value === '' ? undefined : value}
        onValueChange={onChange}
        disabled={usable.length === 0}
      >
        <SelectTrigger className="h-10 w-full text-xs">
          <SelectValue placeholder={t('paymentMethods.currencyPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {usable.map((currency) => (
            <SelectItem key={currency.code} value={currency.code} className="text-xs">
              {currency.code} — {currency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="block text-[11px] text-muted-foreground">
        {/*
          The list failing to load is stated rather than shown as an empty
          dropdown. An operator staring at a select with nothing in it has no way
          to tell "still loading" from "this platform has no currencies".
        */}
        {currencies.status === 'error'
          ? t('paymentMethods.currencyLoadFailed')
          : t('paymentMethods.currencyHint')}
      </span>
    </label>
  );
}

/**
 * The logo, uploaded rather than linked.
 *
 * ## Why this replaced a URL field
 *
 * The form used to take a URL, which meant every client's deposit screen loaded
 * an image from a host the operator had pasted in. That third party can change
 * the image, log every client who views it, or simply go away and leave a broken
 * mark on the payment screen. Hosting the file ourselves removes all three, and
 * costs the operator one fewer step than finding a URL did.
 *
 * ## The upload happens NOW; the save happens later
 *
 * Choosing a file uploads it immediately and puts the returned URL in form
 * state — but the METHOD is not touched until Save. So an operator who uploads
 * and then cancels has left an orphaned file on disk and changed nothing a
 * client can see, which is the right way round: the alternative would edit the
 * live deposit screen before the form was submitted.
 */
function LogoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { logoUrl } = await api.admin.uploadPaymentMethodLogo(file);
      onChange(logoUrl);
    } catch (err) {
      // The API's own refusal — it names the real reason ("that file is not a
      // PNG, JPEG or WebP"), which a generic message would replace with
      // something the operator cannot act on.
      setError(apiErrorMessage(err, t('paymentMethods.logoUploadFailed')));
    } finally {
      setBusy(false);
      // Cleared so choosing the SAME file again still fires `change`. Without
      // this, re-picking a file after a failed upload does nothing at all.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{t('paymentMethods.logo')}</span>

      <div className="flex items-center gap-3">
        {/* The preview IS the confirmation that the upload worked — a filename
            would not tell an operator whether they picked the right image. */}
        {/*
          Fixed height, flexible width — a wordmark squeezed into a square
          preview renders as a sliver and reads as a failed upload. Same reason
          as the table's logo cell. Floored at 48px so the empty-state icon stays
          square.
        */}
        <span className="flex h-12 min-w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 px-2">
          {/*
            `assetUrl`, not the raw value — the API returns `/v1/uploads/…`,
            which this app's origin does not serve. A raw src made the preview
            break the instant an upload succeeded, which reads as a rejected file
            rather than a mis-resolved path.
          */}
          {assetUrl(value) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(value)}
              alt=""
              aria-hidden="true"
              className="h-10 w-auto max-w-32 object-contain"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </span>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="focus-outline inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {busy
              ? t('paymentMethods.logoUploading')
              : value
                ? t('paymentMethods.logoReplace')
                : t('paymentMethods.logoUpload')}
          </button>

          {value && !busy && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="focus-outline inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              {t('paymentMethods.logoRemove')}
            </button>
          )}
        </div>

        {/*
          The real input, hidden but PRESENT — not `display:none`, which some
          browsers refuse to open a picker for. `accept` is a convenience for the
          file dialog only: the server decides the type from the file's own magic
          bytes, because an `accept` attribute is trivially bypassed.

          SVG IS INCLUDED, and it was the list here that was wrong rather than
          the policy. `PAYMENT_LOGO_BUCKET` has always accepted `image/svg+xml`
          and `payment-methods-http.spec.ts` asserts it — but this attribute
          omitted it, so the file dialog greyed out every brand mark an operator
          actually had. They arrive as SVG, and rasterising one for a 20px table
          row throws away the reason it was vector.

          What makes accepting it safe is not this attribute. It is the server
          refusing anything whose BYTES are not really an image (an HTML document
          declared `image/svg+xml` is how a stored file becomes stored XSS), plus
          `GET /v1/uploads/payment-logos/:file` serving with `nosniff` and
          `default-src 'none'; sandbox` so a stored SVG cannot execute even if
          one got past. Those two are a pair and both already exist.
        */}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      <span className="block text-[11px] text-muted-foreground">
        {t('paymentMethods.logoHint')}
      </span>

      {error && (
        <p role="alert" className="text-[11px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
