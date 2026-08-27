'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { adminApi, type AvailableGroup, type Product, type ProductGroup } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/** A group the form is holding, whether or not the server has it yet. */
export interface StagedGroup {
  /** The row id, absent while the group is only staged in this form. */
  id?: string;
  environment: 'live' | 'demo';
  mt5Group: string;
  currency: string;
}

export interface ProductFormValues {
  name: string;
  description: string | null;
  enabled: boolean;
  /** Chosen at creation, immutable after — the API refuses a change. */
  type: 'real' | 'demo';
  /**
   * A decimal STRING, and it stays one all the way to the column.
   *
   * `NUMERIC(28,8)` on the backend. A JSON number would round-trip through a
   * float somewhere between this input and the database, and a markup of `1.5`
   * that arrives as `1.4999999999` is the kind of wrong that survives review
   * because it looks almost right. Same rule as the commission rates.
   */
  spreadMarkupPerLot: string;
  sortOrder: number;
  /** The complete set the operator wants. The caller diffs it against the row. */
  groups: StagedGroup[];
}

/**
 * Add a product, or edit one that exists — including the MT5 groups behind it.
 *
 * ## Why the groups are in this form and not a separate dialog
 *
 * They were a second modal, reached from the row menu, and that split the one
 * decision an operator is actually making. A product without a group cannot be
 * opened by anybody, so creating one and then being returned to a table with a
 * warning-coloured `0` is the workflow telling somebody off for following it.
 * Here the whole product is described in one place and saved once.
 *
 * ## Everything is staged, then applied on save
 *
 * Group changes do NOT fire as they are ticked, even when editing a product
 * that exists. One mental model for the form — nothing happens until Save —
 * beats a dialog where two of the fields are live and the rest are not, and it
 * is the only model that can work while CREATING, since there is no product to
 * attach a group to until the first request returns.
 *
 * The caller applies the diff; see `ProductsPage`. Attaching is several
 * requests and can fail halfway, which is why it reports what landed rather
 * than pretending the save was atomic.
 */
export function ProductFormModal({
  open,
  product,
  demoTaken,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  product?: Product;
  /** Another product is already the demo one — at most one may exist. */
  demoTaken: boolean;
  saving: boolean;
  error: unknown;
  onSubmit: (values: ProductFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? t('products.editTitle') : t('products.createTitle')}
    >
      {/*
        KEYED, so opening the modal on a different product REMOUNTS the form and
        its state starts from that product's values.

        The obvious alternative — a `useEffect` re-seeding the state when `open`
        or `product` changes — is what `react-hooks/set-state-in-effect` exists
        to catch: it renders once with the PREVIOUS product's values before
        correcting itself, and an operator who is quick can save that frame.
      */}
      <ProductForm
        key={product?.id ?? 'new'}
        product={product}
        demoTaken={demoTaken}
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
  demoTaken,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  product?: Product;
  demoTaken: boolean;
  saving: boolean;
  error: unknown;
  onSubmit: (values: ProductFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(product?.name ?? '');
  const [description, setDescription] = React.useState(product?.description ?? '');
  /*
   * NOT a field, and never reset by this form.
   *
   * A new product is ACTIVE — nobody creates one they do not intend to sell —
   * and turning one off is a decision made from the table, where the row action
   * says which way it is going. An editing form carries the stored value
   * through untouched, so opening an inactive product to fix a typo cannot
   * silently put it back on sale.
   */
  const enabled = product?.enabled ?? true;
  const [sortOrder, setSortOrder] = React.useState(String(product?.sortOrder ?? 0));
  /*
   * Seeded from the stored STRING, never from a number. `String(x)` on a parsed
   * value would already have lost the trailing zeros the column keeps, so an
   * operator opening the form would see a different number from the one they
   * saved.
   */
  const [markup, setMarkup] = React.useState(product?.spreadMarkupPerLot ?? '0');
  const [groups, setGroups] = React.useState<StagedGroup[]>(product?.groups ?? []);

  /*
   * The type decides the groups' environment — a real product carries live
   * groups, the demo product carries demo groups — so there is no per-group
   * environment picker any more. Flipping the type while creating CLEARS the
   * staged groups rather than re-labelling them: a `demo\…` path marked live
   * is a lie the form would be constructing itself.
   */
  const [type, setType] = React.useState<'real' | 'demo'>(product?.type ?? 'real');
  const changeType = (next: 'real' | 'demo') => {
    if (next === type) return;
    setType(next);
    setGroups([]);
  };

  const [chosen, setChosen] = React.useState('');

  /*
   * The broker's live group list, fetched when the form mounts — which is when
   * the modal opens, not with the page. It is a round trip to the MT5 server,
   * and most visits to the products table never open this.
   */
  const available = useResource<AvailableGroup[]>(['admin', 'available-groups'], () =>
    adminApi.getAvailableGroups(),
  );

  /*
   * Claimed by ANOTHER product, or already staged in this one.
   *
   * The API's own list flags the first; the second it cannot know, because the
   * staged rows do not exist yet. Both are shown disabled with a reason rather
   * than filtered out — "the broker does not offer that" and "you have already
   * added it" are different problems, and hiding either sends an operator
   * hunting for a group they can see in their terminal.
   */
  const staged = new Set(groups.map((group) => group.mt5Group.toLowerCase()));
  /*
   * The oldest confirmation in the list, or null when the read was live. Rows
   * only carry `lastSeenAt` on the fallback path, so any non-null value means
   * the whole list came from the catalogue rather than from MT5.
   */
  const staleAt =
    available.status === 'ready'
      ? (available.data ?? [])
          .map((group) => group.lastSeenAt)
          .filter((seen): seen is string => Boolean(seen))
          .sort()[0]
      : undefined;

  const addGroup = () => {
    const match = available.data?.find((group) => group.name === chosen);
    if (!match) return;
    setGroups((current) => [
      ...current,
      {
        environment: type === 'demo' ? 'demo' : 'live',
        mt5Group: match.name,
        currency: match.currency,
      },
    ]);
    setChosen('');
  };

  const removeGroup = (mt5Group: string) =>
    setGroups((current) => current.filter((group) => group.mt5Group !== mt5Group));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      type,
      /*
       * Trimmed, and an empty box means ZERO rather than "leave it alone".
       *
       * The API treats an omitted markup as unchanged — which is what protects
       * it from the enable/disable toggle, which sends a PUT without this field
       * at all. A form that always SHOWS the current value is a different
       * promise: somebody who clears the box means nought, and sending nothing
       * would quietly ignore them.
       */
      spreadMarkupPerLot: markup.trim() === '' ? '0' : markup.trim(),
      sortOrder: parseOrder(sortOrder),
      groups,
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
        <span className="block text-xs font-semibold">{t('products.markup')}</span>
        {/*
          `type="text"`, deliberately, with `inputMode="decimal"` for the phone
          keypad. A number input hands back a NUMBER, which is the one thing
          this value must never become between the form and a NUMERIC(28,8)
          column — and it also lets a browser's spinner round a value nobody
          touched. The API validates the shape and refuses anything else.
        */}
        <input
          type="text"
          inputMode="decimal"
          value={markup}
          onChange={(event) => setMarkup(event.target.value)}
          placeholder="0"
          className={INPUT_CLASS}
        />
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          {t('products.markupHint')}
        </span>
      </label>

      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('products.description')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('products.descriptionPlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
      </label>

      {/* ── Real or demo ───────────────────────────────────────────────── */}
      <div className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('products.type')}</span>
        {product ? (
          /*
           * Fixed at creation — the API refuses a change, so the form does not
           * offer one. Stated rather than hidden: an operator wondering why
           * there is no control should find the answer where it would be.
           */
          <p className="flex items-center gap-2 text-xs">
            <Badge variant={product.type === 'demo' ? 'tag' : 'default'}>
              {product.type === 'demo' ? t('products.typeDemo') : t('products.typeReal')}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{t('products.typeLocked')}</span>
          </p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="sr-only">{t('products.type')}</legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="product-type"
                checked={type === 'real'}
                onChange={() => changeType('real')}
                className="h-3.5 w-3.5"
              />
              {t('products.typeReal')}
            </label>
            <label
              className={`flex items-center gap-2 text-xs ${
                demoTaken ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="product-type"
                checked={type === 'demo'}
                onChange={() => changeType('demo')}
                disabled={demoTaken}
                className="h-3.5 w-3.5"
              />
              {t('products.typeDemo')}
            </label>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              {demoTaken ? t('products.typeDemoExists') : t('products.typeHint')}
            </span>
          </fieldset>
        )}
      </div>

      {/* ── The MT5 groups ─────────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-border pt-4 sm:col-span-2">
        <div className="space-y-0.5">
          <span className="block text-xs font-semibold">{t('products.groups')}</span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            {t('products.groupsExplainer')}
          </span>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-warning">
            {t('products.noGroups')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {groups.map((group) => (
              <li
                key={group.mt5Group}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <Badge variant={group.environment === 'live' ? 'default' : 'tag'}>
                  {group.environment === 'live' ? t('products.live') : t('products.demo')}
                </Badge>
                <span className="font-mono">{group.mt5Group}</span>
                <span className="text-muted-foreground">{group.currency || '—'}</span>
                {/* Staged rows say so. Detaching one that is already saved
                    takes effect on Save, and the operator should be able to
                    tell which of the two a row is. */}
                {group.id === undefined && (
                  <span className="text-[10px] text-muted-foreground">{t('products.pending')}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeGroup(group.mt5Group)}
                  aria-label={t('products.detach')}
                  className="ml-auto cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-outline"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The environment is decided by the product's type, not per group —
            the badge restates which one every added group will get. */}
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <Badge variant={type === 'demo' ? 'tag' : 'default'}>
            {type === 'demo' ? t('products.demo') : t('products.live')}
          </Badge>

          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t('products.chooseGroup')} />
            </SelectTrigger>
            <SelectContent>
              {available.data?.map((group) => {
                const alreadyHere = staged.has(group.name.toLowerCase());
                return (
                  <SelectItem
                    key={group.name}
                    value={group.name}
                    disabled={group.claimed || alreadyHere}
                  >
                    {group.name}
                    {group.currency ? ` · ${group.currency}` : ''}
                    {alreadyHere
                      ? ` — ${t('products.alreadyAdded')}`
                      : group.claimed
                        ? ` — ${t('products.claimed')}`
                        : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {/*
            SAY when the list was last confirmed. `lastSeenAt` is non-null
            exactly when the live MT5 read failed and this fell back to the
            synced catalogue — attaching still validates against the live
            server, so a stale row cannot become a stored configuration, but an
            operator choosing from it deserves to know what they are reading.
          */}
          {staleAt && (
            <p className="mt-1 text-xs text-warning">
              {t('products.groupsStale', { at: new Date(staleAt).toLocaleString() })}
            </p>
          )}

          <button
            type="button"
            onClick={addGroup}
            disabled={!chosen}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('products.attachConfirm')}
          </button>
        </div>

        {available.status === 'error' && (
          <p className="text-[11px] leading-relaxed text-destructive">
            {t('products.groupsUnavailable')}
          </p>
        )}
      </div>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive sm:col-span-2">
          {apiErrorMessage(error, t('products.saveFailed'))}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3 sm:col-span-2">
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
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving && <Spinner />}
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

export type { ProductGroup };
