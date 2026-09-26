import type { components } from '@/lib/api/types.gen';

type KycFieldType = components['schemas']['KycFieldConfigDto']['type'];
type KycStep = components['schemas']['KycStepConfigDto'];
type KycField = components['schemas']['KycFieldConfigDto'];

/**
 * EVERY base type in the schema, in one place.
 *
 * The union lives in `types.gen.ts` and TypeScript checks this list against it
 * — `satisfies` below means a type added to the API and not added here is a
 * compile error rather than a silently unofferable option.
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

export type FieldTypeOption = (typeof FIELD_TYPES)[number];

/**
 * The four built-in steps (the identity core, backend `common/kyc/identity-core.ts`).
 * The API marks them `core`; the slug is the fallback for a response from an
 * API that predates the flag.
 */
const CORE_SLUGS: readonly string[] = ['personal', 'document', 'selfie', 'address'];

export function isCoreStep(step: Pick<KycStep, 'slug' | 'core'>): boolean {
  return step.core ?? CORE_SLUGS.includes(step.slug);
}

/** Personal Information and Identity Document: a verification IS these two. */
export function isAlwaysOn(step: Pick<KycStep, 'slug' | 'alwaysOn'>): boolean {
  return step.alwaysOn ?? (step.slug === 'personal' || step.slug === 'document');
}

/** The platform's own field — an identity field or the selfie camera. Fixed, never edited. */
export function isSystemField(field: Pick<KycField, 'system'>): boolean {
  return field.system === true;
}

export function isDocumentField(field: Pick<KycField, 'type'>): boolean {
  return field.type.startsWith('doc:');
}

/** The broker's own fields on a step — never the platform's, never a catalogue document. */
export function ownFields<F extends Pick<KycField, 'system' | 'type'>>(fields: readonly F[]): F[] {
  return fields.filter((field) => !isSystemField(field) && !isDocumentField(field));
}

/**
 * What a field of the broker's may be, on this step (the server's rule,
 * `assertStepsHoldWhatTheyAreFor`):
 *
 *  - on Personal Information, a QUESTION — never an upload, so a document the
 *    client sends is never mixed in with who they are;
 *  - on a step of the broker's own, anything — questions and uploads;
 *  - on Identity Document, Proof of Address and Selfie, nothing: those hold
 *    only their own documents and camera.
 */
export function fieldTypesForStep(slug: string): readonly FieldTypeOption[] {
  if (slug === 'personal') {
    return FIELD_TYPES.filter((type) => type.value !== 'file' && type.value !== 'camera');
  }
  return CORE_SLUGS.includes(slug) ? [] : FIELD_TYPES;
}

/** Whether the broker may add their own fields to this step at all. */
export function takesOwnFields(slug: string): boolean {
  return fieldTypesForStep(slug).length > 0;
}
