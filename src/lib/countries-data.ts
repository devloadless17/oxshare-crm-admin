import { countries } from 'countries-list';

/**
 * The dial-code list behind `PhoneInput` — the portal's list, ported as is
 * (`src/lib/countries-data.ts` in oxshare-crm-client), so a number the desk
 * types is picked from the same countries a client's own form offers.
 */
export interface CountryItem {
  name: string;
  code: string; // ISO2 code e.g. "LB"
  dialCode: string; // e.g. "+961"
  flag: string; // Emoji flag e.g. "🇱🇧"
}

/**
 * Countries this platform does not offer, by ISO2 code — the portal's
 * exclusion, kept identical so the two pickers agree. Operating from Lebanon,
 * trading with Israel is prohibited outright.
 *
 * Presentation, not enforcement: the server is the only place a dial code is
 * refused.
 */
const EXCLUDED_COUNTRY_CODES = new Set(['IL']);

export const ALL_COUNTRIES: CountryItem[] = Object.entries(countries)
  .filter(([code]) => !EXCLUDED_COUNTRY_CODES.has(code.toUpperCase()))
  .map(([code, c]) => {
    const rawPhone = Array.isArray(c.phone) ? c.phone[0] : c.phone;
    const dialCode = rawPhone ? `+${rawPhone}` : '';
    return {
      name: c.name,
      code: code.toUpperCase(),
      dialCode,
      flag: (c as { emoji?: string }).emoji || '🏳️',
    };
  })
  .filter((c) => c.dialCode !== '')
  .sort((a, b) => a.name.localeCompare(b.name));
