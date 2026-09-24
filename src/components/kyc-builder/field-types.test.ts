import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, fieldTypesForStep, lockedReason } from './field-types';

/**
 * The builder offers each step what it can hold — its copy of the server's
 * `assertFieldsFitTheirStep`, which refuses the rest on save. From local
 * testing: questions and uploads wanted on the built-in steps, and documents
 * kept to the two document steps, where they have a home.
 */

const doc = (value: string, category: 'identity' | 'address') => ({
  value,
  label: value,
  category,
  parts: [{ key: 'front', label: 'Front', required: true }],
});
const CATALOGUE = [
  doc('passport', 'identity'),
  doc('national_id', 'identity'),
  doc('utility_bill', 'address'),
];
const values = (slug: string, field?: { name: string }) => {
  const offered = fieldTypesForStep(slug, CATALOGUE, field);
  return [...offered.base.map((t) => t.value), ...offered.documents.map((d) => `doc:${d.value}`)];
};
const BASE = FIELD_TYPES.map((t) => t.value);

describe('the types each step offers', () => {
  it('every plain type on EVERY step — built-in or added', () => {
    for (const slug of ['personal', 'selfie', 'source-of-funds'])
      expect(values(slug)).toEqual(BASE);
  });

  it('documents only on the step that holds their kind', () => {
    expect(values('document')).toEqual([...BASE, 'doc:passport', 'doc:national_id']);
    expect(values('address')).toEqual([...BASE, 'doc:utility_bill']);
  });

  it('the selfie step’s own camera stays a camera', () => {
    expect(values('selfie', { name: 'selfie' })).toEqual(['camera']);
    expect(values('selfie', { name: 'customField_1' })).toEqual(BASE);
  });

  it('reads the table by OWN key — `constructor` is a step somebody added', () => {
    expect(values('constructor')).toEqual(BASE);
  });
});

describe('what cannot be removed — a step nobody could complete', () => {
  const passport = { name: 'passport', type: 'doc:passport' };
  const idCard = { name: 'nationalId', type: 'doc:national_id' };
  const note = { name: 'note', type: 'text' };

  it('the selfie camera', () => {
    expect(lockedReason('selfie', { name: 'selfie', type: 'camera' }, [])).toBe('selfie');
  });

  it('the LAST document on a document step — not one of several, and never an extra', () => {
    expect(lockedReason('document', passport, [passport, note])).toBe('lastDocument');
    expect(lockedReason('document', passport, [passport, idCard])).toBeUndefined();
    expect(lockedReason('document', note, [passport, note])).toBeUndefined();
  });
});
