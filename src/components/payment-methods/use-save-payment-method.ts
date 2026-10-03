import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { arabicOrNull } from '@/components/arabic-text-field';
import type { PaymentMethodFormValues } from './payment-method-form';

/**
 * Create or update a deposit method from the settings page.
 *
 * ⚠️ EVERY FIELD ON THE FORM MUST BE LISTED HERE, and nothing checks it: the
 * update DTO's fields are all OPTIONAL, so a field left out is not a type error
 * — it is a save that returns 200 and changes nothing (how `requiresProof` once
 * stayed false in production). Built field by field on purpose; a spread would
 * ship whatever the form happens to hold.
 */
export function useSavePaymentMethod(editingKey: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PaymentMethodFormValues) => {
      const body = {
        internalLabel: values.internalLabel,
        name: values.name,
        // Always sent: `null` clears a stored translation.
        nameAr: values.nameAr,
        currency: values.currency,
        // Omitted rather than blank: `''` would store an empty logo where none means null.
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
        requiresProof: values.requiresProof,
        // The method's own range (0162) — null clears it back to the currency's.
        ownMinAmount: values.ownMinAmount,
        ownMaxAmount: values.ownMaxAmount,
        // The details an offline method asks for — the whole list, in order.
        proofFields: values.proofFields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
          enabled: field.enabled,
          hint: field.hint,
          labelAr: arabicOrNull(field.labelAr ?? ''),
          hintAr: arabicOrNull(field.hintAr ?? ''),
        })),
        // Who can use it (backend 0178) — always sent, so clearing it saves.
        countryRule: values.countries.countryRule,
        countryCodes: values.countries.countryCodes,
      };
      // No key is ever sent: the API generates a new method's permanent ID (0161).
      if (editingKey) return api.admin.updatePaymentMethod(editingKey, body);
      // The route is chosen once, at creation, and fixed after (backend 0168).
      return api.admin.createPaymentMethod({
        ...body,
        providerCode: values.route.providerCode,
        channelCode: values.route.channelCode,
      });
    },
    // A provider's page lists its methods, so a method change moves it too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.paymentMethods.all() }),
        queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() }),
      ]),
  });
}
