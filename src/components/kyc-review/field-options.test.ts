import { describe, expect, it } from 'vitest';
import { fieldGroupsFrom } from './field-options';
import type { components } from '@/lib/api/types.gen';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/*
 * The reject dialog offers only the document the client SENT, one box per page.
 *
 * It used to list every alternative on the step (passport, national ID, driving
 * licence), so a reviewer could reject a document nobody submitted — and the
 * chosen one was a single box, so a sharp front and a blurred back could only be
 * returned together.
 */
const doc = (name: string, value: string, category: string, parts: string[]) => ({
  id: name,
  name,
  label: name === 'nationalId' ? 'National ID' : name,
  type: `doc:${value}`,
  required: false,
  document: {
    value,
    label: name,
    category,
    parts: parts.map((label, i) => ({ key: `p${i}`, label, required: true })),
  },
});

const steps = [
  {
    id: 's2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity',
    enabled: true,
    fields: [
      doc('passport', 'passport', 'identity', ['Photo page']),
      doc('nationalId', 'national_id', 'identity', ['Front', 'Back']),
    ],
  },
  {
    id: 's4',
    stepNumber: 4,
    slug: 'address',
    title: 'Address',
    enabled: true,
    fields: [doc('utilityBill', 'utility_bill', 'address', ['Page 1', 'Page 2'])],
  },
] as unknown as KycStepConfig[];

describe('fieldGroupsFrom', () => {
  it('offers only the submitted document, one option per uploaded page', () => {
    const groups = fieldGroupsFrom(steps, {
      document: { docType: 'national_id', frontFilePath: 'a.jpg', backFilePath: 'b.jpg' },
      addressProof: { docType: 'utility_bill', filePath: 'c.pdf' },
    });
    expect(groups).toEqual([
      {
        group: 'Identity',
        fields: [
          { id: 'doc_front', label: 'National ID — Front' },
          { id: 'doc_back', label: 'National ID — Back' },
        ],
      },
      // One page uploaded: the document alone, no page name.
      { group: 'Address', fields: [{ id: 'address_proof', label: 'utilityBill' }] },
    ]);
  });

  it('falls back to one option per document field before the submission loads', () => {
    const [identity] = fieldGroupsFrom(steps);
    expect(identity!.fields.map((f) => f.id)).toEqual(['passport', 'nationalId']);
  });
});
