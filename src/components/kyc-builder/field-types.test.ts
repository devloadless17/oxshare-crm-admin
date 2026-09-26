import { describe, expect, it } from 'vitest';
import {
  FIELD_TYPES,
  fieldTypesForStep,
  isAlwaysOn,
  isCoreStep,
  ownFields,
  takesOwnFields,
} from './field-types';

/**
 * What a broker's own field may be, and where — the screen's copy of the
 * server's rule (`assertStepsHoldWhatTheyAreFor`, the identity core, 26 Sep 2026).
 */

const values = (slug: string) => fieldTypesForStep(slug).map((type) => type.value);

describe('the types each step offers the broker', () => {
  it('Personal Information takes QUESTIONS, never an upload', () => {
    expect(values('personal')).toEqual(['text', 'date', 'phone', 'select', 'checkbox']);
  });

  it('a step of the broker’s own takes everything — questions and uploads', () => {
    expect(values('source-of-funds')).toEqual(FIELD_TYPES.map((type) => type.value));
    expect(takesOwnFields('source-of-funds')).toBe(true);
  });

  it.each(['document', 'address', 'selfie'])('%s takes nothing of the broker’s own', (slug) => {
    expect(values(slug)).toEqual([]);
    expect(takesOwnFields(slug)).toBe(false);
  });
});

describe('what is the platform’s', () => {
  it('reads the server’s flags, and falls back to the slug for an older API', () => {
    expect(isCoreStep({ slug: 'selfie', core: undefined })).toBe(true);
    expect(isCoreStep({ slug: 'selfie', core: false })).toBe(false);
    expect(isCoreStep({ slug: 'funds', core: undefined })).toBe(false);
    expect(isAlwaysOn({ slug: 'document', alwaysOn: undefined })).toBe(true);
    expect(isAlwaysOn({ slug: 'address', alwaysOn: undefined })).toBe(false);
  });

  it('keeps the identity and the documents out of the broker’s own fields', () => {
    const fields = [
      { id: 'f-1', system: true, type: 'text' },
      { id: 'd', system: undefined, type: 'doc:passport' },
      { id: 'q', system: undefined, type: 'text' },
    ] as const;
    expect(ownFields(fields).map((field) => field.id)).toEqual(['q']);
  });
});
