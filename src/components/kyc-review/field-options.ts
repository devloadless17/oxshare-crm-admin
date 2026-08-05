import type { components } from '@/lib/api/types.gen';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

export interface FieldGroup {
  group: string;
  fields: { id: string; label: string }[];
}

/**
 * The fields a reviewer can flag for re-submission.
 *
 * The ids are what `PATCH /admin/kyc/:id/reject` receives as `rejectedFields`,
 * and the client portal reads them back to highlight what needs fixing — so they
 * are a CONTRACT, not labels.
 *
 * ## Why this is derived rather than hardcoded
 *
 * It used to be a fixed array, which quietly contradicted the KYC step builder
 * (D-29). A field added through `/kyc/builder`:
 *
 *   - appears in the client's wizard,
 *   - appears in the reviewer's Personal Information card (which iterates
 *     `Object.entries(personalInfo)`),
 *   - and could NOT be flagged for correction, because it was not in the list.
 *
 * So a reviewer could see a bad value and have no way to ask for that specific
 * thing to be fixed. The list now comes from the same configuration the portal
 * renders from, which makes the two agree by construction rather than by
 * somebody remembering to edit both.
 */
export function fieldGroupsFrom(steps: KycStepConfig[] | undefined): FieldGroup[] {
  if (!steps || steps.length === 0) return FALLBACK_FIELD_OPTIONS;

  const groups = steps
    .filter((s) => s.enabled !== false && s.slug !== 'review')
    .map((step) => ({
      group: step.title,
      fields: (step.fields ?? [])
        // `docType` selects WHICH document to upload; it is not something a
        // client can be asked to correct on its own.
        .filter((f) => f.name !== 'docType')
        .map((f) => ({ id: f.name, label: f.label })),
    }))
    .filter((g) => g.fields.length > 0);

  // An empty derivation means the config loaded but described nothing usable.
  // Falling back beats rendering a reject dialog with no fields at all.
  return groups.length > 0 ? groups : FALLBACK_FIELD_OPTIONS;
}

/**
 * Used only when `GET /admin/kyc-config` is unavailable.
 *
 * These are the four mandated slugs' fields as seeded, so a reviewer can still
 * work while the config endpoint is down. It is a fallback, not a source of
 * truth — anything added through the builder is missing from it, which is
 * exactly the defect above, and is why it is reached only on failure.
 */
export const FALLBACK_FIELD_OPTIONS: FieldGroup[] = [
  {
    group: 'Personal Information',
    fields: [
      { id: 'firstName', label: 'First Name' },
      { id: 'lastName', label: 'Last Name' },
      { id: 'dateOfBirth', label: 'Date of Birth' },
      { id: 'phone', label: 'Phone Number' },
      { id: 'nationality', label: 'Nationality' },
      { id: 'country', label: 'Country' },
      { id: 'address', label: 'Address' },
    ],
  },
  {
    group: 'Documents & Verification',
    fields: [
      { id: 'doc_front', label: 'ID / Passport Photo' },
      { id: 'doc_back', label: 'ID Back Side' },
      { id: 'selfie', label: 'Selfie Photo' },
      { id: 'address_proof', label: 'Proof of Address' },
    ],
  },
];
