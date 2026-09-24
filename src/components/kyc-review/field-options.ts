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
export function fieldGroupsFrom(
  steps: KycStepConfig[] | undefined,
  submission?: SubmissionFiles | null,
): FieldGroup[] {
  if (!steps || steps.length === 0) return FALLBACK_FIELD_OPTIONS;

  const groups = steps
    .filter((s) => s.enabled !== false && s.slug !== 'review')
    .map((step) => ({
      group: step.title,
      fields: (step.fields ?? [])
        // `docType` selects WHICH document to upload; it is not something a
        // client can be asked to correct on its own.
        .filter((f) => f.name !== 'docType')
        .flatMap((f) =>
          f.document ? documentOptions(step.slug, f, submission) : [{ id: f.name, label: f.label }],
        ),
    }))
    .filter((g) => g.fields.length > 0);

  // An empty derivation means the config loaded but described nothing usable.
  // Falling back beats rendering a reject dialog with no fields at all.
  return groups.length > 0 ? groups : FALLBACK_FIELD_OPTIONS;
}

/** The half of a submission this module reads — where each document's files are. */
export interface SubmissionFiles {
  document?: { docType?: string; frontFilePath?: string; backFilePath?: string };
  addressProof?: { docType?: string; filePath?: string; page2FilePath?: string };
  stepData?: Record<string, Record<string, unknown>>;
}

type KycField = KycStepConfig['fields'][number];

/** Where each page of a canonical document is stored, by position. */
const PAGE_IDS = {
  identity: ['doc_front', 'doc_back'],
  address: ['address_proof', 'address_proof_2'],
} as const;

/**
 * The options one DOCUMENT field contributes: only the document the client
 * actually sent, one checkbox per page they uploaded.
 *
 * A document step offers alternatives — passport, national ID, driving licence
 * — of which the client submits ONE. Listing every alternative asked the
 * reviewer to reject a driving licence nobody sent, and listing the chosen one
 * as a single box made a two-sided ID all-or-nothing: a sharp front and a
 * blurred back could only be returned together, so the client re-shot both.
 *
 * Each page is identified by its STORAGE id (`doc_front`, `doc_back`, …), the
 * vocabulary the portal already uses to find the file, so a rejected back side
 * lights up exactly that row on the client's documents table.
 *
 * With no submission to read (it has not loaded) the field falls back to one
 * option under its own name — the old behaviour, still a valid id.
 */
function documentOptions(
  slug: string,
  field: KycField,
  submission?: SubmissionFiles | null,
): { id: string; label: string }[] {
  const doc = field.document!;
  if (!submission) return [{ id: field.name, label: field.label }];

  const category = doc.category === 'address' ? 'address' : 'identity';
  const isCanonical = slug === 'document' || slug === 'address';

  if (!isCanonical) {
    // A custom step stores the document under the field's own key.
    const stored = submission.stepData?.[slug]?.[field.name];
    return stored ? [{ id: field.name, label: field.label }] : [];
  }

  const storedType =
    category === 'address' ? submission.addressProof?.docType : submission.document?.docType;
  if (storedType !== doc.value) return [];

  const files =
    category === 'address'
      ? [submission.addressProof?.filePath, submission.addressProof?.page2FilePath]
      : [submission.document?.frontFilePath, submission.document?.backFilePath];

  const options = PAGE_IDS[category].flatMap((id, i) => {
    if (!files[i]) return [];
    const part = doc.parts[i]?.label;
    const onePage = !files[1];
    return [{ id, label: onePage || !part ? field.label : `${field.label} — ${part}` }];
  });
  return options;
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
