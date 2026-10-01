/**
 * The short names people type for a country, by ISO code — so "UAE" finds the
 * United Arab Emirates in a country picker. Only well-known forms.
 */
export const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  AE: ['UAE', 'Emirates', 'Dubai'],
  US: ['USA', 'America', 'United States of America'],
  GB: ['UK', 'Britain', 'Great Britain', 'England'],
  SA: ['KSA', 'Saudi'],
  KR: ['Korea'],
  CD: ['DRC', 'DR Congo'],
  CI: ["Cote d'Ivoire"],
  CZ: ['Czech Republic'],
  TR: ['Turkey'],
  MM: ['Burma'],
  NL: ['Holland'],
  RU: ['Russian Federation'],
  SY: ['Syrian Arab Republic'],
  PS: ['Palestinian Territories'],
  VA: ['Vatican'],
  SZ: ['Swaziland'],
  MK: ['Macedonia'],
  CV: ['Cape Verde'],
  TL: ['Timor-Leste'],
};
