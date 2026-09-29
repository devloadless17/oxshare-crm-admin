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
  it('Personal Information takes every kind — uploads included (Phase 2)', () => {
    expect(values('personal')).toEqual(FIELD_TYPES.map((type) => type.value));
  });

  it('a step of the broker’s own takes everything — questions and uploads', () => {
    expect(values('source-of-funds')).toEqual(FIELD_TYPES.map((type) => type.value));
    expect(takesOwnFields('source-of-funds')).toBe(true);
  });

  it.each(['document', 'address', 'selfie'])(
    '%s takes questions of every kind too (Phase 2)',
    (slug) => {
      expect(values(slug)).toEqual(FIELD_TYPES.map((type) => type.value));
      expect(takesOwnFields(slug)).toBe(true);
    },
  );
});

describe('what is the platform’s', () => {
  it('reads the server’s flags, and falls back to the slug for an older API', () => {
    expect(isCoreStep({ slug: 'selfie', core: undefined })).toBe(true);
    expect(isCoreStep({ slug: 'selfie', core: false })).toBe(false);
    expect(isCoreStep({ slug: 'funds', core: undefined })).toBe(false);
    // Phase 2: nothing is always on unless the server says so.
    expect(isAlwaysOn({ slug: 'document', alwaysOn: undefined })).toBe(false);
    expect(isAlwaysOn({ slug: 'personal', alwaysOn: false })).toBe(false);
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
