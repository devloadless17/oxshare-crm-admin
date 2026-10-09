'use client';

import { AlertTriangle } from 'lucide-react';
import type { ClientFieldGroup, ClientTagWithCount } from '@/lib/api/admin';
import { ToggleList, type ToggleListOption } from '@/components/ui/toggle-list';
import { ChipInput, type ChipOption } from '@/components/ui/chip-input';

import { t } from '@/lib/i18n';
import { maskableFields } from '@/lib/masking';

/**
 * RBAC-03's configuration surface on one administrator: which CLIENTS they see.
 *
 * Gated on `users.scope` rather than `users.edit`, and that separation is the
 * point: reusing `users.edit` would mean anyone who can RENAME an administrator
 * can also widen that administrator's view of the entire client base. Those are
 * not the same size of act.
 *
 * TWO surfaces again (restored 13 Aug, owner's decision): the tag TERRITORY and
 * the field-mask OVERRIDE. The override was removed as "an access rule tracking
 * no role" — but the role editor's mask section had been removed too, which
 * left masking enforced by the API and configurable nowhere. The model now is
 * the one the API always kept: the ROLE is where a mask is normally set
 * (`/roles`, restored first), and this per-person override exists for the
 * one-person exception — `null` inherits the role, a list wins over it, and
 * the roles screen stays the answer to "who can see phone numbers" for
 * everyone who has no override.
 */

/**
 * Which clients this administrator may see.
 *
 * ── A SELECT plus chips, not a grid of checkboxes ───────────────────────────
 *
 * The tag vocabulary is open-ended: it grows with the business, and a console
 * that has run for a year has dozens. As a checkbox grid that is a wall of
 * options where the four that are actually ticked are scattered among them, and
 * the answer to "what is this person restricted to?" — the only question the
 * panel exists to answer — has to be assembled by scanning. The chosen tags are
 * now listed on their own, above a select that offers what is left.
 *
 * The select is an ADD control: it holds no value of its own, resets after each
 * pick, and lists only tags not already chosen, so it can never offer an option
 * that would silently do nothing. Removal is on the chip, next to the thing
 * being removed.
 *
 * The FIELD MASK panel below keeps its checkbox grid deliberately. That catalog
 * is small, fixed and worth reading in full — an operator needs to see the
 * fields they have not hidden as much as the ones they have.
 *
 * ── "All clients" is a CHOICE, never what an empty list means (0154) ─────────
 *
 * An empty territory used to mean every client, so clearing the last chip
 * silently widened an administrator to the whole client base. Every client is
 * now its own explicit option, offered only by an admin who sees every client
 * themselves (the server refuses anyone else), and "only these tags" with none
 * chosen says plainly that it means no clients — or only new ones.
 */
/**
 * The territory picker's options: the business's tags. Unknown chosen ids are
 * kept as options so their chips still render.
 */
function scopeOptions(
  chosen: readonly { id: string; label: string }[],
  tags: readonly ClientTagWithCount[],
): ChipOption[] {
  const known = new Set(tags.map((tag) => tag.id));
  return [
    ...chosen
      .filter((tag) => !known.has(tag.id))
      .map((tag) => ({ value: tag.id, label: tag.label })),
    ...tags.map((tag) => ({ value: tag.id, label: tag.label })),
  ];
}

export function AdminTagScopePanel({
  tags,
  selected,
  onToggle,
  allClients,
  onAllClientsChange,
  canGrantAll,
  disabled,
  disabledReason,
}: {
  tags: readonly ClientTagWithCount[];
  selected: readonly string[];
  onToggle: (tagId: string) => void;
  /** Sees every client — the explicit grant (0154). */
  allClients: boolean;
  onAllClientsChange: (allClients: boolean) => void;
  /** Only an administrator who sees every client may grant it. */
  canGrantAll: boolean;
  disabled?: boolean;
  /** Why the whole panel is inert — e.g. this is the master admin. */
  disabledReason?: string;
}) {
  /*
   * EVERY selected id renders a chip, even one the vocabulary fetch does not
   * contain — as its raw id, removable. Filtering chips through the vocabulary
   * made a stored territory invisible whenever the tag list and the scope
   * disagreed for any reason, and an operator who then saved an unrelated
   * change silently narrowed the scope to only what they could see. A chip
   * that says "unknown tag" is ugly and honest; a dropped territory is
   * neither.
   */
  const known = new Map(tags.map((tag) => [tag.id, tag] as const));
  const chosen = selected.map(
    (id) =>
      known.get(id) ?? {
        id,
        slug: id,
        label: t('adminUsers.scopeUnknownTag'),
        clientCount: 0,
        clientsOutsideScope: 0,
        createdAt: '',
      },
  );

  return (
    <div className="space-y-3">
      {disabledReason ? (
        <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t('adminUsers.scopeHint')}</p>

          <div
            role="radiogroup"
            aria-label={t('adminUsers.scopeModeLabel')}
            className="grid grid-cols-2 gap-2"
          >
            {[
              { value: true, label: t('adminUsers.scopeModeAll') },
              { value: false, label: t('adminUsers.scopeModeTags') },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={allClients === option.value}
                disabled={disabled || (option.value && !canGrantAll && !allClients)}
                onClick={() => onAllClientsChange(option.value)}
                className="focus-outline rounded-lg border border-border px-3 py-2 text-xs font-semibold aria-checked:border-ring aria-checked:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
          {!canGrantAll && !allClients && (
            <p className="text-[11px] text-muted-foreground">
              {t('adminUsers.scopeModeAllLocked')}
            </p>
          )}

          {allClients ? (
            <p className="text-[11px] text-muted-foreground">{t('adminUsers.scopeModeAllHint')}</p>
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('adminUsers.scopeNoTags')}</p>
          ) : (
            /*
             * Search-and-pick (`ChipInput`): since 0193 every country is a tag
             * too, so the vocabulary is ~270 entries and a plain select is a
             * wall. Chosen tags show as chips first — the answer to the
             * question this panel exists for — and a country can be found by
             * its name or its ISO code. Chosen tags first, then the rest, each
             * group alphabetical; countries after the business's own tags.
             */
            <>
              {chosen.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {t('adminUsers.scopeTagsNoneChosen')}
                </p>
              )}
              <ChipInput
                value={selected}
                onChange={(next) => {
                  for (const id of next) if (!selected.includes(id)) onToggle(id);
                  for (const id of selected) if (!next.includes(id)) onToggle(id);
                }}
                options={scopeOptions(chosen, tags)}
                placeholder={t('adminUsers.scopeTagAdd')}
                ariaLabel={t('adminUsers.scopeTagAdd')}
                disabled={disabled}
              />
            </>
          )}

          {!allClients && selected.length === 0 && (
            <p
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning"
              role="note"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('adminUsers.scopeEmptyWarning')}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Which client fields this administrator may NOT see — the per-person
 * OVERRIDE of their role's mask.
 *
 * The catalog is FETCHED (`GET /admin/client-fields`), never a frontend
 * constant — the same rule as the permission catalog (R-4.5). A key the backend
 * does not mask must not be offerable, and one it gains must appear without a
 * frontend release. A mask key with no backend counterpart is not a cosmetic
 * bug: it is a field an operator ticked a box for and believes they hid.
 */
export function AdminFieldMaskPanel({
  catalog,
  selected,
  onToggle,
  disabled,
  disabledReason,
  inheriting,
  onResetToRole,
}: {
  catalog: Record<string, ClientFieldGroup>;
  selected: readonly string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** True while this admin has no override and follows their role. */
  inheriting: boolean;
  onResetToRole: () => void;
}) {
  // Only what can be hidden (`maskableFields`): unmaskable fields are left out.
  const options: ToggleListOption[] = maskableFields(catalog).map((field) => ({
    value: field.key,
    label: field.label,
    hint: field.key,
  }));

  return (
    <div className="space-y-3">
      {disabledReason ? (
        <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {inheriting ? t('adminUsers.maskInheriting') : t('adminUsers.maskOverriding')}
          </p>

          <ToggleList
            options={options}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
          />

          {!inheriting && (
            <button
              type="button"
              onClick={onResetToRole}
              disabled={disabled}
              className="text-[11px] font-semibold text-link hover:underline focus-outline disabled:opacity-50"
            >
              {/*
               * Clearing the override is a distinct action from "select
               * nothing", and the API distinguishes them: `null` means inherit
               * the role, `[]` means explicitly mask nothing for this person.
               */}
              {t('adminUsers.maskResetToRole')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
