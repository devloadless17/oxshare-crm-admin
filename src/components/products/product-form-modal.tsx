'use client';

import * as React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { adminApi, type AvailableGroup, type Product, type ProductGroup } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [groups, setGroups] = React.useState<StagedGroup[]>(product?.groups ?? []);

  const [environment, setEnvironment] = React.useState<'live' | 'demo'>('demo');
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

  const addGroup = () => {
    const match = available.data?.find((group) => group.name === chosen);
    if (!match) return;
    setGroups((current) => [
      ...current,
      { environment, mt5Group: match.name, currency: match.currency },
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

        <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
          <Select
            value={environment}
            onValueChange={(value) => setEnvironment(value as 'live' | 'demo')}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="demo">{t('products.demo')}</SelectItem>
              <SelectItem value="live">{t('products.live')}</SelectItem>
            </SelectContent>
          </Select>

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
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
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
