'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Lock, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile } from '@/lib/api/admin';
import { apiFieldErrors } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { PermittedLink } from '@/components/permitted-link';
import { PhoneInput } from '@/components/ui/phone-input';
import { isMasked } from '@/lib/masking';
import { PROFILE_FIELD_KEYS, type ProfileKey } from '@/lib/profile';
import { toastError, toastSuccess } from '@/lib/toast';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

const FIELD =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

/** How each profile field is edited. The order is the form's. */
const FIELDS: Readonly<
  Record<
    ProfileKey,
    {
      label: MessageKey;
      kind: 'text' | 'date' | 'select' | 'phone';
      maxLength?: number;
      hint?: MessageKey;
      /** Required on the server: a name can be corrected, never cleared. */
      required?: boolean;
      wide?: boolean;
    }
  >
> = {
  firstName: {
    label: 'clientProfile.fieldFirstName',
    kind: 'text',
    maxLength: 100,
    required: true,
  },
  lastName: { label: 'clientProfile.fieldLastName', kind: 'text', maxLength: 100, required: true },
  dateOfBirth: { label: 'clientProfile.fieldDateOfBirth', kind: 'date' },
  nationality: { label: 'clientProfile.fieldNationality', kind: 'select' },
  // The portal's own picker — country, dial code, number (owner, 26 Sep 2026).
  phone: { label: 'clientProfile.fieldPhone', kind: 'phone' },
  country: { label: 'clientProfile.fieldCountry', kind: 'select' },
  address: { label: 'clientProfile.fieldAddress', kind: 'text', maxLength: 200, wide: true },
  city: { label: 'clientProfile.fieldCity', kind: 'text', maxLength: 100 },
  stateProvince: { label: 'clientProfile.fieldStateProvince', kind: 'text', maxLength: 100 },
  postalCode: { label: 'clientProfile.fieldPostalCode', kind: 'text', maxLength: 12 },
};

const startingValues = (profile: ClientProfile): Record<ProfileKey, string> =>
  Object.fromEntries(PROFILE_FIELD_KEYS.map((key) => [key, profile[key] ?? ''])) as Record<
    ProfileKey,
    string
  >;

/**
 * THE CLIENT'S ONE PROFILE, as the desk edits it (backend 0139).
 *
 * The same record the client's own identity verification shows them — so a
 * correction here is what their KYC form opens with next, and there is no
 * second copy to disagree with it. The server applies ONE set of rules to every
 * writer and answers per field; this form puts each sentence under its box.
 *
 * Three reasons a field cannot be edited, each said under it rather than
 * leaving a dead box:
 *
 *  - MASKED (RBAC-03): the operator cannot see the value, so must not replace
 *    it. An untouched masked field is never sent.
 *  - HELD by the verification: a reviewer is checking it against documents, or
 *    it was verified and this admin may not correct verified details. The API
 *    states which and why (`lockedFields`) — the form renders the server's
 *    sentence rather than keeping its own copy of the rule.
 *  - pending: a save is on its way.
 *
 * A VERIFIED detail this admin may correct (`correctableFields`) is edited
 * RIGHT HERE: changing one asks for a reason, recorded on the verification,
 * and the client is told and stays verified. It used to be locked with a link
 * to the KYC review — being sent to another screen to edit a client was
 * reported as a bad experience (28 Sep 2026).
 *
 * Only CHANGED fields are sent: echoing every value back would let this form's
 * stale copy overwrite what another screen wrote a second ago, and the audit
 * would record changes nobody made.
 */
export function ClientProfileForm({
  profile,
  onClose,
}: {
  profile: ClientProfile;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { admin } = useAdmin();
  const initial = React.useMemo(() => startingValues(profile), [profile]);
  const [values, setValues] = React.useState(initial);
  const options = useResource(keys.profileOptions.all(), (signal) =>
    api.admin.profileOptions(signal),
  );

  const masked = (key: ProfileKey) => isMasked(`client.${key}`, profile.maskedFields);
  const locked = (key: ProfileKey) => profile.lockedFields?.[key];
  const editable = (key: ProfileKey) => !masked(key) && !locked(key);
  const correctable = (key: ProfileKey) =>
    !masked(key) && (profile.correctableFields ?? []).includes(key);
  const [reason, setReason] = React.useState('');

  const changed = Object.fromEntries(
    PROFILE_FIELD_KEYS.filter((key) => editable(key) && values[key] !== initial[key]).map((key) => [
      key,
      values[key],
    ]),
  ) as Partial<Record<ProfileKey, string>>;
  const hasChanges = Object.keys(changed).length > 0;
  const anyLocked = PROFILE_FIELD_KEYS.some((key) => Boolean(locked(key)));
  const anyCorrectable = PROFILE_FIELD_KEYS.some(correctable);
  // A reason is asked for exactly when a verified detail is being changed.
  const correcting = PROFILE_FIELD_KEYS.some((key) => correctable(key) && key in changed);
  const reasonMissing = correcting && reason.trim() === '';
  /*
   * Where the verification stands, for the short label under a locked field.
   * Absent for a reader without kyc.view — then the label is the generic one
   * and the server's sentence still says why.
   */
  const verification = profile.kyc?.status;
  const lockedLabel =
    verification === 'approved'
      ? t('clientProfile.lockedVerified')
      : verification === 'pending' || verification === 'in_review'
        ? t('clientProfile.lockedInReview')
        : t('clientProfile.lockedShort');

  const save = useMutation({
    mutationFn: () =>
      api.admin.updateClientProfile(
        profile.id,
        correcting ? { ...changed, reason: reason.trim() } : changed,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.clients.detail(profile.id) });
      toastSuccess(t('clientProfile.editProfileSaved'));
      onClose();
    },
    onError: (error) => {
      // A refusal ABOUT A FIELD is said under that field; only anything else is a toast.
      if (Object.keys(apiFieldErrors(error)).length === 0) {
        toastError(error, t('clientProfile.editProfileFailed'));
      }
    },
  });
  const errors: Partial<Record<string, string>> = save.error ? apiFieldErrors(save.error) : {};
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasChanges && !reasonMissing) save.mutate();
      }}
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('clientProfile.editProfileBody')}
      </p>
      {anyCorrectable && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>{t('clientProfile.correctionNotice')}</p>
        </div>
      )}
      {anyLocked && (
        /*
         * ONE statement of the hold, said in place. It used to carry a link to
         * "Correct details" on the KYC review; a verified detail is corrected
         * here now, and nothing on this form sends the admin elsewhere to edit
         * the client. A record IN review keeps a plain way to look at it.
         */
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p>
              {verification === 'approved'
                ? t('clientProfile.lockedNoticeApproved')
                : verification === 'pending' || verification === 'in_review'
                  ? t('clientProfile.lockedNoticeInReview')
                  : t('clientProfile.lockedNotice')}
            </p>
            {verification !== 'approved' && hasPermission(admin, 'kyc.review') ? (
              <PermittedLink
                href={`/kyc/${profile.portalId}`}
                className="inline-block font-semibold text-link hover:underline focus-outline"
              >
                {t('clientProfile.openKycReview')}
              </PermittedLink>
            ) : null}
          </div>
        </div>
      )}
      {hasFieldErrors && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {t('clientProfile.fixHighlighted')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {PROFILE_FIELD_KEYS.map((key) => {
          const spec = FIELDS[key];
          const held = masked(key) ? undefined : locked(key);
          const error = errors[key];
          const described = [
            error ? `${key}-error` : '',
            masked(key) ? `${key}-hidden` : '',
            held ? `${key}-locked` : '',
            correctable(key) ? `${key}-verified` : '',
            spec.hint && !error ? `${key}-hint` : '',
          ]
            .filter(Boolean)
            .join(' ');
          const control = {
            id: `profile-${key}`,
            disabled: save.isPending || !editable(key),
            'aria-invalid': Boolean(error),
            'aria-describedby': described || undefined,
            className: FIELD,
          };
          const value = masked(key) ? '' : values[key];
          const set = (next: string) => setValues((current) => ({ ...current, [key]: next }));

          return (
            <div key={key} className={`space-y-1.5 ${spec.wide ? 'sm:col-span-2' : ''}`}>
              <label htmlFor={`profile-${key}`} className="text-xs font-semibold text-foreground">
                {t(spec.label)}
              </label>
              {spec.kind === 'phone' ? (
                <PhoneInput
                  id={control.id}
                  value={value}
                  /* The picker emits the dial code alone while no number is
                     typed; that is an empty phone, not a phone of "+961". */
                  onChange={(next) => set(next.includes(' ') ? next : '')}
                  disabled={control.disabled}
                  aria-invalid={control['aria-invalid']}
                  aria-describedby={control['aria-describedby']}
                />
              ) : spec.kind === 'select' ? (
                <select
                  {...control}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  disabled={control.disabled || options.status !== 'ready'}
                >
                  <option value="">
                    {options.status === 'ready'
                      ? t('clientProfile.choose')
                      : t('clientProfile.listLoading')}
                  </option>
                  {/* A stored value the list does not hold (written before the
                      rules) stays visible and selectable, so it is never silently
                      replaced by the first entry. */}
                  {value && !choicesFor(key, options.data).includes(value) && (
                    <option value={value}>{value}</option>
                  )}
                  {choicesFor(key, options.data).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...control}
                  type={spec.kind === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  required={spec.required && editable(key)}
                  maxLength={spec.maxLength}
                />
              )}
              {masked(key) && (
                <span
                  id={`${key}-hidden`}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  {t('clientProfile.fieldHiddenFromYou')}
                </span>
              )}
              {held && (
                <span
                  id={`${key}-locked`}
                  title={held}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span aria-hidden="true">{lockedLabel}</span>
                  <span className="sr-only">{held}</span>
                </span>
              )}
              {correctable(key) && (
                <span
                  id={`${key}-verified`}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {t('clientProfile.verifiedBadge')}
                </span>
              )}
              {spec.hint && !error && editable(key) && (
                <span id={`${key}-hint`} className="block text-[11px] text-muted-foreground">
                  {t(spec.hint)}
                </span>
              )}
              {error && (
                <span
                  id={`${key}-error`}
                  role="alert"
                  className="block text-[11px] font-medium text-destructive"
                >
                  {error}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {correcting && (
        <div className="space-y-1.5">
          <label htmlFor="profile-reason" className="text-xs font-semibold text-foreground">
            {t('clientProfile.correctionReason')} <span className="text-destructive">*</span>
          </label>
          <textarea
            id="profile-reason"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs focus-outline aria-[invalid=true]:border-destructive"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={save.isPending}
            aria-invalid={Boolean(errors['reason'])}
            aria-describedby={errors['reason'] ? 'profile-reason-error' : 'profile-reason-hint'}
            placeholder={t('clientProfile.correctionReasonPlaceholder')}
          />
          {errors['reason'] ? (
            <span
              id="profile-reason-error"
              role="alert"
              className="block text-[11px] font-medium text-destructive"
            >
              {errors['reason']}
            </span>
          ) : (
            <span id="profile-reason-hint" className="block text-[11px] text-muted-foreground">
              {t('clientProfile.correctionReasonHint')}
            </span>
          )}
        </div>
      )}

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
          disabled={!hasChanges || reasonMissing || save.isPending}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
        >
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

function choicesFor(
  key: ProfileKey,
  lists: { countries: string[]; nationalities: string[] } | undefined,
): string[] {
  if (!lists) return [];
  return key === 'country' ? lists.countries : key === 'nationality' ? lists.nationalities : [];
}
