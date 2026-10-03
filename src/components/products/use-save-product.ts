import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { keys } from '@/lib/query-keys';
import type { ProductFormValues } from './product-form';

export function useSaveProduct(editingId: string | undefined) {
  const queryClient = useQueryClient();
  // The MT5 groups mirror names each group's products, so it moves with them.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.products.all() }),
      queryClient.invalidateQueries({ queryKey: keys.mt5Groups.all() }),
    ]);
  /**
   * Save the product AND reconcile its groups.
   *
   * ## Not atomic, and it says so rather than pretending
   *
   * The API has no endpoint that takes a product and its groups together —
   * attaching validates each group against the live MT5 server, one request
   * each — so this is a write followed by N more. A group that fails to attach
   * leaves the product saved and the rest of its groups attached, which is why
   * the failure is reported with the group named rather than as "save failed".
   *
   * Detaching happens BEFORE attaching, deliberately. A product holds one group
   * per currency, so swapping its USD group for another in one edit only works
   * if the old one is released first.
   *
   * ## Reconciled against the SERVER's groups, never the ones the form opened with
   *
   * The create/update answer carries the product's groups as the database has
   * them right now, and that is what the wanted list is compared with. The form's
   * opening copy goes stale the moment a save half-succeeds: a detach that went
   * through before an attach was refused would be detached AGAIN on the retry,
   * and the retry would fail with "That group is not attached" every time until
   * the dialog was closed.
   */
  return useMutation({
    mutationFn: async (values: ProductFormValues) => {
      /*
       * `groups` is stripped rather than passed through. The product DTO has no
       * such field and the API runs `forbidNonWhitelisted`, so sending it fails
       * the whole save with "property groups should not exist" instead of being
       * ignored — the groups travel on their own endpoints below.
       */
      const { groups: wantedGroups, ...product } = values;

      /*
       * `type` travels on CREATE only. It is fixed at creation and the API
       * refuses a differing value on update — omitting it entirely cannot
       * conflict, where echoing a stale one could.
       */
      const { type: _type, ...withoutType } = product;
      const saved = editingId
        ? await adminApi.updateProduct(editingId, withoutType)
        : await adminApi.createProduct(product);

      // MT5 group paths match case-insensitively, as they do on the server.
      const key = (mt5Group: string) => mt5Group.toLowerCase();
      const current = saved.groups;
      const wanted = new Set(wantedGroups.map((group) => key(group.mt5Group)));
      const present = new Set(current.map((group) => key(group.mt5Group)));

      for (const group of current) {
        if (!wanted.has(key(group.mt5Group))) {
          await adminApi.detachProductGroup(saved.id, group.id);
        }
      }

      for (const group of wantedGroups) {
        if (present.has(key(group.mt5Group))) continue;
        await adminApi.attachProductGroup(saved.id, {
          environment: group.environment,
          mt5Group: group.mt5Group,
        });
      }

      return saved;
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: keys.products.availableGroups() });
    },
    // Inline in the modal, which stays open — the refusals here name the field,
    // or the group MT5 would not accept. The table is refreshed all the same:
    // a save that half-succeeded changed real rows, and the list must show them.
    onError: () => invalidate(),
  });
}
