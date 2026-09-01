'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface ExternalLinkFormValues {
  title: string;
  description: string;
  url: string;
  enabled: boolean;
  /** ZERO-BASED, as stored. The form labels it from 1; see the position select. */
  sortOrder: number;
}

const INPUT_CLASS =
  'focus-outline h-9 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50';

/**
 * Is this something a browser will navigate to, and somewhere we are willing to
 * send a client?
 *
 * PARSED, not pattern-matched — the same call `assertSafeExternalUrl` makes on
 * the API, and for the same reason: the URL constructor is the browser's own
 * answer to "what does this string navigate to", and hand-rolled checks keep
 * losing to it.
 *
 * This is a COURTESY, not the enforcement. It tells the operator before the
 * round trip; the API refuses independently and its message is the authority —
 * which is why the submit button is disabled on a bad value rather than the
 * failure being invented here.
 */
function isAcceptableUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** `1 — first`, `4 — last`, and a bare number in between. */
function positionLabel(index: number, slotCount: number): string {
  const position = String(index + 1);
  if (index === 0) return t('externalLinks.orderFirst', { position });
  if (index === slotCount - 1) return t('externalLinks.orderLast', { position });
  return position;
}

/**
 * Add a link to the client portal's sidebar, or edit one.
 *
 * ## Everything is editable, unlike the leverage form
 *
 * That one disables the ratio once created, because the ratio IS the rung and
 * accounts already carry the number. A link has a surrogate id and nothing
 * references it, so a typo in the URL is a correction rather than a
 * delete-and-recreate — which is the whole reason the table is keyed the way it
 * is.
 *
 * ## The position is a CHOICE FROM THE LIST, never a number to type
 *
 * It was a free number input, blank on add, and every part of that was wrong in
 * a way the operator could not see:
 *
 *   - **Blank meant "append", silently.** The one state the field could be in
 *     that was not a position, standing for the position it would actually get.
 *   - **A typed number could exceed the list.** `placeInOrder` clamps it, so 47
 *     in a list of three lands at the end — a correct outcome the form never
 *     said was coming.
 *   - **It leaked the ZERO-BASED storage.** "Order 0" is the top of the sidebar,
 *     which no operator guesses.
 *
 * So the control is a `Select` over the positions that actually exist, always
 * populated, labelled 1-based with the first and last named. Adding offers one
 * more slot than there are links — the new one — and defaults to it, which is
 * the append that used to be a blank field. Editing offers exactly the slots
 * that exist and defaults to where the link already is.
 *
 * The zero-based value goes to the API unchanged; only the LABEL is 1-based, so
 * nothing here has to know about the storage convention twice.
 *
 * ## Radix, not native form controls
 *
 * The position select and the visibility checkbox are the shadcn components, so
 * this form looks and behaves like every other one in the console rather than
 * rendering whatever the browser draws. Both differ from their native
 * counterparts at the call site and the differences are easy to get wrong:
 *
 *   - `Select` speaks STRINGS. The position is a number, so it is stringified
 *     on the way in and parsed on the way out — and `value=""` is reserved by
 *     Radix for the placeholder state, which is one more reason this control is
 *     never empty.
 *   - `Checkbox` is a `<button role="checkbox">`, so there is no `e.target`. It
 *     reports `boolean | 'indeterminate'` and is paired with its label by
 *     `id`/`htmlFor` rather than by wrapping — see `ui/checkbox.tsx`.
 */
export function ExternalLinkFormModal({
  open,
  editing,
  linkCount,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Null when adding. */
  editing: ExternalLinkFormValues | null;
  /**
   * How many links exist right now, INCLUDING the one being edited.
   *
   * The slot count is derived rather than passed, because the two cases differ
   * by exactly one and a caller computing it is a caller that can get it wrong:
   * adding creates a slot, editing moves within the ones there are.
   */
  linkCount: number;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: ExternalLinkFormValues) => void;
}) {
  /*
   * SEEDED AT MOUNT, not reset in an effect.
   *
   * The obvious version syncs the fields with `useEffect` when `editing`
   * changes — a `setState` inside an effect, so React renders the stale form
   * first and corrects it on a second pass. This project's lint rules refuse it,
   * and rightly: the operator sees the previous link's values for a frame.
   *
   * The caller keys this component on the subject and renders it only while the
   * form is OPEN, so mounting happens when the operator opens it and these
   * initialisers run afresh against a loaded list. That is React's own answer to
   * "reset all state when a prop changes".
   */
  const [title, setTitle] = React.useState(editing?.title ?? '');
  const [description, setDescription] = React.useState(editing?.description ?? '');
  const [url, setUrl] = React.useState(editing?.url ?? '');
  const [enabled, setEnabled] = React.useState(editing?.enabled ?? true);

  /*
   * Adding creates a slot; editing moves within the ones that exist. `max(1, …)`
   * only guards a nonsensical `linkCount: 0` while editing — there is always at
   * least the row being edited.
   */
  const slotCount = editing ? Math.max(1, linkCount) : linkCount + 1;

  /*
   * The DEFAULT is the answer, pre-selected: where the link already sits when
   * editing, and the end of the menu when adding. Clamped, because a row whose
   * stored position drifted past the list (a hand-written UPDATE, a stale query
   * behind a concurrent delete) must not select a slot that is not on offer —
   * Radix would render an empty trigger and the first save would move the link
   * somewhere nobody chose.
   */
  const [sortOrder, setSortOrder] = React.useState(
    editing ? Math.min(Math.max(editing.sortOrder, 0), slotCount - 1) : slotCount - 1,
  );

  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();

  const urlValid = isAcceptableUrl(trimmedUrl);
  const canSubmit = trimmedTitle !== '' && urlValid;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('externalLinks.editTitle') : t('externalLinks.addTitle')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            title: trimmedTitle,
            description: description.trim(),
            url: trimmedUrl,
            enabled,
            sortOrder,
          });
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="external-link-title" className="text-xs font-semibold">
            {t('externalLinks.fieldTitle')}
          </label>
          <input
            id="external-link-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            maxLength={80}
            required
            placeholder="Economic calendar"
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-muted-foreground">{t('externalLinks.fieldTitleHint')}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="external-link-url" className="text-xs font-semibold">
            {t('externalLinks.fieldUrl')}
          </label>
          <input
            id="external-link-url"
            /*
             * `type="url"` deliberately, for the keyboard it brings up on a
             * phone — but the browser's own validation is not what decides:
             * `isAcceptableUrl` runs on every keystroke and the API refuses
             * independently. A native validity bubble saying "enter a URL" is
             * less useful than the hint below, which names the scheme.
             */
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={saving}
            maxLength={2048}
            required
            placeholder="https://example.com/calendar"
            className={INPUT_CLASS}
          />
          <p
            className={`text-[11px] ${
              trimmedUrl !== '' && !urlValid ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {/* Silent until they have typed something — a red warning on an
                untouched field reads as a form that is already broken. */}
            {trimmedUrl !== '' && !urlValid
              ? t('externalLinks.fieldUrlInvalid')
              : t('externalLinks.fieldUrlHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="external-link-description" className="text-xs font-semibold">
            {t('externalLinks.fieldDescription')}
          </label>
          <textarea
            id="external-link-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            maxLength={300}
            rows={2}
            className="focus-outline w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <p className="text-[11px] text-muted-foreground">
            {t('externalLinks.fieldDescriptionHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-semibold">{t('externalLinks.fieldSortOrder')}</span>
          <Select
            /*
             * Radix speaks STRINGS. The position is a number in state and on the
             * wire, so it is stringified here and parsed on the way out — one
             * conversion at the boundary rather than a string threaded through
             * the form the way the old free-text input did it.
             */
            value={String(sortOrder)}
            onValueChange={(next) => setSortOrder(Number(next))}
            disabled={saving}
          >
            <SelectTrigger
              id="external-link-sort"
              className="h-9 w-full"
              aria-label={t('externalLinks.fieldSortOrder')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/*
                One item per slot, in sidebar order. `Array.from` rather than a
                map over the rows: the OPTIONS are positions, and adding has one
                more of them than there are links.
              */}
              {Array.from({ length: slotCount }, (_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {positionLabel(index, slotCount)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {t('externalLinks.fieldSortOrderHint')}
          </p>
        </div>

        {/*
          Paired by `id`/`htmlFor`, never by wrapping. Radix renders a
          `<button role="checkbox">` whose accessible name is computed from its
          CONTENT first — and its content is a decorative tick — so a wrapping
          label degrades silently: the box still toggles, while the name a
          screen reader announces is not the one on screen.
        */}
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="external-link-enabled"
            checked={enabled}
            // `boolean | 'indeterminate'`, and this state is a boolean. There is
            // no `e.target.checked` on a Radix checkbox.
            onCheckedChange={(next) => setEnabled(next === true)}
            disabled={saving}
          />
          <label htmlFor="external-link-enabled" className="cursor-pointer text-sm">
            {t('externalLinks.fieldEnabled')}
          </label>
        </div>
        <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('externalLinks.fieldEnabledHint')}
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('externalLinks.saving') : t('externalLinks.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
