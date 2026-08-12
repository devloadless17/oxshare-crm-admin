'use client';

import * as React from 'react';
import type { Agency } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface AgencyFormValues {
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Add an agency (وكالة), or edit one that exists.
 *
 * The DESCRIPTION is the field that matters here and the one most likely to be
 * left blank. Applicants on the portal read it to decide which programme to
 * request; a list of bare names gives them nothing to choose on, so the hint
 * says who reads it rather than what it is.
 */
export function AgencyFormModal({
  open,
  agency,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  agency?: Agency;
  saving: boolean;
  error: unknown;
  onSubmit: (values: AgencyFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={agency ? t('agencies.editTitle') : t('agencies.createTitle')}
    >
      {/* Keyed, so opening on a different agency remounts the form with that
          agency's values — see the note in product-form-modal.tsx. */}
      <AgencyForm
        key={agency?.id ?? 'new'}
        agency={agency}
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
  saving,
  error,
  onSubmit,
  onClose,
}: {
  agency?: Agency;
  saving: boolean;
  error: unknown;
  onSubmit: (values: AgencyFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(agency?.name ?? '');
  const [description, setDescription] = React.useState(agency?.description ?? '');
  const [enabled, setEnabled] = React.useState(agency?.enabled ?? true);
  const [sortOrder, setSortOrder] = React.useState(String(agency?.sortOrder ?? 0));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      sortOrder: parseOrder(sortOrder),
    });
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="space-y-1.5">
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

      <label className="space-y-1.5">
        <span className="block text-xs font-semibold">{t('agencies.order')}</span>
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          min={0}
          max={1000}
          className={INPUT_CLASS}
        />
        <span className="block text-[11px] text-muted-foreground">{t('agencies.orderHint')}</span>
      </label>

      <label className="space-y-1.5 sm:col-span-2">
        <span className="block text-xs font-semibold">{t('agencies.description')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('agencies.descriptionPlaceholder')}
          className={`${INPUT_CLASS} h-auto py-2 leading-relaxed`}
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('agencies.descriptionHint')}
        </span>
      </label>

      <div className="flex items-start gap-2.5 sm:col-span-2">
        <Checkbox
          id="agency-enabled"
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          className="mt-0.5"
        />
        <label htmlFor="agency-enabled" className="cursor-pointer space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            {t('agencies.enabled')}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {t('agencies.enabledHint')}
          </span>
        </label>
      </div>

      {error !== null && error !== undefined && (
        <p role="alert" className="text-xs leading-relaxed text-destructive sm:col-span-2">
          {apiErrorMessage(error, t('agencies.saveFailed'))}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
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
          className="h-9 cursor-pointer rounded-lg border border-input px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving ? t('agencies.saving') : t('agencies.save')}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

function parseOrder(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
