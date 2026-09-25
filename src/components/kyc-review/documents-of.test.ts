import { describe, expect, it } from 'vitest';
import { documentsOf } from './documents-of';
import type { KycSubmission } from '@/lib/api/admin';

/*
 * The regression: a proof of address can be TWO pages, and page 2 never
 * reached the reviewer.
 *
 * The wizard offers the second slot, the API stores it, counts it in the
 * document total and serves it — and this list built four candidates and
 * dropped it. So a two-page bank statement was decided on half its evidence
 * while the client's profile said four documents were on file. On a KYC
 * decision that is not a cosmetic gap.
 */
const base = {
  document: { docType: 'passport', frontFilePath: 'uploads/kyc/front.png' },
  selfie: { filePath: 'uploads/kyc/selfie.png' },
} as unknown as KycSubmission;

describe('documentsOf', () => {
  it('includes the SECOND page of a proof of address', () => {
    const docs = documentsOf({
      ...base,
      addressProof: {
        filePath: 'uploads/kyc/addr1.png',
        page2FilePath: 'uploads/kyc/addr2.png',
      },
    });

    expect(docs.map((d) => d.filePath)).toContain('uploads/kyc/addr2.png');
    expect(docs).toHaveLength(4);
  });

  it('omits it when the client uploaded only one page — no dead frame', () => {
    const docs = documentsOf({
      ...base,
      addressProof: { filePath: 'uploads/kyc/addr1.png' },
    });

    expect(docs).toHaveLength(3);
    expect(docs.every((d) => typeof d.filePath === 'string' && d.filePath)).toBe(true);
  });

  it('still drops the ID back for a passport, which has one page', () => {
    const docs = documentsOf({
      ...base,
      document: { docType: 'passport', frontFilePath: 'f.png', backFilePath: 'b.png' },
    });

    expect(docs.map((d) => d.filePath)).not.toContain('b.png');
  });
});

describe('a custom step’s uploads are documents like any other', () => {
  /*
   * Reported from production: a file uploaded on a step the broker added
   * reached the reviewer as its stored record — `{"fileName":"calculator_icon.jpg",
   * "filePath":"uploads/kyc/…"}` — and never as the picture. It is a tile in the
   * grid now, named the way the broker named the field.
   */
  const steps = [
    {
      id: 's9',
      stepNumber: 5,
      slug: 'source-of-funds',
      title: 'Source of funds',
      enabled: true,
      fields: [
        {
          id: 'f1',
          name: 'customField_1790263652846',
          label: 'Payslip',
          type: 'file',
          required: true,
        },
      ],
    },
  ] as never;

  it('adds the file to the grid, labelled by its configured field', () => {
    const docs = documentsOf(
      {
        ...base,
        stepData: {
          'source-of-funds': {
            customField_1790263652846: { filePath: 'uploads/kyc/pay.jpg', fileName: 'pay.jpg' },
            customField_1790263641710: 'Acme Ltd',
          },
        },
      } as unknown as KycSubmission,
      steps,
    );

    expect(docs.at(-1)).toEqual({
      filePath: 'uploads/kyc/pay.jpg',
      fileName: 'pay.jpg',
      label: 'Payslip',
    });
    // A typed answer is not a document.
    expect(docs).toHaveLength(3);
  });

  it('says so plainly when the field has since been removed from the form', () => {
    const docs = documentsOf({
      ...base,
      stepData: {
        'source-of-funds': {
          customField_1790263652846: { filePath: 'uploads/kyc/pay.jpg', fileName: 'pay.jpg' },
        },
      },
    } as unknown as KycSubmission);

    expect(docs.at(-1)?.label).toBe('Question no longer on the form');
  });
});

describe('an extra upload a broker added to a BUILT-IN step', () => {
  // Asked for in local testing: questions and uploads on Proof of Address.
  it('reaches the reviewer as a tile, named by its field', () => {
    const docs = documentsOf(
      {
        ...base,
        stepData: {
          address: { prooof3: { filePath: 'uploads/kyc/lease.png', fileName: 'lease.png' } },
        },
      } as unknown as KycSubmission,
      [
        {
          id: 'step-4',
          stepNumber: 4,
          slug: 'address',
          title: 'Proof of Address',
          enabled: true,
          fields: [{ id: 'f', name: 'prooof3', label: 'Lease', type: 'file', required: true }],
        },
      ],
    );
    expect(docs).toContainEqual(
      expect.objectContaining({ filePath: 'uploads/kyc/lease.png', label: 'Lease' }),
    );
  });
});
