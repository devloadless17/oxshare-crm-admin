import type { StepRefusal, KycStepConfig } from './step-card';

/**
 * The builder's save, as data: what goes on the wire, and where each refusal
 * that comes back belongs. Pure, so both are one assertion each.
 */

/**
 * The form as `PUT /admin/kyc-config` takes it. A new step goes WITHOUT an
 * address: the server gives it one from its title (`newCustomSlug`), and an
 * empty string would be refused as a missing value rather than read as "none".
 */
export function savePayload(steps: readonly KycStepConfig[]): Partial<KycStepConfig>[] {
  return steps.map(({ slug, ...step }) => (slug ? { slug, ...step } : step));
}

export interface Refusals {
  /** Per step id: its own sentence, and its fields' by field id. */
  byStep: Record<string, StepRefusal>;
  /** A refusal about the whole form — a built-in step missing, say. */
  form?: string;
  /** The first step a refusal names, to open its tab. */
  firstStepId?: string;
}

/**
 * Where each of the server's sentences belongs. It keys them by position in
 * the form it was SENT — `steps.2`, `steps.2.fields.0` — which is the draft
 * this screen holds, so each lands under the step or field it is about rather
 * than in a toast that names neither.
 *
 * A refusal of one PROPERTY — class-validator's dotted paths, `steps.2.titleAr`
 * or `steps.2.fields.0.optionsAr` — is kept under that property's name, so the
 * sentence lands under the very input it is about (the Arabic box beside the
 * English one), not in the form-wide banner where it used to fall.
 */
export function placeRefusals(
  fields: Record<string, string>,
  sent: readonly KycStepConfig[],
): Refusals {
  const out: Refusals = { byStep: {} };
  for (const [path, message] of Object.entries(fields)) {
    if (path === 'steps') {
      out.form = message;
      continue;
    }
    const match = /^steps\.(\d+)(?:\.fields\.(\d+))?(?:\.([A-Za-z]+)(?:\..*)?)?$/.exec(path);
    const step = match ? sent[Number(match[1])] : undefined;
    if (!match || !step) {
      out.form ??= message;
      continue;
    }
    const entry = (out.byStep[step.id] ??= { fields: {} });
    const field = match[2] === undefined ? undefined : step.fields[Number(match[2])];
    const property = match[3];
    if (field && property) {
      (entry.fieldProperties ??= {})[field.id] = {
        ...entry.fieldProperties?.[field.id],
        [property]: message,
      };
    } else if (field) entry.fields[field.id] = message;
    else if (match[2] === undefined && property && property !== 'fields') {
      (entry.properties ??= {})[property] = message;
    } else entry.step ??= message;
    out.firstStepId ??= step.id;
  }
  return out;
}
