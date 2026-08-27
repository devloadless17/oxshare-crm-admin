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
