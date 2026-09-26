import { describe, expect, it } from 'vitest';
import {
  additionalSections,
  formatCalendarDate,
  identitySection,
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
