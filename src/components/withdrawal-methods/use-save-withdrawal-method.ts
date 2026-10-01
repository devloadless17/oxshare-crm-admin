import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { keys } from '@/lib/query-keys';
import type { WithdrawalMethodFormValues } from './withdrawal-method-form';

/** Create or update a withdrawal method from its settings page. Every form field is listed. */
export function useSaveWithdrawalMethod(editingKey: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: WithdrawalMethodFormValues) => {
      const body = {
        internalLabel: values.internalLabel,
        name: values.name,
        logoUrl: values.logoUrl === '' ? undefined : values.logoUrl,
        enabled: values.enabled,
        // Who can use it (backend 0178) — always sent, so clearing it saves.
        countryRule: values.countries.countryRule,
        countryCodes: values.countries.countryCodes,
      };
      // No key is ever sent: the API generates a new rail's permanent ID (0161).
      // The route is chosen once, at creation, and fixed after (backend 0168).
      return editingKey
        ? api.admin.updateWithdrawalMethod(editingKey, body)
        : api.admin.createWithdrawalMethod({
            ...body,
            providerCode: values.route.providerCode,
            channelCode: values.route.channelCode,
          });
    },
    // A provider's page lists its methods, so a method change moves it too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.withdrawalMethods.all() }),
        queryClient.invalidateQueries({ queryKey: keys.paymentProviders.all() }),
      ]),
  });
}
