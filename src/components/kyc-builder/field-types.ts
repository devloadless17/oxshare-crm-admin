import type { components } from '@/lib/api/types.gen';

type KycFieldType = components['schemas']['KycFieldConfigDto']['type'];
type KycDocumentType = components['schemas']['KycDocumentTypeDto'];

/**
 * EVERY base type in the schema, in one place.
 *
 * The union lives in `types.gen.ts` and TypeScript checks this list against it
 * — `satisfies` below means a type added to the API and not added here is a
 * compile error rather than a silently unofferable option. The builder was
 * previously missing `camera` for exactly that reason: the hand-written copy of
 * the union omitted it.
 */
export const FIELD_TYPES = [
  { value: 'text', label: 'builder.typeText' },
  { value: 'date', label: 'builder.typeDate' },
  { value: 'phone', label: 'builder.typePhone' },
  { value: 'select', label: 'builder.typeSelect' },
  { value: 'file', label: 'builder.typeFile' },
  { value: 'camera', label: 'builder.typeCamera' },
  { value: 'checkbox', label: 'builder.typeCheckbox' },
] as const satisfies readonly { value: KycFieldType; label: string }[];

/**
 * What a field on this step may be — the builder's copy of the server's rule
 * (`assertFieldsFitTheirStep`, backend `kyc-config-integrity.ts`), which
 * refuses anything else on save.
 *
 * EVERY base type on EVERY step: a broker may add questions and uploads to the
 * built-in steps as readily as to one they add (asked for in local testing),
 * and their answers are kept, checked and shown to the reviewer like any other.
 *
 * A catalogue DOCUMENT only on the step that holds its kind — the identity step
 * or the proof-of-address step. Anywhere else a document had no real home, and
 * a week of bugs came from giving it one; a File field per photo does that job.
 *
 * The selfie step's own camera stays a camera: it is how the step takes the one
 * selfie the server asks for.
 */
const DOCUMENT_STEPS: Readonly<Record<string, 'identity' | 'address'>> = {
  document: 'identity',
  address: 'address',
};

/** The kind of document a step holds — own keys only, so `constructor` holds none. */
function documentKindOf(slug: string): 'identity' | 'address' | undefined {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_STEPS, slug)
    ? DOCUMENT_STEPS[slug]
    : undefined;
}

/** The selfie step's own camera — the field the server's selfie comes from. */
export function isCanonicalSelfie(slug: string, field: { name: string }): boolean {
  return slug === 'selfie' && field.name === 'selfie';
}

export interface StepFieldTypes {
  base: readonly (typeof FIELD_TYPES)[number][];
  documents: KycDocumentType[];
}

export function fieldTypesForStep(
  slug: string,
  catalogue: readonly KycDocumentType[],
  field?: { name: string },
): StepFieldTypes {
  if (field && isCanonicalSelfie(slug, field)) {
    return { base: FIELD_TYPES.filter((type) => type.value === 'camera'), documents: [] };
  }
  const kind = documentKindOf(slug);
  return {
    base: FIELD_TYPES,
    documents: kind ? catalogue.filter((doc) => doc.category === kind) : [],
  };
}

/**
 * Why this field cannot be removed, or `undefined` when it can.
 *
 * An enabled document step with no document to choose, or a selfie step with no
 * camera, is a step no client could complete — the server refuses to save one.
 * Saying so on the button, rather than in an error after Save, is the point.
 */
export function lockedReason(
  slug: string,
  field: { name: string; type: string },
  fields: readonly { type: string }[],
): 'selfie' | 'lastDocument' | undefined {
  if (isCanonicalSelfie(slug, field)) return 'selfie';
  const isDocument = (type: string) => type.startsWith('doc:');
  if (
    documentKindOf(slug) &&
    isDocument(field.type) &&
    fields.filter((candidate) => isDocument(candidate.type)).length === 1
  ) {
    return 'lastDocument';
  }
  return undefined;
}
