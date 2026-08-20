'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

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

/** Both dialogs change what the profile query returns. */
async function refreshProfile(
  queryClient: ReturnType<typeof useQueryClient>,
  clientId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'client', clientId] });
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

function ProfileForm({ profile, onClose }: { profile: ClientProfile; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = React.useState(profile.firstName ?? '');
  const [lastName, setLastName] = React.useState(profile.lastName ?? '');
  const [phone, setPhone] = React.useState(profile.phone ?? '');
  const [country, setCountry] = React.useState(profile.country ?? '');

  const changed = {
    ...(firstName !== (profile.firstName ?? '') ? { firstName } : {}),
    ...(lastName !== (profile.lastName ?? '') ? { lastName } : {}),
    ...(phone !== (profile.phone ?? '') ? { phone } : {}),
    ...(country !== (profile.country ?? '') ? { country } : {}),
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
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={100}
            disabled={save.isPending}
            className={FIELD}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldLastName')}
          </span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            maxLength={100}
            disabled={save.isPending}
            className={FIELD}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {t('clientProfile.fieldPhone')}
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
            disabled={save.isPending}
            className={FIELD}
          />
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
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={100}
            disabled={save.isPending}
            className={FIELD}
          />
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
