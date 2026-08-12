'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { adminApi, type Agency, type Product } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Which products an agency sells.
 *
 * ## The most consequential control in the console
 *
 * It decides what every client under every partner on this agency may open. The
 * API records the product NAMES before and after in the audit log for that
 * reason, and this saves the COMPLETE set rather than a delta — two operators
 * doing add-then-remove against a delta endpoint leave a set neither chose.
 *
 * ## Two warnings that are cheaper here than in a support ticket
 *
 * An EMPTY set is legal and means partners on this agency have clients who can
 * open nothing. A product with NO MT5 GROUP is the same problem one level down:
 * it can be ticked, and it still cannot be opened by anybody.
 */
export function AgencyProductsModal({
  agency,
  products,
  canManage,
  onClose,
}: {
  agency: Agency;
  products: Product[];
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  /*
   * Seeded from the row and then owned by the checkboxes. Bound straight to
   * query data, a background refetch would undo ticks the operator has made
   * and not yet saved.
   */
  const [selected, setSelected] = React.useState<string[]>(agency.productIds);
  const [error, setError] = React.useState<unknown>(null);

  const save = useMutation({
    mutationFn: () => adminApi.setAgencyProducts(agency.id, selected),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      toastSuccess(t('agencies.productsSaved'));
      onClose();
    },
    onError: (cause: unknown) => setError(cause),
  });

  const dirty =
    selected.length !== agency.productIds.length ||
    selected.some((id) => !agency.productIds.includes(id));

  const toggle = (id: string) => {
    setError(null);
    setSelected((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
  };

  return (
    <Modal open onClose={onClose} title={t('agencies.productsTitle', { name: agency.name })}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('agencies.productsExplainer')}
        </p>

        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            {t('agencies.noProductsExist')}
          </p>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={product.id} className="flex items-start gap-2.5">
                <Checkbox
                  id={`agency-product-${product.id}`}
                  checked={selected.includes(product.id)}
                  onCheckedChange={() => toggle(product.id)}
                  disabled={!canManage}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`agency-product-${product.id}`}
                  className="cursor-pointer space-y-0.5"
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                    {product.name}
                    {!product.enabled && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {t('products.disabled')}
                      </span>
                    )}
                    {product.groups.length === 0 && (
                      <span className="text-[10px] font-normal text-warning">
                        {t('agencies.productNoGroups')}
                      </span>
                    )}
                  </span>
                  {product.description && (
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {product.description}
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}

        {selected.length === 0 && products.length > 0 && (
          <p className="text-[11px] leading-relaxed text-warning">{t('agencies.sellsNothing')}</p>
        )}

        {error !== null && error !== undefined && (
          <p role="alert" className="text-[11px] leading-relaxed text-destructive">
            {apiErrorMessage(error, t('agencies.productsFailed'))}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('agencies.cancel')}
          </Button>
          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('agencies.saveProducts')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
