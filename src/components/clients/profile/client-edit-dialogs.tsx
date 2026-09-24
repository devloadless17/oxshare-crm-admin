'use client';

import { isMasked } from '@/lib/masking';
import { EyeOff } from 'lucide-react';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * CORE-18's two client edits, and they are deliberately two dialogs.
 *
 * Correcting a surname and changing the address an account signs in with are
 * different in kind, not in degree: the second is an account-takeover primitive
 * — point it at your own inbox, run a password reset, take the balance — which
 * is why the API gates them on separate permissions (`clients.edit` and
 * `clients.email`).
 *
 * Putting the email field inside the profile form would have quietly undone
 * that: one form, one save button, and an operator who only meant to fix a typo
 * carrying the dangerous field along in the same request. Two dialogs keep the
 * dangerous one behind its own menu item, its own permission check, and its own
 * statement of what is about to happen.
 *
 * Neither is the enforcement. Each endpoint carries `@RequirePermissions` and
 * refuses regardless of what this renders — ARCHITECTURE §8.8.
 */

const FIELD =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Both dialogs change what the profile query returns.
 *
 * The key is `['client', id]` — the exact key `clients/[id]/page.tsx` registers
 * and every sibling (actions menu, partner dialogs) invalidates. This function
 * once said `['admin', 'client', id]`, which matched NOTHING: the save
 * succeeded, the invalidation was a no-op, and the header kept showing the old
 * name/email until a manual reload.
 */
async function refreshProfile(
  queryClient: ReturnType<typeof useQueryClient>,
  clientId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: keys.clients.detail(clientId) });
}

/* ── Profile ──────────────────────────────────────────────────────────────── */

/**
 * Name, phone and country — the clerical set.
 *
 * Sends only the fields that actually CHANGED. A PATCH that echoed every value
 * back would make this form's stale copy of a phone number overwrite whatever
 * another screen wrote a second ago, and the API would record four changes
 * every time somebody fixed one.
 */
export function EditClientProfileDialog({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: ClientProfile;
}) {
  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.editProfileTitle')}>
      {/*
        MOUNTED PER OPENING, and that is what seeds the fields.
        A form kept mounted across openings shows whatever was typed and
        abandoned last time — on a different client, if the operator moved on.
        Remounting lets `useState` initialisers be the single source of the
        starting values, with no effect resetting them afterwards.
      */}
      {open ? <ProfileForm profile={profile} onClose={onClose} /> : null}
    </Modal>
  );
}

/**
 * Said under a field the operator may not read, instead of leaving an empty box.
 *
 * An empty box is the wrong message twice over: it reads as "this client has no
 * last name", and it invites a correction that would overwrite a value the
 * operator cannot see. The input is disabled for the same reason.
 */
function MaskedFieldNote() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <EyeOff className="h-3 w-3" aria-hidden="true" />
      {t('clientProfile.fieldHiddenFromYou')}
    </span>
  );
}

function ProfileForm({ profile, onClose }: { profile: ClientProfile; onClose: () => void }) {
  const queryClient = useQueryClient();

  /*
   * WHICH FIELDS THIS OPERATOR MAY NOT SEE (RBAC-03).
   *
   * A masked field is REMOVED from the payload, so `profile.lastName` is
   * `undefined` and the box rendered EMPTY — indistinguishable from a client
   * who genuinely has no last name. Two things went wrong from there:
   *
   *   1. `required` on an empty box the operator cannot see the value of meant
   *      the form REFUSED TO SUBMIT until they typed something into it. To
   *      change a phone number they had to overwrite a last name they were not
   *      allowed to read. The mask coerced the exact corruption it exists to
   *      prevent.
   *
   *   2. Even without `required`, an empty box invites a correction to a field
   *      that already has a value.
   *
   * The patch builder below only ever sent CHANGED fields, so an untouched
   * masked field was never transmitted — the stored value survived. That is the
   * one thing this was already getting right, and it is why this is a usability
   * and integrity defect rather than a data-loss one.
   */
  const maskedFirstName = isMasked('client.firstName', profile.maskedFields);
  const maskedLastName = isMasked('client.lastName', profile.maskedFields);
  const maskedPhone = isMasked('client.phone', profile.maskedFields);
  const maskedCountry = isMasked('client.country', profile.maskedFields);

  const [firstName, setFirstName] = React.useState(profile.firstName ?? '');
  const [lastName, setLastName] = React.useState(profile.lastName ?? '');
  const [phone, setPhone] = React.useState(profile.phone ?? '');
  const [country, setCountry] = React.useState(profile.country ?? '');

  /*
   * Only what CHANGED, and never a masked field. The masked guards are belt and
   * braces — a masked input is disabled, so it cannot change — but they state
   * the rule at the point the request is built, where a future edit to the
   * rendering cannot quietly break it.
   */
  const changed = {
    ...(!maskedFirstName && firstName !== (profile.firstName ?? '') ? { firstName } : {}),
    ...(!maskedLastName && lastName !== (profile.lastName ?? '') ? { lastName } : {}),
    ...(!maskedPhone && phone !== (profile.phone ?? '') ? { phone } : {}),
    ...(!maskedCountry && country !== (profile.country ?? '') ? { country } : {}),
  };
  const hasChanges = Object.keys(changed).length > 0;

  const save = useMutation({
    mutationFn: () => api.admin.updateClientProfile(profile.id, changed),
    onSuccess: async () => {
      await refreshProfile(queryClient, profile.id);
      toastSuccess(t('clientProfile.editProfileSaved'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.editProfileFailed')),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasChanges) save.mutate();
      }}
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('clientProfile.editProfileBody')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldFirstName')}
          </span>
          <input
            value={maskedFirstName ? '' : firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required={!maskedFirstName}
            maxLength={100}
            /* Disabled when masked: the operator cannot see what is there, so
               they must not be able to replace it. */
            disabled={save.isPending || maskedFirstName}
            aria-describedby={maskedFirstName ? 'firstName-hidden' : undefined}
            className={FIELD}
          />
          {maskedFirstName && (
            <span id="firstName-hidden">
              <MaskedFieldNote />
            </span>
          )}
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldLastName')}
          </span>
          <input
            value={maskedLastName ? '' : lastName}
            onChange={(e) => setLastName(e.target.value)}
            required={!maskedLastName}
            maxLength={100}
            /* Disabled when masked: the operator cannot see what is there, so
               they must not be able to replace it. */
            disabled={save.isPending || maskedLastName}
            aria-describedby={maskedLastName ? 'lastName-hidden' : undefined}
            className={FIELD}
          />
          {maskedLastName && (
            <span id="lastName-hidden">
              <MaskedFieldNote />
            </span>
          )}
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldPhone')}
          </span>
          <input
            value={maskedPhone ? '' : phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
            /* Disabled when masked: the operator cannot see what is there, so
               they must not be able to replace it. */
            disabled={save.isPending || maskedPhone}
            aria-describedby={maskedPhone ? 'phone-hidden' : undefined}
            className={FIELD}
          />
          {maskedPhone && (
            <span id="phone-hidden">
              <MaskedFieldNote />
            </span>
          )}
          {/* Empty clears it — stated, because a blank box otherwise reads as
                "unchanged" rather than "remove what is there". */}
          <span className="block text-[11px] text-muted-foreground">
            {t('clientProfile.fieldClearHint')}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldCountry')}
          </span>
          <input
            value={maskedCountry ? '' : country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={100}
            /* Disabled when masked: the operator cannot see what is there, so
               they must not be able to replace it. */
            disabled={save.isPending || maskedCountry}
            aria-describedby={maskedCountry ? 'country-hidden' : undefined}
            className={FIELD}
          />
          {maskedCountry && (
            <span id="country-hidden">
              <MaskedFieldNote />
            </span>
          )}
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={save.isPending}
          className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          /* Disabled with nothing changed: the API answers 400 to an empty
               patch, and a button that produces an error is worse than one that
               says there is nothing to save. */
          disabled={!hasChanges || save.isPending}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
        >
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

/* ── Sign-in email ────────────────────────────────────────────────────────── */

/**
 * The dangerous one.
 *
 * ## Why this dialog spells out consequences instead of just taking a value
 *
 * Three things happen that the operator cannot see and would not guess: every
 * portal session is revoked, the address goes back to unverified, and the
 * PREVIOUS address is emailed a notice saying it changed. That last one
 * especially — an operator who does not know it is coming will be surprised by
 * a client asking why they got a security warning, and the useful version of
 * this screen is the one where nobody is surprised.
 *
 * The typed confirmation is not theatre. It is the one action on this surface
 * that hands over an account, so it should not be reachable by clicking through
 * a dialog while thinking about something else.
 */
export function ChangeClientEmailDialog({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: ClientProfile;
}) {
  return (
    <Modal open={open} onClose={onClose} title={t('clientProfile.changeEmailTitle')}>
      {/*
        Mounted per opening for the reason the profile form gives — and here it
        matters more: a half-typed address and a spent confirmation word left
        over from a previous opening is exactly the state this control should
        never be in.
      */}
      {open ? <EmailForm profile={profile} onClose={onClose} /> : null}
    </Modal>
  );
}

function EmailForm({ profile, onClose }: { profile: ClientProfile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');

  const current = profile.email ?? '';
  const CONFIRM_WORD = 'CHANGE';
  const ready =
    email.trim().length > 0 &&
    email.trim().toLowerCase() !== current.toLowerCase() &&
    confirmation.trim().toUpperCase() === CONFIRM_WORD;

  const save = useMutation({
    mutationFn: () => api.admin.changeClientEmail(profile.id, email.trim()),
    onSuccess: async () => {
      await refreshProfile(queryClient, profile.id);
      toastSuccess(t('clientProfile.changeEmailSaved'));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.changeEmailFailed')),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate();
      }}
    >
      <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="space-y-1 text-xs leading-relaxed text-foreground">
          <p className="font-semibold">{t('clientProfile.changeEmailWarnTitle')}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            <li>{t('clientProfile.changeEmailWarnSessions')}</li>
            <li>{t('clientProfile.changeEmailWarnVerify')}</li>
            <li>{t('clientProfile.changeEmailWarnNotice')}</li>
          </ul>
        </div>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('clientProfile.changeEmailCurrent')}
        </span>
        <input value={current} readOnly disabled className={FIELD} />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('clientProfile.changeEmailNew')}
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
          autoComplete="off"
          disabled={save.isPending}
          className={FIELD}
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('clientProfile.changeEmailConfirmLabel', { word: CONFIRM_WORD })}
        </span>
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          disabled={save.isPending}
          className={FIELD}
        />
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={save.isPending}
          className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!ready || save.isPending}
          className="h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground focus-outline disabled:opacity-50"
        >
          {save.isPending ? t('common.saving') : t('clientProfile.changeEmailSubmit')}
        </button>
      </div>
    </form>
  );
}
