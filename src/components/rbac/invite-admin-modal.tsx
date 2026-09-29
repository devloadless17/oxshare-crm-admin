'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import api from '@/lib/api';
import type { ClientFieldGroup, ClientTagWithCount, Role } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { AdminFieldMaskPanel, AdminTagScopePanel } from './admin-visibility-panels';
import { useAdmin } from '@/context/AdminAuthContext';
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
 *
 * ## Visibility is chosen HERE, not after acceptance
 *
 * An empty scope means unrestricted, so an invitee configured only after
 * accepting sees EVERY CLIENT in the window between clicking the link and
 * somebody remembering them — the exact window `admin_invites.scoped_tag_ids`
 * exists to close. Territory, the intake grant and the mask override are
 * offered at invite time to whoever holds `admins.scope`, carried on the
 * invite row and applied before the acceptance response signs the person in.
 * The API runs the same three guards as the edit path.
 */
export function InviteAdminModal({
  open,
  roles,
  tags,
  fieldCatalog,
  canScope,
  onClose,
  onInvited,
}: {
  open: boolean;
  /** Assignable roles, already fetched by the directory. */
  roles: Role[];
  /** The tag vocabulary, FETCHED — the frontend invents no keys (R-4.5). */
  tags: ClientTagWithCount[];
  /** The maskable-field vocabulary, FETCHED — same rule. */
  fieldCatalog: Record<string, ClientFieldGroup>;
  /** `admins.scope` — the same split as the edit modal, for the same reason. */
  canScope: boolean;
  onClose: () => void;
  /** Refresh the directory — the new invite is a row in it. */
  onInvited: () => void;
}) {
  const { admin: inviter } = useAdmin();
  /*
   * The intake grant is TRUE BY DEFAULT (0058 — restriction is the explicit
   * act) — EXCEPT when the inviter cannot grant it: a scoped inviter without
   * the grant themselves gets a false default the API enforces regardless, so
   * the checkbox must show the truth rather than a tick that will not happen.
   */
  const inviterScoped = (inviter?.scopedTags?.length ?? 0) > 0;
  const canGrantIntake = !inviterScoped || (inviter?.seesUntriaged ?? false);
  // Every client is its own grant (0154), and only an inviter who has it may
  // give it — which is also what the API does with a silent invite.
  const canGrantAll = inviter?.seesAllClients ?? false;

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [roleId, setRoleId] = React.useState('');
  const [scopedTagIds, setScopedTagIds] = React.useState<string[]>([]);
  const [seesUntriaged, setSeesUntriaged] = React.useState(canGrantIntake);
  const [allClients, setAllClients] = React.useState(canGrantAll);
  /** `null` = inherit the chosen role's mask; a list = this person's override. */
  const [maskOverride, setMaskOverride] = React.useState<string[] | null>(null);
  const [result, setResult] = React.useState<{ inviteUrl?: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  /*
   * The copied-flash timer, cleared on unmount. A bare `setTimeout` here fires
   * `setCopied(false)` after the component may be gone — in jsdom that is a
   * `ReferenceError: window is not defined` blamed on an unrelated test. Same
   * fix as `payment-providers/copy-controls.tsx`.
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  /*
   * Every role is invitable, INCLUDING system ones — same reasoning as the edit
   * modal. `isSystem` bounds who may EDIT a role, never who may HOLD it, and
   * filtering it here meant a new administrator could not be invited onto the
   * only role that carries the full catalog.
   */
  const assignable = roles;
  const chosenRole = assignable.find((role) => role.id === roleId);
  // What the mask panel shows: the override, or the CHOSEN ROLE's mask through
  // the glass — picking a different role updates the inherited view live.
  const effectiveMask = maskOverride ?? chosenRole?.maskedFields ?? [];

  const toggleMaskField = (key: string) => {
    // The first toggle forks the chosen role's mask into a personal override,
    // exactly as the edit modal forks an existing admin's.
    setMaskOverride((prev) => {
      const base = prev ?? chosenRole?.maskedFields ?? [];
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  };

  const reset = () => {
    setName('');
    setEmail('');
    setRoleId('');
    setScopedTagIds([]);
    setSeesUntriaged(canGrantIntake);
    setMaskOverride(null);
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
        /*
         * Only what was actually chosen. The mask is sent only when forked, and
         * the intake grant only when it DIFFERS from the default the API will
         * apply anyway (true, or false for an inviter who cannot grant it).
         * Sending the default would demand `admins.scope` for a choice that was
         * never made.
         *
         * ⚠️ OMITTING `scopedTagIds` IS LOAD-BEARING — do not "tidy" this into
         * always sending the array. What absence means is decided by WHO IS
         * INVITING, and the API is the only place that knows:
         *
         *   unrestricted inviter, no tags picked → unrestricted invitee
         *   SCOPED inviter, no tags picked       → inherits the INVITER's territory
         *
         * Since 0154 an explicit `[]` means NO territory tags (new clients
         * only, or none) — never every client — so it is safe, but for a
         * scoped inviter who picked nothing, inheriting their territory is the
         * sensible colleague. Every client is only ever `seesAllClients`, sent
         * when the operator changed it from the default above.
         *
         * This comment previously said an empty territory is "unrestricted, the
         * absence of a choice, not a value", which is what the API did until
         * 11 Sep 2026 — and it was a privilege escalation: `createInvite` gated
         * BOTH `admins.scope` and `assertScopable` on the key being present, so
         * omitting it skipped both, and an invite with no territory produces an
         * admin with no scope rows, which means UNRESTRICTED. A scoped
         * sub-admin holding `admins.create` could mint a colleague who saw
         * every client, and this line is what sent that request.
         */
        ...(allClients !== canGrantAll ? { seesAllClients: allClients } : {}),
        ...(!allClients && (scopedTagIds.length > 0 || canGrantAll) ? { scopedTagIds } : {}),
        ...(!allClients && seesUntriaged !== canGrantIntake ? { seesUntriaged } : {}),
        ...(maskOverride !== null ? { maskedFields: maskOverride } : {}),
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
      flashTimer.current = window.setTimeout(() => setCopied(false), 2000);
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
          {/*
            THE LINK IS NOT ALWAYS THERE, and an empty box is not the way to say so.

            `inviteUrl` is echoed by the API in development and test ONLY. The
            token mints an administrator account, so echoing it in a response
            body puts a bearer credential into proxy logs, SPA memory and error
            reporters — a staging deploy was doing exactly that, which is why the
            API switched to an opt-IN allowlist of environments.

            This block rendered the code element and the Copy button
            unconditionally, so in production an operator got an empty grey box
            and a Copy button that copied '' — reported as "the copy link shows
            nothing". The invite itself had been emailed and was perfectly valid;
            only this panel was lying about it.

            So the panel now says which of the two happened. The link is shown
            when the API supplied one, and otherwise the operator is told the
            email is the delivery route — which is the truth, and is also the
            behaviour that keeps the credential out of the response.
          */}
          {result.inviteUrl ? (
            <>
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
            </>
          ) : (
            <p className="text-muted-foreground">{t('invite.emailedOnly')}</p>
          )}
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

          {canScope && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="font-semibold">{t('adminUsers.scopeSection')}</p>
              <AdminTagScopePanel
                tags={tags}
                selected={scopedTagIds}
                onToggle={(tagId) =>
                  setScopedTagIds((prev) =>
                    prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                  )
                }
                allClients={allClients}
                onAllClientsChange={setAllClients}
                canGrantAll={canGrantAll}
                disabled={loading}
              />
              {!allClients && (
                <div className="border-t border-border pt-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={seesUntriaged}
                      onChange={(e) => setSeesUntriaged(e.target.checked)}
                      // Locked when the inviter cannot grant it — the API would
                      // refuse, and a tick that cannot happen is a lie.
                      disabled={loading || !canGrantIntake}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <span>
                      {t('adminUsers.seesUntriaged')}
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                        {canGrantIntake
                          ? t('adminUsers.seesUntriagedHint')
                          : t('adminUsers.seesUntriagedLockedOwn')}
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {canScope && roleId && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="font-semibold">
                {t('adminUsers.maskSection')}
                <span className="ms-2 font-normal text-[11px] text-muted-foreground">
                  {maskOverride === null
                    ? t('adminUsers.maskSummaryInherited')
                    : effectiveMask.length === 0
                      ? t('adminUsers.maskSummaryNone')
                      : t('adminUsers.maskSummary', { count: effectiveMask.length })}
                </span>
              </p>
              <AdminFieldMaskPanel
                catalog={fieldCatalog}
                selected={effectiveMask}
                onToggle={toggleMaskField}
                disabled={loading}
                inheriting={maskOverride === null}
                onResetToRole={() => setMaskOverride(null)}
              />
            </div>
          )}

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
