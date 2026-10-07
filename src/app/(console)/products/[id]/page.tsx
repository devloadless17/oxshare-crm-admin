'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { adminApi, type IbCommissionType, type Product } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { ProductForm } from '@/components/products/product-form';
import { useSaveProduct } from '@/components/products/use-save-product';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';

/**
 * ONE PRODUCT'S SETTINGS, as a page (owner, 1 Oct 2026): name, type, commission
 * card and its MT5 groups. `/products/new` creates one.
 */
export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const creating = id === 'new';
  const { admin } = useAdmin();
  // This page IS the form, so it opens for whoever may save it — never a form
  // whose Save can only answer 403 (Oct 2026 audit).
  const maySave = hasPermission(admin, creating ? 'products.create' : 'products.edit');

  const products = useResource<Product[]>(keys.products.all(), () => adminApi.getProducts());
  const commissionTypes = useResource<IbCommissionType[]>(keys.ibCommissionTypes.all(), (signal) =>
    adminApi.getIbCommissionTypes(signal),
  );
  const product = creating ? undefined : products.data?.find((p) => p.id === id);
  const save = useSaveProduct(product?.id);
  const back = () => router.push('/products');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/products"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('products.backToList')}
      </Link>

      <AsyncBoundary
        status={maySave ? products.status : 'forbidden'}
        label={t('products.loading')}
        endpoints={['GET /admin/products']}
        onRetry={products.refetch}
        errorMessage={t('products.loadFailed')}
        error={products.error}
      >
        {!creating && !product ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t('products.notFound')}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {product ? product.name : t('products.createTitle')}
            </h1>
            <ProductForm
              key={product?.id ?? 'new'}
              product={product}
              commissionTypes={commissionTypes.data ?? []}
              saving={save.isPending}
              error={save.error}
              onClose={back}
              onSubmit={(values) =>
                save.mutate(values, {
                  onSuccess: () => {
                    toastSuccess(t('products.saveSucceeded', { name: values.name }));
                    back();
                  },
                })
              }
            />
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
