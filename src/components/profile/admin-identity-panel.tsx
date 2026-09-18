'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { authApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAdmin, type AdminProfile } from '@/context/AdminAuthContext';
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
 * ── The name is editable; the address is not ───────────────────────────────
 *
 * `PATCH /admin/auth/me` takes the display NAME and nothing else. The e-mail is
 * the login credential and the address every password-reset link is sent to, so
 * a self-service change is one request that moves the account to an inbox its
 * owner may no longer control — which is what somebody who has borrowed a
 * session would reach for first. Changing it stays `PATCH /admin/users/:id`,
 * another administrator's act.
 *
 * A display name carries none of that. It is what colleagues see beside an
 * action in the audit log, and needing an administrator to fix your own spelling
 * is the kind of friction that ends with people sharing accounts.
 */
export function AdminIdentityPanel({
  admin,
  icon: Icon,
}: {
  admin: AdminProfile;
  icon: LucideIcon;
}) {
  const { refetchAdmin } = useAdmin();
  const confirm = useConfirm();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  /*
   * `refetchAdmin()` from the context, NOT an invalidate written here.
   *
   * Every write on this panel changes a field of `/admin/auth/me`, and the
   * sidebar renders that same object — so re-asking who this is updates the
   * avatar and the name in the corner without this component knowing the
   * sidebar exists.
   *
   * The first cut called `invalidateQueries({ queryKey: ['admin-session'] })`.
   * That key does not exist: `AdminAuthContext` uses `['admin', 'me']`, so the
   * call matched nothing, resolved happily, and refetched nothing. The upload
   * succeeded, the toast appeared, and the photo did not change until a manual
   * reload — a failure with no error anywhere to explain it.
   *
   * Taking the refetch from the context rather than repeating its key is what
   * stops that recurring: the key is now named in one place, and this panel
   * cannot get it wrong because it never writes it.
   */

  const upload = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: () => {
      setError(null);
      void refetchAdmin();
      toastSuccess(t('profile.photoUpdated'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('profile.photoFailed'))),
  });

  const remove = useMutation({
    mutationFn: () => authApi.removeAvatar(),
    onSuccess: () => {
      setError(null);
      void refetchAdmin();
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
              loading={upload.isPending}
              // `busy` is wider than this one mutation — deleting the photo
              // disables it too — so it stays alongside rather than folding in.
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {/* Hidden rather than spun: Button renders its Spinner ahead of
                  the children, so leaving this in would show two marks. */}
              {!upload.isPending && <Upload className="h-4 w-4" aria-hidden="true" />}
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

      <NameForm admin={admin} onSaved={refetchAdmin} />

      <dl className="grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-2">
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
        {/*
          A null here is a real state — the column was added after these
          accounts existed, so "never recorded" is the honest reading and not
          "never changed". Stated rather than guessed, exactly as the DTO says.
        */}
        <Field
          label={t('profile.fieldPasswordChanged')}
          value={
            admin.passwordChangedAt
              ? formatDate(admin.passwordChangedAt)
              : t('profile.fieldPasswordNever')
          }
        />
      </dl>
    </section>
  );
}

/**
 * The one editable field on this panel.
 *
 * Its own component so the draft state lives with it: keeping `name` in the
 * parent would mean every avatar upload re-rendered a form somebody might be
 * halfway through typing into.
 */
function NameForm({ admin, onSaved }: { admin: AdminProfile; onSaved: () => Promise<boolean> }) {
  /*
   * Seeded from the server value and then owned by the field.
   *
   * A `value` bound straight to `admin.name` would be overwritten mid-edit by
   * the refetch that follows an avatar upload — the same pattern, and the same
   * reason, as the settings panels.
   */
  const [name, setName] = React.useState(admin.name);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  /*
   * A flash timer that OUTLIVES this component throws, rather than warning.
   *
   * `setSaved(false)` two seconds later is a state update on a component that
   * may already be gone. In a jsdom test the environment has been torn down by
   * then, so `window` is gone and it surfaces as `ReferenceError: window is not
   * defined` — an unhandled error attributed to whichever test happened to be
   * running, not to the panel that armed it. Same defect, same fix and same
   * reasoning as `rival-settings-panel.tsx`, whose comment records what it cost
   * the first time: a red gate with 965 passing tests and no failure to point at.
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile({ name: name.trim() }),
    onSuccess: (result) => {
      setError(null);
      // The API trims before storing, so the FIELD is set from what came back
      // rather than from what was typed: a form echoing its own input would
      // show " Ada " as saved when "Ada" is what every other screen shows.
      setName(result.name);
      setSaved(true);
      flashTimer.current = window.setTimeout(() => setSaved(false), 2000);
      void onSaved();
      toastSuccess(t('profile.nameSaved'));
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('profile.nameFailed'))),
  });

  // Trimmed on both sides, so trailing whitespace is not a "change" the server
  // would then discard — the button would enable and the save would do nothing.
  const dirty = name.trim() !== admin.name.trim();
  const valid = name.trim().length > 0;

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty || !valid) return;
        mutation.mutate();
      }}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="profile-name" className="text-xs">
          {t('profile.fieldName')}
        </Label>
        <Input
          id="profile-name"
          value={name}
          maxLength={100}
          autoComplete="name"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <Button type="submit" size="sm" loading={mutation.isPending} disabled={!dirty || !valid}>
        {saved && !mutation.isPending && <Check className="h-4 w-4" aria-hidden="true" />}
        {mutation.isPending
          ? t('profile.nameSaving')
          : saved
            ? t('profile.nameSavedShort')
            : t('profile.nameSave')}
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
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
