'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MonitorDown } from 'lucide-react';
import { adminApi, type PlatformLink } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { toastSuccess } from '@/lib/toast';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The trading-terminal download links clients see on their Platforms page.
 *
 * Behind `settings.manage` rather than `MasterAdminGuard`, which is the
 * opposite call from the security controls above it and deliberate: those are
 * master-only because what they switch off stands between a stolen session and
 * a balance. A download URL is routine operational content that changes with
 * every terminal build, and forcing a master admin to paste one is how the
 * master credential ends up shared.
 *
 * ## Clearing is a first-class action
 *
 * An empty field saves as null and takes the download offline. Taking a broken
 * link down is something an operator does in a hurry, and making them hunt for
 * a separate delete control is how a dead link stays up for a week.
 *
 * ## The https rule is stated, not just enforced
 *
 * The API refuses anything else, and the field says why. This value becomes an
 * `href` in every client's browser: `javascript:` here is stored XSS against
 * every client who opens the downloads page, and plain http is a channel anyone
 * on the path can rewrite — for a link whose whole purpose is delivering an
 * executable. An operator who understands that pastes more carefully than one
 * who just gets a red box.
 */

const LABELS: Record<string, MessageKey> = {
  desktop: 'platforms.desktop',
  ios: 'platforms.ios',
  android: 'platforms.android',
};

export function PlatformLinksPanel({ canManage }: { canManage: boolean }) {
  const links = useResource<PlatformLink[]>(['platform-links'], () => adminApi.getPlatformLinks());

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <MonitorDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('platforms.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('platforms.subtitle')}</p>
        {!canManage && (
          <p className="text-xs font-medium text-warning">{t('platforms.readOnly')}</p>
        )}
      </header>

      <AsyncBoundary
        status={links.status}
        label={t('platforms.loading')}
        endpoints={['GET /admin/platforms']}
        onRetry={() => void links.refetch()}
        errorMessage={apiErrorMessage(links.error, t('platforms.loadFailed'))}
        error={links.error}
      >
        <div className="space-y-4">
          {(links.data ?? []).map((link) => (
            <PlatformRow key={link.key} link={link} canManage={canManage} />
          ))}
        </div>
      </AsyncBoundary>
    </section>
  );
}

function PlatformRow({ link, canManage }: { link: PlatformLink; canManage: boolean }) {
  /*
   * Seeded from the server value and then owned by the field.
   *
   * `key` on the input is the platform key, so React keeps one input per
   * platform for the life of the panel and a refetch cannot wipe what the
   * operator is halfway through typing — which is exactly what a `value` bound
   * straight to query data would do.
   */
  const [value, setValue] = React.useState(link.url ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (url: string) => adminApi.setPlatformLink(link.key, url),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['platform-links'] });
      /*
       * The button's own "Saved ✓" is a two-second state of the CONTROL; this
       * is the console-wide record of the write, and the two are not the same
       * signal — an operator who has already tabbed to the next field sees only
       * the toast. The inline error below stays inline: it sits beside the save
       * button, clears when the field is edited, and naming a rejected field is
       * something a toast cannot do as well.
       */
      toastSuccess(t('platforms.saved'));
    },
    // The API's own message: it names the scheme it refused, which is more
    // useful than a generic failure.
    onError: (e: unknown) => setError(apiErrorMessage(e, t('platforms.updateFailed'))),
  });

  const dirty = value.trim() !== (link.url ?? '');

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`platform-${link.key}`}
        className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground"
      >
        {t(LABELS[link.key] ?? 'platforms.desktop')}
        {!link.url && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t('platforms.notConfigured')}
          </span>
        )}
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          id={`platform-${link.key}`}
          type="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          disabled={!canManage || mutation.isPending}
          placeholder={t('platforms.urlPlaceholder')}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => mutation.mutate(value.trim())}
          // Nothing to save when the field matches the server. Without this the
          // operator cannot tell whether their edit went through, because the
          // button looks identical either way.
          disabled={!canManage || mutation.isPending || !dirty}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold transition-transform duration-100 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:transform-none focus-outline"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>{t('platforms.saving')}</span>
            </>
          ) : saved ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span>{t('platforms.saved')}</span>
            </>
          ) : (
            <span>{t('platforms.save')}</span>
          )}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {value.trim() === '' ? t('platforms.clearHint') : t('platforms.httpsOnly')}
        </p>
      )}
    </div>
  );
}
