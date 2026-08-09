'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { ClientTagWithCount } from '@/lib/api/admin';

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
 * There were TWO surfaces here. `AdminFieldMaskPanel` — a per-administrator
 * override of which client FIELDS are hidden — has been removed along with the
 * section that rendered it. A mask attached to one person is the same shape of
 * thing as a per-person permission list: an access rule that tracks no role and
 * is invisible from the roles screen, so "who can see phone numbers?" stopped
 * being answerable there. Masks are a property of the ROLE, set on `/roles`,
 * which has its own panel and its own fetch of the field catalog.
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
  const chosen = tags.filter((tag) => selected.includes(tag.id));
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
