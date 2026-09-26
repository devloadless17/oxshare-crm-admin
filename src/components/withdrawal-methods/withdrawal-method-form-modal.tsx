'use client';

import * as React from 'react';
import type { WithdrawalMethod } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { LogoField } from '@/components/payment-methods/payment-method-form-modal';
import { t } from '@/lib/i18n';

export interface WithdrawalMethodFormValues {
  key: string;
  name: string;
  /** An upload path or an https URL; empty means no logo. */
  logoUrl: string;
  enabled: boolean;
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
  const [enabled, setEnabled] = React.useState(method?.enabled ?? true);
  const fieldId = React.useId();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      key: key.trim(),
      name: name.trim(),
      logoUrl: logoUrl.trim(),
      enabled,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-key`}>{t('withdrawalMethods.key')}</Label>
          <Input
            id={`${fieldId}-key`}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            required
            minLength={2}
            maxLength={40}
            pattern="[A-Za-z0-9_]+"
            placeholder="bank_transfer"
            disabled={method !== undefined}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">{t('withdrawalMethods.keyHint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-name`}>{t('withdrawalMethods.name')}</Label>
          <Input
            id={`${fieldId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            placeholder={t('withdrawalMethods.namePlaceholder')}
            className="text-xs"
          />
        </div>
      </div>

      <LogoField value={logoUrl} onChange={setLogoUrl} />

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${fieldId}-enabled`}
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
        />
        <Label htmlFor={`${fieldId}-enabled`} className="cursor-pointer font-medium">
          {t('withdrawalMethods.enabled')}
        </Label>
      </div>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('withdrawalMethods.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!name.trim() || !key.trim()}>
          {t('withdrawalMethods.save')}
        </Button>
      </div>
    </form>
  );
}
