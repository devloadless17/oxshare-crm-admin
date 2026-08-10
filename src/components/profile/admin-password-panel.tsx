'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/** The server's floor, mirrored so the button can say so before the round trip. */
const MIN_LENGTH = 8;

/**
 * Change your own password.
 *
 * ── What happens to the session, and why nothing here reacts to it ─────────
 *
 * A successful change revokes EVERY refresh-token family, including this
 * browser's, and stamps a cutoff that invalidates every access token issued
 * before it. The caller keeps working because the server issues a brand-new
 * session on the same response — they are given something new, not spared. So
 * there is no sign-out to handle here and no redirect to perform: the cookies
 * are replaced before this promise resolves.
 *
 * The visible consequence is on the OTHER panel: every other session disappears
 * from the list, which is why `['admin-sessions']` is invalidated below. Leaving
 * it stale would show devices that had just been signed out as still live —
 * precisely the wrong answer for somebody who changed their password because
 * they suspected one of them.
 *
 * ── No zod, and no client-side rule beyond the length ──────────────────────
 *
 * Per the repo convention: `class-validator` on the server is the authoritative
 * gate, and a second copy of every rule drifts from it. The length check below
 * is not a copy of a policy — it is what lets the button be disabled instead of
 * inviting a round trip that is certain to fail. Everything else (is the current
 * password right, is the new one actually different) is the server's answer, and
 * it is rendered verbatim.
 */
export function AdminPasswordPanel({ icon: Icon }: { icon: LucideIcon }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: (result) => {
      setError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // The other sessions are gone as of this response — see above.
      void queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      toastSuccess(t('profile.passwordChanged'), result.message);
    },
    // The API's own message: it distinguishes "current password is not correct"
    // from "must be different from your current one", and a generic failure
    // string would collapse two very different mistakes into one.
    onError: (e: unknown) => setError(apiErrorMessage(e, t('profile.passwordFailed'))),
  });

  /*
   * The confirmation field is checked HERE and only here, deliberately.
   *
   * The server has no second field to compare against — it takes one
   * `newPassword` — so this is not a duplicated rule. It is a typo guard on an
   * input the operator cannot read back, and the one piece of validation that
   * genuinely has no server counterpart.
   */
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const ready =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    confirmPassword === newPassword;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('profile.passwordTitle')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('profile.passwordSubtitle')}
        </p>
      </header>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          mutation.mutate();
        }}
      >
        {/*
         * `autoComplete` values a password manager actually understands.
         * Without `new-password` on the second field, managers offer to fill the
         * EXISTING password into it — which the server then rejects as
         * unchanged, and the operator cannot see why.
         */}
        <Field
          id="current-password"
          label={t('profile.currentPassword')}
          value={currentPassword}
          autoComplete="current-password"
          onChange={(v) => {
            setCurrentPassword(v);
            setError(null);
          }}
        />
        <Field
          id="new-password"
          label={t('profile.newPassword')}
          value={newPassword}
          autoComplete="new-password"
          hint={t('profile.passwordHint')}
          onChange={(v) => {
            setNewPassword(v);
            setError(null);
          }}
        />
        <Field
          id="confirm-password"
          label={t('profile.confirmPassword')}
          value={confirmPassword}
          autoComplete="new-password"
          onChange={(v) => {
            setConfirmPassword(v);
            setError(null);
          }}
        />

        {tooShort && (
          <p className="text-xs font-medium text-warning">
            {t('profile.passwordTooShort', { min: MIN_LENGTH })}
          </p>
        )}
        {mismatch && (
          <p className="text-xs font-medium text-warning">{t('profile.passwordMismatch')}</p>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="sm" disabled={!ready || mutation.isPending}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {mutation.isPending ? t('profile.passwordSaving') : t('profile.passwordSave')}
        </Button>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  hint,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
