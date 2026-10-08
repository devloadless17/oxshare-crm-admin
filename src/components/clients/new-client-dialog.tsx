'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import api from '@/lib/api';
import type { CreateClientBody } from '@/lib/api/admin';
import { newIdempotencyKey } from '@/lib/api/client';
import { apiFieldErrors } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { PhoneInput } from '@/components/ui/phone-input';
import { toastError, toastSuccess } from '@/lib/toast';
import { keys } from '@/lib/query-keys';
import { t, type MessageKey } from '@/lib/i18n';

const FIELD =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

type FieldKey =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'nationality'
  | 'phone'
  | 'country'
  | 'address'
  | 'city'
  | 'stateProvince'
  | 'postalCode';

/** The form, in order. `required` is what the server requires of every new client. */
const FIELDS: readonly {
  key: FieldKey;
  label: MessageKey;
  kind: 'text' | 'email' | 'date' | 'select' | 'phone';
  required?: boolean;
  wide?: boolean;
  maxLength?: number;
}[] = [
  {
    key: 'email',
    label: 'newClient.email',
    kind: 'email',
    required: true,
    wide: true,
    maxLength: 255,
  },
  {
    key: 'firstName',
    label: 'clientProfile.fieldFirstName',
    kind: 'text',
    required: true,
    maxLength: 100,
  },
  {
    key: 'lastName',
    label: 'clientProfile.fieldLastName',
    kind: 'text',
    required: true,
    maxLength: 100,
  },
  { key: 'dateOfBirth', label: 'clientProfile.fieldDateOfBirth', kind: 'date', required: true },
  { key: 'nationality', label: 'clientProfile.fieldNationality', kind: 'select', required: true },
  { key: 'phone', label: 'clientProfile.fieldPhone', kind: 'phone', required: true },
  { key: 'country', label: 'clientProfile.fieldCountry', kind: 'select', required: true },
  { key: 'address', label: 'clientProfile.fieldAddress', kind: 'text', wide: true, maxLength: 200 },
  { key: 'city', label: 'clientProfile.fieldCity', kind: 'text', maxLength: 100 },
  { key: 'stateProvince', label: 'clientProfile.fieldStateProvince', kind: 'text', maxLength: 100 },
  { key: 'postalCode', label: 'clientProfile.fieldPostalCode', kind: 'text', maxLength: 12 },
];

const EMPTY = Object.fromEntries(FIELDS.map((field) => [field.key, ''])) as Record<
  FieldKey,
  string
>;

/**
 * "New client" (backend 0211): staff create a client for somebody who cannot
 * sign up themselves.
 *
 * The server judges every value by the rules a sign-up passes and answers per
 * field; this form puts each sentence under its box and keeps no rule of its
 * own. ONE Idempotency-Key for the whole time the form is open: a double click
 * or a retried request is one client, while a corrected retry after a refusal
 * is a fresh attempt (the server releases a refused key).
 *
 * The main action goes straight on to "Complete KYC" — the whole onboarding in
 * one flow. The client is emailed a welcome link in their language at once.
 */
function NewClientDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = React.useState(EMPTY);
  const [locale, setLocale] = React.useState<'en' | 'ar'>('en');
  const [key] = React.useState(() => newIdempotencyKey());
  const [busy, setBusy] = React.useState<'profile' | 'kyc' | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const options = useResource(keys.profileOptions.all(), (signal) =>
    api.admin.profileOptions(signal),
  );

  const set = (field: FieldKey, next: string) => {
    setValues((current) => ({ ...current, [field]: next }));
    setErrors(({ [field]: _answered, ...rest }) => rest);
  };

  const create = async (then: 'profile' | 'kyc') => {
    setBusy(then);
    setErrors({});
    try {
      // A blank optional detail is not sent: the client gives it in the KYC.
      const given = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim() !== ''),
      );
      const { id } = await api.admin.createClient(
        { ...(given as unknown as CreateClientBody), locale },
        key,
      );
      await queryClient.invalidateQueries({ queryKey: keys.clients.all() });
      toastSuccess(t('newClient.created', { id }), t('newClient.welcomeSent'));
      onClose();
      router.push(then === 'kyc' ? `/clients/${id}/kyc` : `/clients/${id}`);
    } catch (error) {
      const fields = apiFieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else toastError(error, t('newClient.failed'));
    } finally {
      setBusy(null);
    }
  };

  const choices = (field: FieldKey): string[] => {
    const lists = options.status === 'ready' ? options.data : undefined;
    if (!lists) return [];
    return field === 'country' ? lists.countries : lists.nationalities;
  };
  const ready = FIELDS.every((field) => !field.required || values[field.key].trim() !== '');

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      busy={busy !== null}
      title={t('newClient.title')}
      description={t('newClient.body')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void create('profile')}
            disabled={!ready || busy !== null}
            className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline disabled:opacity-50"
          >
            {busy === 'profile' ? t('newClient.creating') : t('newClient.create')}
          </button>
          <button
            type="button"
            onClick={() => void create('kyc')}
            disabled={!ready || busy !== null}
            className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
          >
            {busy === 'kyc' ? t('newClient.creating') : t('newClient.createAndKyc')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const id = `new-client-${field.key}`;
          const error = errors[field.key];
          const control = {
            id,
            disabled: busy !== null,
            'aria-invalid': Boolean(error),
            'aria-describedby': error ? `${id}-error` : undefined,
            className: FIELD,
          };
          return (
            <div key={field.key} className={`space-y-1.5 ${field.wide ? 'sm:col-span-2' : ''}`}>
              <label htmlFor={id} className="text-xs font-semibold text-foreground">
                {t(field.label)}
                {field.required && <span className="text-destructive"> *</span>}
              </label>
              {field.kind === 'phone' ? (
                <PhoneInput
                  id={id}
                  value={values.phone}
                  // The picker emits the dial code alone while no number is typed: that is no phone.
                  onChange={(next) => set('phone', next.includes(' ') ? next : '')}
                  disabled={busy !== null}
                  aria-invalid={Boolean(error)}
                  aria-describedby={control['aria-describedby']}
                />
              ) : field.kind === 'select' ? (
                <select
                  {...control}
                  value={values[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  disabled={control.disabled || options.status !== 'ready'}
                >
                  <option value="">
                    {options.status === 'ready'
                      ? t('clientProfile.choose')
                      : t('clientProfile.listLoading')}
                  </option>
                  {choices(field.key).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...control}
                  type={field.kind === 'date' ? 'date' : field.kind === 'email' ? 'email' : 'text'}
                  value={values[field.key]}
                  maxLength={field.maxLength}
                  autoComplete="off"
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}
              {error && (
                <span
                  id={`${id}-error`}
                  role="alert"
                  className="block text-[11px] font-medium text-destructive"
                >
                  {error}
                </span>
              )}
            </div>
          );
        })}
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="new-client-locale" className="text-xs font-semibold text-foreground">
            {t('newClient.language')}
          </label>
          <select
            id="new-client-locale"
            className={FIELD}
            value={locale}
            disabled={busy !== null}
            onChange={(e) => setLocale(e.target.value === 'ar' ? 'ar' : 'en')}
          >
            <option value="en">{t('newClient.languageEn')}</option>
            <option value="ar">{t('newClient.languageAr')}</option>
          </select>
          <span className="block text-[11px] text-muted-foreground">
            {t('newClient.languageHint')}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** The clients list's "New client" — shown to staff holding `clients.create`. */
export function NewClientButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        {t('newClient.action')}
      </button>
      {open && <NewClientDialog onClose={() => setOpen(false)} />}
    </>
  );
}
