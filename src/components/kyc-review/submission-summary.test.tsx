import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SubmissionSummary } from './submission-summary';

/**
 * The review's left column, as the reviewer reads it after a rejection
 * (reported 28 Sep 2026):
 *
 *  - the selfie row had no heading of its own, so it read as a page of the
 *    proof of address above it;
 *  - a returned ANSWER turned red, a returned DOCUMENT page never did — the
 *    passport and the bill kept saying "Uploaded" in black.
 */

const LAYOUT = {
  identity: [{ key: 'firstName' as const, label: 'First Name', required: true }],
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
    type: 'tenancy_agreement',
    label: 'Tenancy Agreement',
    pages: [
      { slot: 'address_proof', label: 'Signature Page', required: true },
      { slot: 'address_proof_2', label: 'Additional Page', required: false },
    ],
  },
  selfie: { asked: true, label: 'Selfie' },
  additional: [],
  flags: [],
};

function detail(status: string, rejectedFields: string[]) {
  return {
    status,
    layout: LAYOUT,
    personalInfo: { firstName: 'Layla' },
    document: {
      docType: 'national_id',
      frontFilePath: '/uploads/kyc/f.png',
      backFilePath: '/uploads/kyc/b.png',
    },
    addressProof: {
      docType: 'tenancy_agreement',
      filePath: '/uploads/kyc/t1.png',
      page2FilePath: '/uploads/kyc/t2.png',
    },
    selfie: { filePath: '/uploads/kyc/s.png' },
    rejectedFields,
    maskedFields: [] as string[],
    user: { emailVerified: true },
  } as unknown as Parameters<typeof SubmissionSummary>[0]['data'];
}

/** The value shown beside a row's label. */
function valueOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.info-row') as HTMLElement;
  return row.querySelector('strong') as HTMLElement;
}

describe('the documents in the summary', () => {
  it('gives the selfie its OWN heading, after the proof of address', () => {
    renderWithProviders(<SubmissionSummary data={detail('submitted', [])} attempts={[]} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const address = headings.indexOf('Proof of address');
    const selfie = headings.indexOf('Selfie');
    expect(address).toBeGreaterThanOrEqual(0);
    expect(selfie).toBe(address + 1);
    expect(screen.getByText('Selfie photo')).toBeInTheDocument();
  });

  it('marks every RETURNED page red, like a returned answer — and only those', () => {
    renderWithProviders(
      <SubmissionSummary
        data={detail('rejected', ['doc_back', 'address_proof_2', 'selfie'])}
        attempts={[]}
      />,
    );
    for (const label of [
      'National ID — Back Side',
      'Tenancy Agreement — Additional Page',
      'Selfie photo',
    ]) {
      const value = valueOf(label);
      expect(value, label).toHaveTextContent('Returned');
      expect(value, label).toHaveClass('text-destructive');
    }
    for (const label of ['National ID — Front Side', 'Tenancy Agreement — Signature Page']) {
      const value = valueOf(label);
      expect(value, label).toHaveTextContent('Uploaded');
      expect(value, label).not.toHaveClass('text-destructive');
    }
  });

  it('stops marking them once the submission is back with the reviewer', () => {
    renderWithProviders(
      <SubmissionSummary data={detail('submitted', ['doc_back'])} attempts={[]} />,
    );
    expect(within(valueOf('National ID — Back Side')).queryByText('Returned')).toBeNull();
    expect(valueOf('National ID — Back Side')).toHaveTextContent('Uploaded');
  });
});
