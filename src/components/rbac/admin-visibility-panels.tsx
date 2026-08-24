'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { ClientFieldGroup, ClientTagWithCount } from '@/lib/api/admin';
import { ToggleList, type ToggleListOption } from '@/components/ui/toggle-list';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

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
 * ── The empty case is stated in words, never left to inference ──────────────
 *
 * An empty scope means UNRESTRICTED — every client — following RBAC-08's empty
 * allowlist and D-10, so that introducing the feature cannot blind every
 * existing sub-admin. Both readings of "no tags selected" are plausible and one
 * of them is a data breach, so the panel says which it is rather than hoping
 * the operator guesses right.
 */
export function AdminTagScopePanel({
  tags,
  selected,
  onToggle,
  disabled,
  disabledReason,
}: {
  tags: readonly ClientTagWithCount[];
  selected: readonly string[];
  onToggle: (tagId: string) => void;
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
        createdAt: '',
      },
  );
  const available = tags.filter((tag) => !selected.includes(tag.id));

  return (
    <div className="space-y-3">
      {disabledReason ? (
        <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t('adminUsers.scopeHint')}</p>

          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('adminUsers.scopeNoTags')}</p>
          ) : (
            <>
              {/*
               * WHAT IS CHOSEN, first and on its own. This is the answer to the
               * question the panel exists to answer, so it is not something to
               * be inferred from which rows of a grid happen to be ticked.
               */}
              {chosen.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('adminUsers.scopeTagsNoneChosen')}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {chosen.map((tag) => (
                    <li key={tag.id}>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-ring bg-primary/10 py-1 ps-2.5 pe-1 text-[11px] font-semibold text-foreground">
                        {tag.label}
                        <span className="font-normal text-muted-foreground">
                          {t('adminUsers.scopeTagHint', { count: tag.clientCount })}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggle(tag.id)}
                          disabled={disabled}
                          // Named for the tag it removes: a row of identical
                          // "Remove" buttons is unusable without sight of them.
                          aria-label={t('adminUsers.scopeTagRemove', { label: tag.label })}
                          className="focus-outline rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {available.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('adminUsers.scopeTagsAllChosen')}
                </p>
              ) : (
                /*
                 * `value=""` on every render — this control performs an action
                 * rather than holding a value. Letting it keep the last pick
                 * would leave a tag named in the trigger AND listed as a chip
                 * below, which reads as two different pieces of state.
                 */
                <Select value="" onValueChange={onToggle} disabled={disabled}>
                  <SelectTrigger
                    aria-label={t('adminUsers.scopeTagAdd')}
                    className="h-9 w-full text-xs"
                  >
                    <SelectValue placeholder={t('adminUsers.scopeTagAdd')} />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.label} · {t('adminUsers.scopeTagHint', { count: tag.clientCount })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}

          {selected.length === 0 && (
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
  const fields = Object.values(catalog).flatMap((group) => group.fields);

  const options: ToggleListOption[] = fields.map((field) => ({
    value: field.key,
    label: field.label,
    hint: field.key,
    // Unmaskable fields are SHOWN and disabled WITH THEIR REASON, not omitted.
    // An operator hunting for "why can I not hide the status column" needs the
    // answer where they are looking, not absence.
    disabledReason: field.maskable ? undefined : field.reason,
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
