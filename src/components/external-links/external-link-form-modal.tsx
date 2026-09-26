'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { t } from '@/lib/i18n';

export interface ExternalLinkFormValues {
  title: string;
  description: string;
  url: string;
  enabled: boolean;
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
 * ## No position field (owner, 26 Sep 2026)
 *
 * A new link goes to the end of the sidebar and an edited one stays where it
 * is; the API decides both. There is nothing to choose here.
 *
 * ## Radix, not native form controls
 *
 * The visibility checkbox is the shadcn component, so
 * this form looks and behaves like every other one in the console rather than
 * rendering whatever the browser draws. It differs from its native
 * counterpart at the call site in a way that is easy to get wrong:
 *
 *   - `Checkbox` is a `<button role="checkbox">`, so there is no `e.target`. It
 *     reports `boolean | 'indeterminate'` and is paired with its label by
 *     `id`/`htmlFor` rather than by wrapping — see `ui/checkbox.tsx`.
 */
export function ExternalLinkFormModal({
  open,
  editing,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Null when adding. */
  editing: ExternalLinkFormValues | null;
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
