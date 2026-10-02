'use client';

import * as React from 'react';
import { Spinner } from '@/components/ui/loader';

import type { Agency, Product } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface AgencyFormValues {
  name: string;
  description: string | null;
  enabled: boolean;
  /** The complete set the operator wants. The caller diffs it against the row. */
  productIds: string[];
}

/**
 * Add an agency (وكالة), or edit one that exists — including what it sells.
 *
 * ## Why the products are in this form and not a separate dialog
 *
 * Same reasoning as the product form beside it: an agency selling nothing is an
 * agency whose partners have clients who can open no account at all, so
 * creating one and being sent back to a table with a warning is the workflow
 * telling somebody off for following it. The whole agency is described once.
 *
 * ## The DESCRIPTION is the field most likely to be left blank
 *
 * Applicants on the portal read it to decide which programme to request. A list
 * of bare names gives them nothing to choose on, so the hint says who reads it
 * rather than what it is.
 *
 * ## Everything is staged, then applied on save
 *
 * Ticking a product does not fire a request, even when editing an agency that
 * exists — one mental model for the form, and the only one that can work while
 * creating, since there is no agency to attach a product to until the first
 * request returns.
 */
export function AgencyFormModal({
  open,
  agency,
  products,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  agency?: Agency;
  products: Product[];
  saving: boolean;
  error: unknown;
  onSubmit: (values: AgencyFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      busy={saving}
      open={open}
      onClose={onClose}
      size="lg"
      title={agency ? t('agencies.editTitle') : t('agencies.createTitle')}
    >
      {/* Keyed, so opening on a different agency remounts the form with that
          agency's values — see the note in product-form-modal.tsx. */}
      <AgencyForm
        key={agency?.id ?? 'new'}
        agency={agency}
        products={products}
        saving={saving}
        error={error}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function AgencyForm({
  agency,
  products,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  agency?: Agency;
  products: Product[];
  saving: boolean;
  error: unknown;
  onSubmit: (values: AgencyFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(agency?.name ?? '');
  const [description, setDescription] = React.useState(agency?.description ?? '');
  /*
   * NOT a field, and never reset by this form.
   *
   * A new agency is ACTIVE — nobody creates a programme they do not intend to
   * open — and closing one is a decision made from the table, where the row action
   * says which way it is going. An editing form carries the stored value
   * through untouched, so opening an inactive agency to fix a typo cannot
   * silently reopen it to applications.
   */
  const enabled = agency?.enabled ?? true;
  const [productIds, setProductIds] = React.useState<string[]>(agency?.productIds ?? []);

  const toggleProduct = (id: string) =>
    setProductIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      productIds,
    });
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('agencies.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder="Gold Agency"
          className={INPUT_CLASS}
        />
      </label>

      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('agencies.description')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('agencies.descriptionPlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('agencies.descriptionHint')}
        </span>
      </label>

      {/* ── What it sells ──────────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-border pt-4 sm:col-span-2">
        <div className="space-y-0.5">
          <span className="block text-xs font-semibold">{t('agencies.products')}</span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('agencies.productsExplainer')}
          </span>
        </div>

        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            {t('agencies.noProductsExist')}
          </p>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={product.id} className="flex items-start gap-2.5">
                <Checkbox
                  id={`agency-product-${product.id}`}
                  checked={productIds.includes(product.id)}
                  onCheckedChange={() => toggleProduct(product.id)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`agency-product-${product.id}`}
                  className="cursor-pointer space-y-0.5"
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                    {product.name}
                    {/*
                      Two warnings that are cheaper here than in a support
                      ticket. An INACTIVE product can be ticked and is not
                      offered; one with NO MT5 GROUP can be ticked and cannot be
                      opened by anybody. Both are legal, and neither is visible
                      from this screen otherwise.
                    */}
                    {!product.enabled && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {t('products.disabled')}
                      </span>
                    )}
                    {product.groups.length === 0 && (
                      <span className="text-[10px] font-normal text-warning">
                        {t('agencies.productNoGroups')}
                      </span>
                    )}
                  </span>
                  {product.description && (
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {product.description}
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}

        {productIds.length === 0 && products.length > 0 && (
          <p className="text-[11px] leading-relaxed text-warning">{t('agencies.sellsNothing')}</p>
        )}
      </div>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive sm:col-span-2">
          {apiErrorMessage(error, t('agencies.saveFailed'))}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3 sm:col-span-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-outline"
        >
          {t('agencies.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving && <Spinner />}
          {saving ? t('agencies.saving') : t('agencies.save')}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
