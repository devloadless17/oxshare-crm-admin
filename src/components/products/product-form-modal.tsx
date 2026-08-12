'use client';

import * as React from 'react';
import type { Product } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface ProductFormValues {
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Add a product, or edit one that exists.
 *
 * One modal for both: the fields are identical, and a separate edit dialog
 * would be the same four inputs under a different heading.
 *
 * The modal stays OPEN on failure and shows the message inline. The API's
 * refusals here are specific — a duplicate name, a value out of range — and
 * closing to show a toast throws away what the operator typed along with the
 * explanation of what was wrong with it.
 */
export function ProductFormModal({
  open,
  product,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  product?: Product;
  saving: boolean;
  error: unknown;
  onSubmit: (values: ProductFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? t('products.editTitle') : t('products.createTitle')}
    >
      {/*
        KEYED, so opening the modal on a different product REMOUNTS the form and
        its state starts from that product's values.

        The obvious alternative — a `useEffect` re-seeding four useStates when
        `open` or `product` changes — is what `react-hooks/set-state-in-effect`
        exists to catch: it renders once with the PREVIOUS product's values
        before correcting itself, and an operator who is quick can save that
        first frame. Same reasoning as the currency form beside it.
      */}
      <ProductForm
        key={product?.id ?? 'new'}
        product={product}
        saving={saving}
        error={error}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function ProductForm({
  product,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  product?: Product;
  saving: boolean;
  error: unknown;
  onSubmit: (values: ProductFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(product?.name ?? '');
  const [description, setDescription] = React.useState(product?.description ?? '');
  const [enabled, setEnabled] = React.useState(product?.enabled ?? true);
  const [sortOrder, setSortOrder] = React.useState(String(product?.sortOrder ?? 0));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      sortOrder: parseOrder(sortOrder),
    });
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="space-y-1.5">
        <span className="block text-xs font-semibold">{t('products.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder="Standard"
          className={INPUT_CLASS}
        />
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-semibold">{t('products.order')}</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          min={0}
          max={1000}
          className={INPUT_CLASS}
        />
        <span className="block text-[11px] text-muted-foreground">{t('products.orderHint')}</span>
      </label>

      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('products.description')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('products.descriptionPlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
      </label>

      {/* `htmlFor` rather than wrapping: the Radix checkbox is a button, and
          the shadcn pairing is an explicit id. See ui/checkbox.tsx. */}
      <div className="flex items-start gap-2.5 sm:col-span-2">
        <Checkbox
          id="product-enabled"
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          className="mt-0.5"
        />
        <label htmlFor="product-enabled" className="cursor-pointer space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('products.enabled')}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {t('products.enabledHint')}
          </span>
        </label>
      </div>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive sm:col-span-2">
          {apiErrorMessage(error, t('products.saveFailed'))}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-outline"
        >
          {t('products.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="h-9 cursor-pointer rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving ? t('products.saving') : t('products.save')}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

/**
 * A sort order, as an integer the API will take.
 *
 * `Number(x) || 0` would do here and is deliberately not used: it is the idiom
 * that turns a typo into a silent 0 on the forms that configure money, and a
 * codebase where it appears on the harmless fields is one where it appears on
 * the others too.
 */
function parseOrder(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
