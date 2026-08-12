'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useResource } from '@/hooks/use-resource';
import { adminApi, type AvailableGroup, type Product } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * The MT5 groups behind one product.
 *
 * ## Why this is a modal and not a column
 *
 * A product has several groups — one per currency per environment — so it does
 * not fit a cell, and the operations on them are attach and detach rather than
 * edit. The table shows the COUNT and this is where the list lives.
 *
 * ## The picker offers only what the server has
 *
 * `GET /admin/products/mt5-groups` reads the broker's live list, so the group
 * is chosen rather than typed. Groups another product already claims are shown
 * DISABLED with the reason rather than filtered out: "the broker does not offer
 * that" and "ECN already has it" are different problems, and hiding the second
 * sends an operator hunting for a group they can see in their own terminal.
 *
 * The list is fetched when this opens, not with the page — it is a live round
 * trip to the broker, and most visits to the products table do not need it.
 */
export function ProductGroupsModal({
  product,
  canManage,
  onClose,
}: {
  product: Product;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = React.useState<'live' | 'demo'>('demo');
  const [mt5Group, setMt5Group] = React.useState('');
  const [error, setError] = React.useState<unknown>(null);

  const groups = useResource<AvailableGroup[]>(['admin', 'available-groups'], () =>
    adminApi.getAvailableGroups(),
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'available-groups'] });
  };

  const attach = useMutation({
    mutationFn: () => adminApi.attachProductGroup(product.id, { environment, mt5Group }),
    onSuccess: async () => {
      setError(null);
      setMt5Group('');
      await invalidate();
      toastSuccess(t('products.attached'));
    },
    onError: (cause: unknown) => setError(cause),
  });

  const detach = useMutation({
    mutationFn: (groupId: string) => adminApi.detachProductGroup(product.id, groupId),
    onSuccess: async () => {
      setError(null);
      await invalidate();
      toastSuccess(t('products.detached'));
    },
    onError: (cause: unknown) => setError(cause),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('products.groupsTitle', { name: product.name })}
    >
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('products.groupsExplainer')}
        </p>

        {product.groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            {t('products.noGroups')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {product.groups.map((group) => (
              <li
                key={group.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <Badge variant={group.environment === 'live' ? 'default' : 'tag'}>
                  {group.environment === 'live' ? t('products.live') : t('products.demo')}
                </Badge>
                <span className="font-mono">{group.mt5Group}</span>
                {/* An empty currency is the imported-from-env case: the group
                      was carried over without one, and MT5 supplies it live. */}
                <span className="text-muted-foreground">{group.currency || '—'}</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => detach.mutate(group.id)}
                    disabled={detach.isPending}
                    aria-label={t('products.detach')}
                    className="ml-auto cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50 focus-outline"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold">{t('products.environment')}</span>
                <Select
                  value={environment}
                  onValueChange={(value) => setEnvironment(value as 'live' | 'demo')}
                >
                  <SelectTrigger id="group-environment" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">{t('products.demo')}</SelectItem>
                    <SelectItem value="live">{t('products.live')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold">{t('products.mt5Group')}</span>
                <Select value={mt5Group} onValueChange={setMt5Group}>
                  <SelectTrigger id="group-path" className="h-9 text-xs">
                    <SelectValue placeholder={t('products.chooseGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.data?.map((group) => (
                      <SelectItem key={group.name} value={group.name} disabled={group.claimed}>
                        {group.name}
                        {group.currency ? ` · ${group.currency}` : ''}
                        {group.claimed ? ` — ${t('products.claimed')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {groups.status === 'error' && (
              <p className="text-[11px] leading-relaxed text-destructive">
                {t('products.groupsUnavailable')}
              </p>
            )}

            {error !== null && error !== undefined && (
              <p role="alert" className="text-[11px] leading-relaxed text-destructive">
                {apiErrorMessage(error, t('products.attachFailed'))}
              </p>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => attach.mutate()}
              disabled={!mt5Group || attach.isPending}
            >
              {attach.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {t('products.attachConfirm')}
            </Button>
          </div>
        )}

        <div className="flex justify-end border-t border-border pt-3">
          <Button type="button" size="sm" onClick={onClose}>
            {t('products.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
