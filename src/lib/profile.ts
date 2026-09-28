/**
 * A client's PROFILE, as the console shows and edits it (backend 0139).
 *
 * One record per person — registration writes it, the client's KYC personal
 * step changes it, the desk corrects it — so there is no second copy here to
 * keep in step. These helpers decide only how the values READ.
 */

/** Every field of the profile — the backend's `PROFILE_FIELD_KEYS`. */
export const PROFILE_FIELD_KEYS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationality',
  'phone',
  'country',
  'address',
  'city',
  'stateProvince',
  'postalCode',
] as const;

export type ProfileKey = (typeof PROFILE_FIELD_KEYS)[number];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * "15 June 1990" from "1990-06-15" — built and printed in UTC, because a
 * birthday is a calendar day: read as local midnight it is the day before for
 * every operator west of Greenwich.
 */
export function formatDateOfBirth(value?: string | null): string | undefined {
  const match = ISO_DAY.exec(value ?? '');
  if (!match) return value?.trim() || undefined;
  const [, year = '', month = '', day = ''] = match;
  return LONG_DATE.format(new Date(Date.UTC(+year, +month - 1, +day)));
}

/** The address as one line — street, city, state, postal code — leaving out what is absent. */
export function addressLine(parts: {
  address?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
}): string | undefined {
  const line = [parts.address, parts.city, parts.stateProvince, parts.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  return line || undefined;
}
