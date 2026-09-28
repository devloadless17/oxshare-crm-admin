'use client';

import * as React from 'react';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { keys } from '@/lib/query-keys';
import { t, type MessageKey } from '@/lib/i18n';

/** Every identity field a reviewer may correct — all of them but the phone. */
const CORRECTABLE = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationality',
  'country',
  'address',
  'city',
  'postalCode',
] as const;
type Correctable = (typeof CORRECTABLE)[number];

export type CorrectionPatch = Partial<Record<Correctable, string>> & { reason: string };

const LABEL: Readonly<Record<Correctable, MessageKey>> = {
  firstName: 'clientProfile.fieldFirstName',
  lastName: 'clientProfile.fieldLastName',
  dateOfBirth: 'clientProfile.fieldDateOfBirth',
  nationality: 'clientProfile.fieldNationality',
  country: 'clientProfile.fieldCountry',
  address: 'clientProfile.fieldAddress',
  city: 'clientProfile.fieldCity',
  postalCode: 'clientProfile.fieldPostalCode',
};

const FIELD =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline disabled:opacity-60 aria-[invalid=true]:border-destructive';

/**
 * CORRECT AN APPROVED CLIENT'S VERIFIED DETAILS (the owner's ruling, 26 Sep 2026).
 *
 * Any identity field but the phone — a misspelt surname used to have no remedy
 * but a rejection, which shuts the money doors for a typo. Every value is
 * re-checked by the profile's rules on the server, and each refusal is shown
 * under its own field. A REASON is required: it goes on the audit row beside
 * both values. The client is emailed which details changed.
 *
 * Pre-filled with what is on file, and only what CHANGED is sent. A field this
 * reviewer's role hides is shown as hidden and cannot be written — they cannot
 * see what they would be replacing.
 *
 * A material change — a new passport, a move abroad — is not a correction: that
 * is "Request re-verification", beside this.
 */
export function CorrectIdentityDialog({
  clientName,
  current,
  isHidden,
  loading,
  error,
  fieldErrors,
  refusal,
  onCancel,
  onConfirm,
}: {
  clientName: string;
  /** The profile as the review shows it. */
  current: Readonly<Record<string, unknown>>;
  isHidden: (key: Correctable) => boolean;
  loading: boolean;
  error: string;
  fieldErrors: Readonly<Record<string, string>>;
  refusal: string;
  onCancel: () => void;
  onConfirm: (patch: CorrectionPatch) => Promise<void>;
}) {
  const initial = React.useMemo(
    () =>
      Object.fromEntries(
        CORRECTABLE.map((key) => [key, typeof current[key] === 'string' ? current[key] : '']),
      ) as Record<Correctable, string>,
    [current],
  );
  const [values, setValues] = React.useState(initial);
  const [reason, setReason] = React.useState('');
  const panel = React.useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true, onCancel, !loading);
  const options = useResource(keys.profileOptions.all(), (signal) =>
    api.admin.profileOptions(signal),
  );

  const changed = CORRECTABLE.filter((key) => !isHidden(key) && values[key] !== initial[key]);
  // A reason must EXIST, at any length (the server's rule, trimmed the same way).
  const reasonOk = reason.trim() !== '';
  const canConfirm = changed.length > 0 && reasonOk && !loading;

  const choices = (key: Correctable) =>
    key === 'country'
      ? (options.data?.countries ?? [])
      : key === 'nationality'
        ? (options.data?.nationalities ?? [])
        : undefined;

  return (
    <div className="modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correct-identity-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="correct-identity-title">{t('kycReview.correctTitle')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('kycReview.correctBody', { client: clientName })}
        </p>

        {/* A scroll area clips what is drawn outside its box, and a focus ring is
            (2px outline, 2px offset): 4px of room on every side, given back by the
            negative margin so nothing moves. */}
        <div className="-m-1 grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2">
          {CORRECTABLE.map((key) => {
            const hidden = isHidden(key);
            const list = choices(key);
            const problem = fieldErrors[key];
            const control = {
              id: `correct-${key}`,
              disabled: loading || hidden,
              'aria-invalid': Boolean(problem),
              'aria-describedby': problem ? `correct-${key}-error` : undefined,
              className: FIELD,
            };
            const set = (next: string) => setValues((prev) => ({ ...prev, [key]: next }));
            return (
              <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
                <label className="mb-1 block text-xs font-semibold" htmlFor={`correct-${key}`}>
                  {t(LABEL[key])}
                </label>
                {list ? (
                  <select
                    {...control}
                    value={hidden ? '' : values[key]}
                    onChange={(e) => set(e.target.value)}
                  >
                    <option value="">
                      {hidden ? t('masking.hidden') : t('clientProfile.choose')}
                    </option>
                    {/* A stored value the list no longer holds stays visible. */}
                    {values[key] && !list.includes(values[key]) && (
                      <option value={values[key]}>{values[key]}</option>
                    )}
                    {list.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...control}
                    type={key === 'dateOfBirth' ? 'date' : 'text'}
                    value={hidden ? '' : values[key]}
                    placeholder={hidden ? t('masking.hidden') : undefined}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
                {problem && (
                  <p
                    id={`correct-${key}-error`}
                    role="alert"
                    className="mt-1 text-[11px] font-medium text-destructive"
                  >
                    {problem}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">{t('kycReview.correctPhoneNote')}</p>

        <label className="mb-1 mt-4 block text-xs font-semibold" htmlFor="correct-reason">
          {t('kycReview.correctReason')} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="correct-reason"
          className="reject-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={loading}
          aria-describedby="correct-reason-hint"
          placeholder={t('kycReview.correctReasonPlaceholder')}
        />
        <p id="correct-reason-hint" className="mb-3 text-[11px] text-muted-foreground">
          {t('kycReview.correctReasonHint')}
        </p>

        {refusal && (
          <div
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            role="alert"
          >
            <p className="text-xs font-bold text-destructive">
              {t('kycReview.correctRefusedTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{refusal}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('kycReview.correctRefusedRemedy')}
            </p>
          </div>
        )}
        {error && (
          <p className="mb-3 text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="modal-btns">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-approve-confirm"
            disabled={!canConfirm}
            onClick={() =>
              void onConfirm({
                reason: reason.trim(),
                ...Object.fromEntries(changed.map((key) => [key, values[key]])),
              })
            }
          >
            {loading ? t('common.saving') : t('kycReview.correctConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
