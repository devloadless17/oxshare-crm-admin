import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

export interface InfoRow {
  /** The submitted key. The reject dialog's contract, so never a label. */
  key: string;
  label: string;
  value: string;
  /** No value was submitted — rendered dim, not as an empty gap. */
  empty: boolean;
}

export interface InfoGroup {
  title: string;
  rows: InfoRow[];
}

/**
 * What the reviewer reads, built from the SAME configuration the client filled in.
 *
 * ## Why the labels are not derived from the key
 *
 * The card used to render `Object.entries(personalInfo)` and prettify each key
 * with a camelCase regex. Three things were wrong with that, and all three are
 * visible on a real submission:
 *
 *  - A key the builder created as `id_number` or `tax-id` has no capitals, so
 *    the regex left it exactly as stored: a reviewer approving an identity
 *    document read `id_number` where the client had read "ID Number".
 *  - `dateOfBirth` came back as the raw ISO string the portal submitted, so a
 *    date of birth rendered as `1994-03-07T00:00:00.000Z` — a timestamp on a
 *    field that has no time, next to a decision about whether the person is who
 *    they say they are.
 *  - The order was whatever the JSON happened to hold, which is submission
 *    order, so the same field sat in a different place on every submission and
 *    nothing lined up between one review and the next.
 *
 * The step config already carries a `label`, a `type` and an order — it is what
 * the portal renders the wizard from. Reading it here means the reviewer sees
 * the same words, in the same order, as the person who filled the form. Exactly
 * the argument `field-options.ts` makes for the reject dialog.
 *
 * ## Nothing submitted is ever dropped
 *
 * A key present in the submission but absent from the config — a field since
 * renamed or removed in the builder — still renders, under its own heading with
 * the key prettified as before. Hiding it would silently withhold submitted
 * identity data from the person deciding on it, which is worse than an ugly
 * label. This is why the function takes the whole bag and subtracts, rather than
 * walking the config and looking values up.
 */
export function personalInfoGroups(
  personalInfo: Record<string, string> | undefined,
  steps: KycStepConfig[] | undefined,
): InfoGroup[] {
  if (!personalInfo) return [];

  const remaining = new Map<string, string>(Object.entries(personalInfo));
  // Its own card on the screen; a second copy here reads as a duplicate row.
  remaining.delete('docType');

  const groups: InfoGroup[] = [];

  for (const step of steps ?? []) {
    if (step.enabled === false || step.slug === 'review') continue;

    const rows: InfoRow[] = [];
    for (const field of step.fields ?? []) {
      if (!remaining.has(field.name)) continue;
      const raw = remaining.get(field.name);
      remaining.delete(field.name);
      rows.push(toRow(field.name, field.label, raw, field.type));
    }
    if (rows.length > 0) groups.push({ title: step.title, rows });
  }

  // Whatever the configuration did not account for, still shown.
  if (remaining.size > 0) {
    const rows = [...remaining].map(([key, value]) => toRow(key, humanise(key), value));
    groups.push({
      title: groups.length === 0 ? t('kycReview.personalInfo') : t('kycReview.otherFields'),
      rows,
    });
  }

  return groups;
}

function toRow(key: string, label: string, raw: unknown, type?: string): InfoRow {
  // `unknown` rather than `string`: the DTO says these are strings, and a
  // submission that drifts from it must still render something a reviewer can
  // read instead of throwing the whole card away.
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : raw === undefined || raw === null
        ? ''
        : // JSON rather than String(): a value that drifted into an object would
          // stringify to "[object Object]", which tells the reviewer nothing and
          // looks like a working field.
          JSON.stringify(raw);
  if (value === '') return { key, label, value: '—', empty: true };
  return { key, label, value: format(value, type), empty: false };
}

/**
 * The stored string, as a person would write it.
 *
 * Deliberately conservative: anything not recognised is passed through
 * untouched. A reviewer comparing a form field against a passport needs to see
 * what was actually submitted, so a value this cannot improve must not be
 * reformatted into something that merely looks tidier.
 */
function format(value: string, type?: string): string {
  if (type === 'date') {
    const parsed = new Date(value);
    // An unparseable date is shown as stored rather than as "Invalid Date".
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
  }
  if (type === 'checkbox') {
    const yes = value === 'true' || value === '1' || value.toLowerCase() === 'yes';
    return yes ? t('kycReview.valueYes') : t('kycReview.valueNo');
  }
  return value;
}

/**
 * A key with no configured label, made readable.
 *
 * Handles the three shapes the builder can produce — `camelCase`, `snake_case`
 * and `kebab-case` — where the old regex handled only the first and left the
 * other two exactly as stored.
 */
export function humanise(key: string): string {
  return (
    key
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      // EVERY word, not just the first: capitalising only the leading character
      // turns `id_number` into "Id number", which reads as a typo rather than a
      // label. An existing acronym is left alone — `IBAN` stays `IBAN`.
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
