'use client';

import * as React from 'react';
import type { ClientTag } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';

/**
 * A fixed palette, not a colour picker.
 *
 * A free hex input produces chips that are unreadable in one of the two themes
 * roughly half the time, and nothing in this app checks contrast. Eight values
 * chosen to be legible as a tint against both backgrounds — which is how
 * `ClientTagChips` renders them.
 */
const PALETTE = [
  '#b45309',
  '#b91c1c',
  '#a21caf',
  '#4338ca',
  '#0369a1',
  '#047857',
  '#65a30d',
  '#525252',
] as const;

export interface TagFormValues {
  label: string;
  color?: string;
  description?: string;
}

/**
 * Create or rename a client tag.
 *
 * THE SLUG IS NOT EDITABLE, and is not shown as an input. It is derived from
 * the label by the API, and it is what appears in the `/clients?tag=` links
 * operators paste into tickets — so re-deriving it from a renamed label would
 * break those silently. The URL would still load and simply show no clients,
 * which reads as "this segment is empty" rather than "this link is stale".
 *
 * On edit the existing slug is displayed, read-only, so the person renaming a
 * tag can see that the link they shared still works.
 */
export function TagFormModal({
  open,
  tag,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing; absent when creating. */
  tag?: ClientTag;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: TagFormValues) => void;
}) {
  return (
    <Modal
      busy={saving}
      open={open}
      onClose={onClose}
      title={tag ? t('tags.editTitle') : t('tags.createTitle')}
      description={tag ? undefined : t('tags.createHint')}
    >
      {/*
       * KEYED, so opening the modal on a different tag REMOUNTS the form and
       * its state starts from that tag's values.
       *
       * The obvious alternative — a `useEffect` that re-seeds three useStates
       * when `open` or `tag` changes — is what `react-hooks/set-state-in-effect`
       * exists to catch: it renders once with the previous tag's values before
       * correcting itself, which on a fast machine is a flicker and on a slow
       * one is long enough to type into. Remounting has no intermediate state
       * to be wrong in.
       */}
      <TagForm
        key={`${tag?.id ?? 'new'}-${String(open)}`}
        tag={tag}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function TagForm({
  tag,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  tag?: ClientTag;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: TagFormValues) => void;
}) {
  const [label, setLabel] = React.useState(tag?.label ?? '');
  const [color, setColor] = React.useState<string | undefined>(tag?.color);
  const [description, setDescription] = React.useState(tag?.description ?? '');

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            label: label.trim(),
            color,
            description: description.trim() || undefined,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="tag-label" className="text-xs font-semibold">
            {t('tags.labelField')}
          </label>
          <input
            id="tag-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            // A country tag is named by its country (0193); only its colour is the desk's.
            readOnly={Boolean(tag?.countryCode)}
            maxLength={100}
            placeholder={t('tags.labelPlaceholder')}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
          />
          {tag && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tag.countryCode ? t('tags.countryFixed') : t('tags.slugFixed', { slug: tag.slug })}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="text-xs font-semibold">{t('tags.colourField')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PALETTE.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value === color ? undefined : value)}
                aria-pressed={value === color}
                aria-label={value}
                className={`h-7 w-7 rounded-full border-2 focus-outline ${
                  value === color ? 'border-ring' : 'border-transparent'
                }`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('tags.colourPreview')}{' '}
            <Badge
              variant="tag"
              style={color ? { backgroundColor: `${color}22`, color } : undefined}
            >
              {label.trim() || t('tags.previewPlaceholder')}
            </Badge>
          </p>
        </fieldset>

        {!tag?.countryCode && (
          <div>
            <label htmlFor="tag-description" className="text-xs font-semibold">
              {t('tags.descriptionField')}
            </label>
            <input
              id="tag-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder={t('tags.descriptionPlaceholder')}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
            />
          </div>
        )}

        {error && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || label.trim() === ''}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
          >
            {saving ? t('tags.saving') : tag ? t('tags.save') : t('tags.create')}
          </button>
        </div>
      </form>
    </>
  );
}
