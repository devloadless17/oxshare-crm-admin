'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import {
  adminApi,
  type AvailableGroup,
  type IbCommissionType,
  type Product,
  type ProductGroup,
} from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { StickyActions } from '@/components/ui/form-section';
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
import { keys } from '@/lib/query-keys';

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
   * The rate card this product pays partners on (0140), or null for a product
   * that pays no partner commission. The demo product never carries one.
   */
  commissionTypeId: string | null;
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
export function ProductForm({
  product,
  demoTaken,
  commissionTypes,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  product?: Product;
  demoTaken: boolean;
  commissionTypes: IbCommissionType[];
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
  /*
   * `'none'` in the control, `null` on the wire. The select needs a value for
   * "no type" and an empty string is not a value Radix will show — so the
   * sentinel lives here and is translated back at submit.
   */
  const [commissionTypeId, setCommissionTypeId] = React.useState<string>(
    product?.commissionTypeId ?? NO_TYPE,
  );
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
  const available = useResource<AvailableGroup[]>(keys.products.availableGroups(), () =>
    adminApi.getAvailableGroups(),
  );

  /*
   * Already staged in THIS product — the one thing that blocks a group.
   *
   * The API's `claimed` flag says some product sells it; since backend 0142 a
   * group may back several products, so that is a NOTE, not a refusal. What the
   * API cannot know is what is staged here and not yet saved, which is this set.
   * Shown disabled with a reason rather than filtered out, so an operator can
   * tell "you have already added it" from "the broker does not offer that".
   */
  const staged = new Set(groups.map((group) => group.mt5Group.toLowerCase()));
  /*
   * ONE GROUP PER CURRENCY on a product — the API refuses a second, because a
   * client picks a product and a currency and must land in exactly one group.
   * Every group here shares the product's environment, so the currency alone
   * names the slot. A group in a taken currency is shown disabled, naming the
   * group in the way: removing that one frees the slot, and Save detaches
   * before it attaches, so a swap goes through in one edit.
   */
  const slotHeldBy = new Map(
    groups
      .filter((group) => group.currency)
      .map((group) => [group.currency.toUpperCase(), group.mt5Group] as const),
  );
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
       * Always SENT, null included. The API treats an OMITTED type as
       * unchanged — which is what protects it from the enable/disable toggle,
       * which sends a PUT without this field — but a form that shows the
       * current choice makes a different promise: somebody who picked "none"
       * means none, and sending nothing would quietly ignore them. The demo
       * product never carries one, and the API refuses it anyway.
       */
      commissionTypeId:
        type === 'demo' ? null : commissionTypeId === NO_TYPE ? null : commissionTypeId,
      groups,
    });
  };

  return (
    <form className="space-y-5 pb-20" onSubmit={submit}>
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
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

        <label className="space-y-1.5 sm:col-span-2">
          <span className="block text-xs font-semibold">{t('products.commissionType')}</span>
          {type === 'demo' ? (
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              {t('products.commissionTypeDemo')}
            </span>
          ) : (
            <>
              <Select value={commissionTypeId} onValueChange={setCommissionTypeId}>
                <SelectTrigger className="h-9 w-full" aria-label={t('products.commissionType')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TYPE}>{t('products.commissionTypeNone')}</SelectItem>
                  {/*
                  Inactive types are OFFERED, marked — a product may legitimately
                  sit on a card that is switched off while the desk decides,
                  and hiding it would make the stored choice unexplainable.
                */}
                  {commissionTypes.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                      {!candidate.enabled && ` · ${t('products.commissionTypeInactive')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                {t('products.commissionTypeHint')}
              </span>
            </>
          )}
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
            <div className="space-y-1.5">
              {/*
              shadcn `Select` rather than the two bare `<input type="radio">`
              this replaced — the only unstyled controls left on this form, so
              they rendered in the browser's own chrome beside inputs that did
              not, and ignored the theme in dark mode.

              A select rather than a radio group: this repo has no
              `radio-group.tsx` and `@radix-ui/react-radio-group` is not a
              dependency, so a group would mean adding a package to render a
              two-way choice that a select already states in one line. The
              options are mutually exclusive and always exactly two.

              `demoTaken` disables the OPTION, not the control. The rule is
              "there is already a demo product", which is a fact about that one
              choice — disabling the whole select would also take away the real
              option, which is always available.
            */}
              <Select value={type} onValueChange={(next) => changeType(next as 'real' | 'demo')}>
                <SelectTrigger className="h-9 w-full" aria-label={t('products.type')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="real">{t('products.typeReal')}</SelectItem>
                  <SelectItem value="demo" disabled={demoTaken}>
                    {t('products.typeDemo')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                {demoTaken ? t('products.typeDemoExists') : t('products.typeHint')}
              </span>
            </div>
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
                    <span className="text-[10px] text-muted-foreground">
                      {t('products.pending')}
                    </span>
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
              <SelectTrigger className="h-9 text-xs" aria-label={t('products.chooseGroup')}>
                <SelectValue placeholder={t('products.chooseGroup')} />
              </SelectTrigger>
              <SelectContent>
                {available.data?.map((group) => {
                  const alreadyHere = staged.has(group.name.toLowerCase());
                  const heldBy = alreadyHere
                    ? undefined
                    : slotHeldBy.get(group.currency.toUpperCase());
                  return (
                    <SelectItem
                      key={group.name}
                      value={group.name}
                      /*
                       * Only a group ALREADY ON THIS product is blocked. One sold
                       * by another product is offered, with a note: a group may
                       * back several products since backend 0142, and the account
                       * records whichever product it was opened under.
                       */
                      disabled={alreadyHere || heldBy !== undefined}
                    >
                      {group.name}
                      {group.currency ? ` · ${group.currency}` : ''}
                      {alreadyHere
                        ? ` — ${t('products.alreadyAdded')}`
                        : heldBy !== undefined
                          ? ` — ${t('products.currencyTaken', { currency: group.currency, group: heldBy })}`
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
      </section>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {apiErrorMessage(error, t('products.saveFailed'))}
        </p>
      )}

      <StickyActions>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('products.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!name.trim()}>
          {saving ? t('products.saving') : t('products.save')}
        </Button>
      </StickyActions>
    </form>
  );
}

/** The select's value for "no commission type" — `null` on the wire. */
const NO_TYPE = 'none';

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export type { ProductGroup };
