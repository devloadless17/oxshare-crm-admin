'use client';

import * as React from 'react';
import type { WithdrawalMethod } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/loader';
import { LogoField } from '@/components/payment-methods/payment-method-form-modal';
import { t } from '@/lib/i18n';

export interface WithdrawalMethodFormValues {
  key: string;
  name: string;
  /** An upload path or an https URL; empty means no logo. */
  logoUrl: string;
  enabled: boolean;
  sortOrder: number;
}

/**
 * Add a withdrawal method, or edit one that exists.
 *
 * Shaped like the deposit form, minus what a payout rail does not have: no
 * currency (a withdrawal is paid in its wallet's currency) and no offline-proof
 * switch (that is a deposit concern). The logo goes through the same upload.
 *
 * The KEY is fixed once created — it is the primary key, and every withdrawal
 * request made on the method references it — so it is shown read-only on edit.
 */
export function WithdrawalMethodFormModal({
  open,
  method,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Absent means create. */
  method?: WithdrawalMethod;
  saving: boolean;
  error?: string;
  onSubmit: (values: WithdrawalMethodFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={method ? t('withdrawalMethods.editTitle') : t('withdrawalMethods.createTitle')}
    >
      {/* Keyed, so opening on a different method remounts with its values —
          see the note in product-form-modal.tsx. */}
      <WithdrawalMethodForm
        key={method?.key ?? 'new'}
        method={method}
        saving={saving}
        error={error}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function WithdrawalMethodForm({
  method,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  method?: WithdrawalMethod;
  saving: boolean;
  error?: string;
  onSubmit: (values: WithdrawalMethodFormValues) => void;
  onClose: () => void;
}) {
  const [key, setKey] = React.useState(method?.key ?? '');
  const [name, setName] = React.useState(method?.name ?? '');
  const [logoUrl, setLogoUrl] = React.useState(method?.logoUrl ?? '');
  const [sortOrder, setSortOrder] = React.useState(String(method?.sortOrder ?? 0));
  const [enabled, setEnabled] = React.useState(method?.enabled ?? true);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const order = Number.parseInt(sortOrder, 10);
    onSubmit({
      key: key.trim(),
      name: name.trim(),
      logoUrl: logoUrl.trim(),
      enabled,
      sortOrder: Number.isFinite(order) && order >= 0 ? order : 0,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('withdrawalMethods.key')}
          </span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            required
            minLength={2}
            maxLength={40}
            pattern="[A-Za-z0-9_]+"
            placeholder="bank_transfer"
            disabled={method !== undefined}
            className={`${INPUT_CLASS} font-mono`}
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('withdrawalMethods.keyHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('withdrawalMethods.name')}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            placeholder={t('withdrawalMethods.namePlaceholder')}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <LogoField value={logoUrl} onChange={setLogoUrl} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('withdrawalMethods.order')}
          </span>
          <input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className={`${INPUT_CLASS} tabular`}
          />
          <span className="block text-[11px] text-muted-foreground">
            {t('withdrawalMethods.orderHint')}
          </span>
        </label>

        <label className="flex items-center gap-2 self-center pt-4 text-xs font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4"
          />
          {t('withdrawalMethods.enabled')}
        </label>
      </div>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-outline"
        >
          {t('withdrawalMethods.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !key.trim()}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-outline"
        >
          {saving && <Spinner />}
          {saving ? t('withdrawalMethods.saving') : t('withdrawalMethods.save')}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
