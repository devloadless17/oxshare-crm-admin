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
  /**
   * An UPLOADED file answering this field. The card names it and opens it in
   * the document viewer; it is never printed as its stored record — that is how
   * `{"fileName":"calculator_icon.jpg","filePath":"uploads/kyc/…"}` reached a
   * reviewer (reported from production).
   */
  file?: { filePath: string; fileName?: string };
}

export interface InfoGroup {
  title: string;
  rows: InfoRow[];
}

/** A stored file answer, as a custom step's upload is kept in `stepData`. */
export interface StoredFileAnswer {
  filePath: string;
  fileName?: string;
}

export function isStoredFileAnswer(value: unknown): value is StoredFileAnswer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredFileAnswer).filePath === 'string' &&
    (value as StoredFileAnswer).filePath !== ''
  );
}

/**
 * Debris the portal once wrote into `personalInfo`, which is not an answer.
 *
 * Its review screen re-posted the whole wizard form as the personal step, so
 * three things landed beside the client's name and were read as details:
 * `__docChoice__<step>` (which document CARD was picked — UI state),
 * `"[object Object]"` (an uploaded file's record, stringified) and a structured
 * value. The API no longer stores any of them (`kyc-answers.ts`) and backend
 * migration 0136 cleared live rows — but an archived attempt keeps what it was
 * decided on, and this screen renders those too.
 */
function isDebris(key: string, value: unknown): boolean {
  if (key.startsWith('__')) return true;
  if (value === '[object Object]') return true;
  return typeof value === 'object' && value !== null;
}

/**
 * The label for a key no configured field names.
 *
 * The builder names every field it creates `customField_<timestamp>` and never
 * shows the name, so that shape IS a question somebody removed from the form.
 * "Custom Field 1790263652846" told the reviewer nothing a sentence cannot.
 */
export function unconfiguredLabel(key: string): string {
  return /^customField_\d+$/.test(key) ? t('kycReview.retiredQuestion') : humanise(key);
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
 * ## A custom step's answers are read from ITS step, never twice
 *
 * The portal once copied every custom step's answers into `personalInfo` as
 * well, under the builder's keys — so the same answer rendered under its step
 * AND again under "Other Details" as "Custom Field 1790263652846". An answer
 * lives where its step stored it; a copy of it elsewhere is not shown.
 *
 * ## Nothing submitted is ever dropped
 *
 * A key present in the submission but absent from the config — a field since
 * renamed or removed in the builder — still renders, under its own heading.
 * Hiding it would silently withhold submitted identity data from the person
 * deciding on it, which is worse than an ugly label. This is why the function
 * takes the whole bag and subtracts, rather than walking the config and looking
 * values up. (Debris is not data — `isDebris`.)
 */
export function personalInfoGroups(
  personalInfo: Record<string, unknown> | undefined,
  steps: KycStepConfig[] | undefined,
  /** Answers for configured steps beyond the four canonical ones, keyed by slug. */
  stepData?: Record<string, Record<string, unknown>>,
): InfoGroup[] {
  // A submission with no personal info can still carry custom-step answers, so
  // the early return has to consider both — it used to drop them silently.
  if (!personalInfo && !stepData) return [];

  const remaining = new Map<string, unknown>(
    Object.entries(personalInfo ?? {}).filter(([key, value]) => !isDebris(key, value)),
  );
  // Its own card on the screen; a second copy here reads as a duplicate row.
  remaining.delete('docType');
  // Copies of a custom step's answers — they render under that step.
  for (const answers of Object.values(stepData ?? {})) {
    for (const key of Object.keys(answers ?? {})) remaining.delete(key);
  }

  const groups: InfoGroup[] = [];

  for (const step of steps ?? []) {
    if (step.enabled === false || step.slug === 'review') continue;

    /*
     * A CUSTOM step's answers live under its own slug in `stepData`, not in
     * `personalInfo` — migration 0130 gave them somewhere to go, and without
     * this they would be stored, submitted and invisible, which is a worse
     * state than not collecting them at all: the client answers a compliance
     * question and the reviewer decides without ever seeing it.
     *
     * Read from a per-step map rather than the shared `remaining` pool, so the
     * same key in two custom steps stays two answers.
     */
    const custom = stepData?.[step.slug];

    const rows: InfoRow[] = [];
    for (const field of step.fields ?? []) {
      /*
       * Where an answer lives: `step_data` under the step's slug — an added
       * step's answers, and the extra questions and uploads a broker puts on a
       * built-in step — else `personal_info`: the personal step's typed answers
       * always, and any other step's from before 24 Sep 2026, when the portal
       * merged every step's answers into it.
       */
      const stored = custom?.[field.name];
      if (stored !== undefined) {
        rows.push(toRow(field.name, field.label, stored, field.type));
        continue;
      }
      if (!remaining.has(field.name)) continue;
      const raw = remaining.get(field.name);
      remaining.delete(field.name);
      rows.push(toRow(field.name, field.label, raw, field.type));
    }

    /*
     * Answers under a slug whose field the configuration no longer lists —
     * a field removed after somebody submitted. Same rule the personal block
     * uses below: nothing submitted is ever dropped.
     */
    if (custom) {
      const named = new Set((step.fields ?? []).map((f) => f.name));
      for (const [key, value] of Object.entries(custom)) {
        if (named.has(key) || (typeof value === 'string' && isDebris(key, value))) continue;
        rows.push(toRow(key, unconfiguredLabel(key), value));
      }
    }

    if (rows.length > 0) groups.push({ title: step.title, rows });
  }

  /*
   * Whatever the configuration did not account for, still shown — labelled by
   * any step that names it (a field on a step since disabled keeps its label),
   * and otherwise honestly.
   */
  if (remaining.size > 0) {
    const everyField = (steps ?? []).flatMap((s) => s.fields ?? []);
    const rows = [...remaining].map(([key, value]) => {
      const known = everyField.find((f) => f.name === key);
      return known
        ? toRow(key, known.label, value, known.type)
        : toRow(key, unconfiguredLabel(key), value);
    });
    groups.push({
      title: groups.length === 0 ? t('kycReview.personalInfo') : t('kycReview.otherFields'),
      rows,
    });
  }

  return groups;
}

function toRow(key: string, label: string, raw: unknown, type?: string): InfoRow {
  // An uploaded file is named and opened, never printed as its stored record.
  if (isStoredFileAnswer(raw)) {
    return {
      key,
      label,
      value: raw.fileName || t('kycReview.uploadedFile'),
      empty: false,
      file: { filePath: raw.filePath, fileName: raw.fileName },
    };
  }
  // `unknown` rather than `string`: the DTO says these are strings, and a
  // submission that drifts from it must still render something a reviewer can
  // read instead of throwing the whole card away.
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : raw === undefined || raw === null
        ? ''
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : // Anything else structured is not an answer a person gave.
            '';
  if (value === '' || value === '[object Object]') return { key, label, value: '—', empty: true };
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
    // A single tick box is yes or no; one with choices ("tick all that apply")
    // stores the ticked choices themselves, which read as they are.
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return t('kycReview.valueYes');
    if (lower === 'false' || lower === '0' || lower === 'no') return t('kycReview.valueNo');
    return value;
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

/** The canonical storage ids a reviewer flags a document PAGE by. */
const PAGE_LABEL_KEYS = {
  doc_front: 'kycReview.docIdFront',
  doc_back: 'kycReview.docIdBack',
  selfie: 'kycReview.docSelfie',
  address_proof: 'kycReview.docAddress',
  address_proof_2: 'kycReview.docAddress2',
} as const;

/**
 * `rejectedFields` as a reviewer should read them — "Payslip", "Date of Birth",
 * "ID document (back)" — never the stored key. The chips printed the raw ids,
 * so a flagged builder field read `customField_1790263652846`.
 */
export function rejectedFieldLabels(ids: string[], steps: KycStepConfig[] | undefined): string[] {
  const everyField = (steps ?? []).flatMap((s) => s.fields ?? []);
  const labels = ids.map((id) => {
    if (Object.prototype.hasOwnProperty.call(PAGE_LABEL_KEYS, id)) {
      return t(PAGE_LABEL_KEYS[id as keyof typeof PAGE_LABEL_KEYS]);
    }
    return everyField.find((f) => f.name === id)?.label ?? unconfiguredLabel(id);
  });
  return [...new Set(labels)];
}
