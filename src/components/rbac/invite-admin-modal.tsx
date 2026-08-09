'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import api from '@/lib/api';
import type { Role } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite an administrator — a modal on the directory, not a page of its own.
 *
 * ## Why it stopped being a route
 *
 * `/invite` was a full-page form with its own hand-written `styled-jsx` card,
 * reached by leaving the directory. Every one of its outcomes belongs to the
 * list you left: the invite becomes a `pending` row there, and the first thing
 * anyone does after sending one is look at it. Sending two in a row meant two
 * round trips through a route that shows nothing else.
 *
 * It also had a second cost that is easy to miss: it was the only screen in the
 * console styled by a private `<style jsx>` block, so it drifted from the theme
 * on its own schedule — its own border radius, its own error box, its own
 * button. The modal is built from the same `Modal`, `Select` and form styles as
 * every other write in this app.
 *
 * ## The link is shown, not just emailed
 *
 * `POST /admin/invite` sends the mail AND returns the URL. Mail to a fresh
 * corporate address is the single most likely thing to land in a spam
 * quarantine nobody checks, and the invite dies in 48 hours — so the link is on
 * screen to copy, and that is worth the modal staying open after success.
 */
export function InviteAdminModal({
  open,
  roles,
  onClose,
  onInvited,
}: {
  open: boolean;
  /** Assignable roles, already fetched by the directory. */
  roles: Role[];
  onClose: () => void;
  /** Refresh the directory — the new invite is a row in it. */
  onInvited: () => void;
}) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [roleId, setRoleId] = React.useState('');
  const [result, setResult] = React.useState<{ inviteUrl?: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const assignable = roles.filter((role) => !role.isSystem);

  const reset = () => {
    setName('');
    setEmail('');
    setRoleId('');
    setResult(null);
    setError('');
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedName) {
      setError(t('invite.bothRequired'));
      return;
    }
    /*
     * The ONLY client-side rule here, and it is a format check rather than a
     * business one. Whether this address may be invited — already an admin,
     * already a client, already holding an outstanding invite — is decided by
     * the API, which owns the tables that answer it. A second copy of those
     * rules on this side would drift from them, and each refusal reaches the
     * operator verbatim through `apiErrorMessage` below.
     */
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError(t('invite.invalidEmail'));
      return;
    }
    /*
     * A ROLE IS REQUIRED. There is no "default" option any more.
     *
     * Sending no `roleId` makes the API fall back to a built-in permission list
     * (`kyc.review` + `users.view`) and create an administrator with no role at
     * all — the same per-person grant the edit modal stopped offering. It
     * arrived by not choosing, which is the worst way to acquire an access
     * level nobody can later find by looking at the roles screen.
     */
    if (!roleId) {
      setError(t('invite.roleRequired'));
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Typed, not `api.post` with a hand-written shape — the request and the
      // response are both aliases of the generated schema, so a backend rename
      // is a compile error here rather than a runtime surprise.
      const created = await api.admin.createInvite({
        name: trimmedName,
        email: trimmedEmail,
        roleId,
      });
      setResult(created);
      setCopied(false);
      setName('');
      setEmail('');
      onInvited();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('invite.createFailed')));
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result?.inviteUrl ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (a non-secure context, typically) — the link
      // is on screen and selectable, so say that rather than failing silently.
      setError(t('invite.copyFailed'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('invite.title')}
      description={result ? undefined : t('invite.modalHint')}
      footer={
        result ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="focus-outline h-9 rounded-lg border border-input bg-card px-4 text-xs font-semibold hover:bg-muted"
            >
              {t('invite.sendAnother')}
            </button>
            <button
              type="button"
              onClick={close}
              className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={loading}
              className="focus-outline h-9 rounded-lg border border-input bg-card px-4 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="invite-admin-form"
              disabled={loading}
              aria-busy={loading}
              className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t('invite.creating') : t('invite.createSubmit')}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-xs" aria-live="polite">
          <p className="font-semibold text-success">{t('invite.created')}</p>
          <p className="text-muted-foreground">{t('invite.sentNote')}</p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
            {/* Selectable, so it still works when the clipboard API does not. */}
            <code className="min-w-0 flex-1 break-all text-[11px] text-link select-all">
              {result.inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="focus-outline inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-[11px] font-semibold hover:bg-muted"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          {error && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <form id="invite-admin-form" onSubmit={(e) => void submit(e)} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold" htmlFor="invite-name">
              {t('invite.fullName')}
            </label>
            <input
              id="invite-name"
              type="text"
              autoComplete="off"
              placeholder={t('invite.namePlaceholder')}
              value={name}
              onChange={(e) => {
                setError('');
                setName(e.target.value);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="invite-email">
              {t('invite.email')}
            </label>
            <input
              id="invite-email"
              /*
               * `type="email"` but NOT `required`: the form's own "both fields
               * are required" branch is the one that runs, and a native
               * `required` would block submit before it could — which is also
               * why the page's version of this check was unreachable.
               */
              type="email"
              autoComplete="off"
              placeholder={t('invite.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setError('');
                setEmail(e.target.value);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="invite-role">
              {t('invite.role')}
            </label>
            {assignable.length === 0 ? (
              /*
               * No assignable role exists, so there is nothing to invite anyone
               * INTO. Said plainly with the way out, rather than rendering an
               * empty select: the invite cannot be completed until somebody
               * creates a role, and that is a different screen.
               */
              <p className="mt-1 text-[11px] text-muted-foreground">{t('invite.noRoles')}</p>
            ) : (
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger id="invite-role" className="mt-1 h-9 w-full text-xs">
                  <SelectValue placeholder={t('invite.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
