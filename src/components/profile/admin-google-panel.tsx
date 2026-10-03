'use client';

import { useMutation } from '@tanstack/react-query';
import { Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { GoogleMark } from '@/components/auth/google-sign-in-button';
import { useAdmin, type AdminProfile } from '@/context/AdminAuthContext';
import { authApi } from '@/lib/api/auth';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * The caller's linked Google account — "linked as x@y (Unlink)", or how to
 * link one. There is no "Link" button on purpose: a link is made by signing in
 * with Google once, which is what proves the Google account is theirs.
 */
export function AdminGooglePanel({ admin }: { admin: AdminProfile }) {
  const { refetchAdmin } = useAdmin();
  const confirm = useConfirm();

  const unlink = useMutation({
    mutationFn: () => authApi.unlinkGoogle(),
    onSuccess: async () => {
      // The link is part of the `me` identity, so it is re-read rather than
      // patched in place.
      await refetchAdmin();
      toastSuccess(t('profile.googleUnlinked'));
    },
    onError: (e: unknown) => toastError(e, t('profile.googleUnlinkFailed')),
  });

  const onUnlink = async () => {
    const ok = await confirm({
      title: t('profile.googleUnlinkTitle'),
      description: t('profile.googleUnlinkBody', { email: admin.googleEmail ?? '' }),
      confirmLabel: t('profile.googleUnlink'),
      destructive: true,
    });
    if (ok) unlink.mutate();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <GoogleMark className="h-4 w-4" />
        {t('profile.googleTitle')}
      </h2>
      {admin.googleEmail ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">
              {t('profile.googleLinked', { email: admin.googleEmail })}
            </p>
            {admin.googleLinkedAt && (
              <p className="text-[11px] text-muted-foreground">
                {t('profile.googleLinkedSince', {
                  when: new Date(admin.googleLinkedAt).toLocaleDateString(),
                })}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={unlink.isPending}
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void onUnlink()}
          >
            {!unlink.isPending && <Unlink className="h-4 w-4" aria-hidden="true" />}
            {t('profile.googleUnlink')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('profile.googleNotLinked')}</p>
      )}
    </section>
  );
}
