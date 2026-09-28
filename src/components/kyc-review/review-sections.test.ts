import { describe, expect, it } from 'vitest';
import {
  additionalSections,
  formatCalendarDate,
  identitySection,
  reviewDocumentGroups,
  reviewDocuments,
  reviewFieldGroups,
} from './review-sections';

/**
 * The review, from the server's layout (26 Sep 2026) — and the four ways the
 * old config-built review was wrong, each pinned.
 */

const LAYOUT = {
  identity: [
    { key: 'firstName' as const, label: 'First Name', required: true },
    { key: 'dateOfBirth' as const, label: 'Date of Birth', required: true },
    { key: 'postalCode' as const, label: 'Postal / ZIP code', required: false },
  ],
  identityDocument: {
    type: 'national_id',
    label: 'National ID',
    pages: [
      { slot: 'doc_front', label: 'Front Side', required: true },
      { slot: 'doc_back', label: 'Back Side', required: true },
    ],
  },
  proofOfAddress: {
    asked: true,
    type: 'utility_bill',
    label: 'Utility Bill',
    pages: [{ slot: 'address_proof', label: 'The Bill', required: true }],
  },
  selfie: { asked: true, label: 'Selfie' },
  additional: [
    {
      slug: 'source-of-funds',
      title: 'Source of funds',
      fields: [
        { name: 'customField_e', label: 'Employer', type: 'text', step: 'source-of-funds' },
        { name: 'customField_p', label: 'Payslip', type: 'file', step: 'source-of-funds' },
      ],
    },
  ],
  flags: [],
};

const DATA = {
  layout: LAYOUT,
  personalInfo: { firstName: 'Layla', dateOfBirth: '1990-04-12' },
  stepData: {
    'source-of-funds': {
      customField_e: 'Acme',
      customField_p: { filePath: '/uploads/kyc/p.png', fileName: 'payslip.png' },
    },
  },
  document: { docType: 'national_id', frontFilePath: '/uploads/kyc/f.png' },
  addressProof: { docType: 'utility_bill', filePath: '/uploads/kyc/b.png' },
  selfie: { filePath: '/uploads/kyc/s.png' },
  rejectedFields: ['customField_e'],
  maskedFields: [] as string[],
  // The generated type says `stepData` holds strings; a file answer is an object.
} as unknown as Parameters<typeof identitySection>[0];

describe('a calendar date', () => {
  it('reads on the day it IS, in every time zone', () => {
    // Parsed as UTC midnight and printed in the reader's zone, this was the
    // 11th west of Greenwich.
    expect(formatCalendarDate('1990-04-12')).toMatch(/12/);
    expect(formatCalendarDate('1990-04-12')).not.toMatch(/\b11\b/);
  });

  it('shows anything that is not a date exactly as stored', () => {
    expect(formatCalendarDate('twelfth of April')).toBe('twelfth of April');
  });
});

describe('the identity', () => {
  it('lists every field in the platform’s order, a blank one as "—"', () => {
    const rows = identitySection(DATA).rows;
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['First Name', 'Layla'],
      ['Date of Birth', expect.stringMatching(/12/)],
      ['Postal / ZIP code', '—'],
    ]);
  });

  it('says a masked field is hidden — never shows it, never shows it as blank', () => {
    const rows = identitySection({ ...DATA, maskedFields: ['kyc.personalInfo.firstName'] }).rows;
    expect(rows[0]).toMatchObject({ masked: true, value: 'Hidden by your permissions' });
  });
});

describe('the broker’s own questions', () => {
  it('reads each answer where it is filed, a file as something to open', () => {
    const [section] = additionalSections(DATA);
    expect(section?.rows.map((row) => [row.label, row.value, row.flagged])).toEqual([
      ['Employer', 'Acme', true],
      ['Payslip', 'payslip.png', false],
    ]);
    expect(section?.rows[1]?.file?.filePath).toBe('/uploads/kyc/p.png');
  });
});

describe('what a reviewer can return', () => {
  it('offers the identity, each document page that ARRIVED, and the broker’s own fields', () => {
    const groups = reviewFieldGroups(DATA);
    expect(groups.map((group) => group.fields.map((field) => field.id))).toEqual([
      ['firstName', 'dateOfBirth', 'postalCode'],
      // No back uploaded: asking to replace it would ask for something never sent.
      ['doc_front'],
      ['address_proof'],
      ['selfie'],
      ['customField_e', 'customField_p'],
    ]);
    expect(groups[1]?.fields[0]?.label).toBe('National ID — Front Side');
  });
});

describe('the documents', () => {
  it('names each by the document ON FILE — never a guessed passport', () => {
    expect(reviewDocuments(DATA).map((doc) => doc.label)).toEqual([
      'National ID — Front Side',
      'Utility Bill',
      'Selfie photo',
      'Payslip',
    ]);
  });
});

/*
 * Reported 28 Sep 2026: every file sat in ONE grid, so the selfie read as part
 * of the proof of address (it came straight after the tenancy agreement), and a
 * broker's live-camera question looked like a second selfie beside it.
 */
describe('the documents, grouped', () => {
  it('puts each part of the verification under its own heading, the broker’s steps by title', () => {
    const groups = reviewDocumentGroups(DATA);
    expect(groups.map((group) => [group.title, group.docs.map((doc) => doc.label)])).toEqual([
      ['Identity document', ['National ID — Front Side']],
      ['Proof of address', ['Utility Bill']],
      ['Selfie', ['Selfie photo']],
      ['Source of funds', ['Payslip']],
    ]);
  });

  it('keeps the lightbox’s one list in the SAME order as the groups', () => {
    expect(reviewDocuments(DATA)).toEqual(reviewDocumentGroups(DATA).flatMap((g) => g.docs));
  });

  it('leaves out a part with nothing on file', () => {
    const noSelfie = { ...DATA, selfie: undefined } as typeof DATA;
    expect(reviewDocumentGroups(noSelfie).map((group) => group.id)).toEqual([
      'identity',
      'address',
      'source-of-funds',
    ]);
  });
});

/*
 * Reported 28 Sep 2026: a returned ANSWER turned red, a returned passport or
 * bill never did. The tiles take the same rule as the answers.
 */
describe('the documents the reviewer returned', () => {
  const returnedIn = (status: string) =>
    ({
      ...DATA,
      status,
      document: { ...DATA.document, backFilePath: '/uploads/kyc/k.png' },
      rejectedFields: ['doc_back', 'address_proof', 'selfie', 'customField_p'],
    }) as typeof DATA;

  it('marks each returned file while it is with the client — a page, the selfie, a broker’s upload', () => {
    expect(
      reviewDocuments(returnedIn('rejected')).map((doc) => [doc.label, doc.returned === true]),
    ).toEqual([
      ['National ID — Front Side', false],
      ['National ID — Back Side', true],
      ['Utility Bill', true],
      ['Selfie photo', true],
      ['Payslip', true],
    ]);
  });

  it('marks nothing once the submission is back with the reviewer', () => {
    expect(reviewDocuments(returnedIn('submitted')).some((doc) => doc.returned)).toBe(false);
  });
});
