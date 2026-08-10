'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { authApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { t } from '@/lib/i18n';

/** What the file picker offers, matching the bucket the server will accept. */
const ACCEPTED = 'image/jpeg,image/png,image/webp';

/**
 * The 2MB ceiling, checked here as well as by the interceptor and the service.
 *
 * Not redundancy for its own sake: without it a 30MB photo is uploaded in full
 * before the server can reject it, so the operator waits through the transfer to
 * be told it was never going to work. The server keeps its own check because
 * this one is advice, not enforcement — anything can post to the endpoint.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Who you are signed in as, and the photo that stands for it.
 *
 * ── Why the role is read-only here ─────────────────────────────────────────
 *
 * A profile screen that let somebody edit their own role would be a privilege
 * escalation with a friendly form around it. The server refuses it —
 * `AdminRbacService` begins every method by rejecting self-service — and this
 * panel does not offer it, so the two agree rather than one silently catching
 * the other.
 *
 * The name and e-mail are read-only for a narrower reason: nothing on the admin
 * API can change them. `PATCH /admin/users/:id` is somebody else acting on you.
 * Rendering an editable field over an endpoint that does not exist is the
 * "never render mock data" rule applied to a form.
 */
export function AdminIdentityPanel({
  admin,
  icon: Icon,
}: {
  admin: AdminProfile;
  icon: LucideIcon;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  /*
   * Both mutations invalidate the SESSION query, not a local piece of state.
   *
   * The avatar is on `/admin/auth/me`, so the sidebar reads it from the same
   * cache this panel writes to — which is what makes the photo in the corner
   * update the moment it is replaced, without this component knowing the
   * sidebar exists.
   */
  const refreshSession = () => queryClient.invalidateQueries({ queryKey: ['admin-session'] });

  const upload = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: () => {
      setError(null);
      void refreshSession();
      toastSuccess(t('profile.photoUpdated'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('profile.photoFailed'))),
  });

  const remove = useMutation({
    mutationFn: () => authApi.removeAvatar(),
    onSuccess: () => {
      setError(null);
      void refreshSession();
      toastSuccess(t('profile.photoRemoved'));
    },
    onError: (e: unknown) => toastError(e, t('profile.photoRemoveFailed')),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t('profile.photoTooLarge'));
      return;
    }
    upload.mutate(file);
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('profile.identityTitle')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('profile.identitySubtitle')}
        </p>
      </header>

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {/*
           * `AvatarImage` renders nothing until the bytes have loaded, so a slow
           * or 404'd photo shows initials rather than a broken-image glyph.
           * That matters more here than anywhere else: the URL is guarded, and
           * a session that has just expired answers 401 for the image too.
           */}
          <AvatarImage src={avatarSrc(admin.avatarUrl)} alt="" />
          <AvatarFallback className="text-lg">{initialsFor(admin.name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                /*
                 * Cleared so choosing the SAME file twice fires `change` again.
                 * Without it, an operator whose first upload failed on the
                 * server has to pick a different file to retry the one they
                 * wanted — the input's value is unchanged, so no event fires.
                 */
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {admin.avatarUrl ? t('profile.photoReplace') : t('profile.photoUpload')}
            </Button>

            {admin.avatarUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() =>
                  void (async () => {
                    const ok = await confirm({
                      title: t('profile.photoRemoveTitle'),
                      description: t('profile.photoRemoveBody'),
                      confirmLabel: t('profile.photoRemoveConfirm'),
                      destructive: true,
                    });
                    if (ok) remove.mutate();
                  })()
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('profile.photoRemove')}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('profile.photoHint')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <dl className="grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-2">
        <Field label={t('profile.fieldName')} value={admin.name} />
        <Field label={t('profile.fieldEmail')} value={admin.email} />
        <Field
          label={t('profile.fieldRole')}
          /*
           * The role NAME, or a stated absence — never the id and never a
           * fallback to the e-mail. An administrator on no role is a real
           * state, and it is a state worth showing plainly because it is
           * usually a mistake somebody should fix.
           */
          value={admin.roleName ?? t('nav.noRole')}
        />
        <Field
          label={t('profile.fieldStatus')}
          value={
            <Badge variant={admin.status === 'active' ? 'success' : 'destructive'}>
              {admin.status === 'active' ? t('profile.statusActive') : t('profile.statusSuspended')}
            </Badge>
          }
        />
        <Field
          label={t('profile.fieldPermissions')}
          value={t('profile.permissionCount', { count: admin.permissions?.length ?? 0 })}
        />
        <Field label={t('profile.fieldCreated')} value={formatDate(admin.createdAt)} />
      </dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** A date, or an em dash. Never "Invalid Date", which is what `new Date(undefined)` renders. */
function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
