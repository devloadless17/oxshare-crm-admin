'use client';

import {
  CountryRuleSection,
  type CountryRuleValue,
} from '@/components/payment-methods/country-rule-section';
import * as React from 'react';
import type { PaymentProvider, WithdrawalMethod } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection, StickyActions } from '@/components/ui/form-section';
import { LogoField } from '@/components/payment-methods/payment-method-form';
import {
  DEFAULT_ROUTE,
  RoutePicker,
  type MethodRoute,
} from '@/components/payment-providers/route-picker';
import { t } from '@/lib/i18n';

export interface WithdrawalMethodFormValues {
  /** What the DESK calls the rail — shown in place of the key, and renamable. */
  internalLabel: string;
  /** What the CLIENT sees. */
  name: string;
  /** An upload path or an https URL; empty means no logo. */
  logoUrl: string;
  enabled: boolean;
  /** Who pays it and what the client gives — sent on create only (backend 0168). */
  route: MethodRoute;
  /** Who can use it, by country of residence (backend 0178). */
  countries: CountryRuleValue;
}

/**
 * Add a withdrawal method, or edit one — its settings PAGE's form (a dialog
 * until 1 Oct 2026, when the owner asked for pages).
 *
 * Shaped like the deposit form, minus what a payout rail does not have: no
 * currency (a withdrawal is paid in its wallet's currency) and no offline-proof
 * switch (that is a deposit concern). The logo goes through the same upload.
 *
 * No KEY on this form: it is the permanent ID the API generates and never shows
 * (backend 0161). The desk types and renames the INTERNAL NAME, which every admin
 * screen shows; `name` is what a client sees. On a new rail the internal name
 * follows the display name until the operator edits it.
 */
export function WithdrawalMethodForm({
  method,
  providers,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  method?: WithdrawalMethod;
  providers?: readonly PaymentProvider[];
  saving: boolean;
  error?: string;
  onSubmit: (values: WithdrawalMethodFormValues) => void;
  onClose: () => void;
}) {
  const [route, setRoute] = React.useState<MethodRoute>(
    method
      ? { providerCode: method.providerCode, channelCode: method.channelCode }
      : DEFAULT_ROUTE.payout,
  );
  const [internalLabel, setInternalLabel] = React.useState(method?.internalLabel ?? '');
  // A NEW rail's internal name follows its display name until it is edited.
  const [labelEdited, setLabelEdited] = React.useState(method !== undefined);
  const [name, setName] = React.useState(method?.name ?? '');
  const [logoUrl, setLogoUrl] = React.useState(method?.logoUrl ?? '');
  const [enabled, setEnabled] = React.useState(method?.enabled ?? true);
  const [countries, setCountries] = React.useState<CountryRuleValue>({
    countryRule: method?.countryRule ?? null,
    countryCodes: method?.countryCodes ?? [],
  });
  const fieldId = React.useId();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      internalLabel: internalLabel.trim(),
      name: name.trim(),
      logoUrl: logoUrl.trim(),
      enabled,
      route,
      countries,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5 pb-20">
      <FormSection title={t('paymentMethods.sectionGeneral')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-label`}>{t('withdrawalMethods.internalLabel')}</Label>
            <Input
              id={`${fieldId}-label`}
              value={internalLabel}
              onChange={(event) => {
                setInternalLabel(event.target.value);
                setLabelEdited(true);
              }}
              required
              maxLength={80}
              placeholder="Bank payouts – BLOM"
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t('withdrawalMethods.internalLabelHint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-name`}>{t('withdrawalMethods.name')}</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!labelEdited) setInternalLabel(event.target.value);
              }}
              required
              maxLength={80}
              placeholder={t('withdrawalMethods.namePlaceholder')}
              className="text-xs"
            />
          </div>
        </div>

        <RoutePicker
          id={`${fieldId}-route`}
          direction="payout"
          value={route}
          onChange={setRoute}
          fixed={method !== undefined}
          providers={providers}
        />

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
      </FormSection>

      <FormSection title={t('paymentMethods.sectionWho')}>
        <CountryRuleSection bare value={countries} onChange={setCountries} />
      </FormSection>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}

      <StickyActions>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('withdrawalMethods.cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={saving}
          disabled={!name.trim() || !internalLabel.trim()}
        >
          {t('withdrawalMethods.save')}
        </Button>
      </StickyActions>
    </form>
  );
}
