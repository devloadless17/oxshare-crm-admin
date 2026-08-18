import { describe, expect, it } from 'vitest';
import { buildKycDocUrl } from './kyc-doc-url';

describe('buildKycDocUrl', () => {
  it('handles multer-style stored paths (uploads/kyc/<file>)', () => {
    expect(buildKycDocUrl('uploads/kyc/123-abc.png')).toBe(
      'http://localhost:3001/v1/uploads/kyc/123-abc.png',
    );
  });

  it('handles dot-relative stored paths (./uploads/kyc/<file>)', () => {
    expect(buildKycDocUrl('./uploads/kyc/123-abc.png')).toBe(
      'http://localhost:3001/v1/uploads/kyc/123-abc.png',
    );
  });

  it('handles bare filenames', () => {
    expect(buildKycDocUrl('123-abc.png')).toBe('http://localhost:3001/v1/uploads/kyc/123-abc.png');
  });

  it('normalizes Windows backslashes', () => {
    expect(buildKycDocUrl('.\\uploads\\kyc\\123-abc.png')).toBe(
      'http://localhost:3001/v1/uploads/kyc/123-abc.png',
    );
  });

  it('handles a leading slash', () => {
    expect(buildKycDocUrl('/uploads/kyc/123-abc.png')).toBe(
      'http://localhost:3001/v1/uploads/kyc/123-abc.png',
    );
  });

  it('never doubles the kyc segment (the original bug)', () => {
    for (const p of ['uploads/kyc/a.png', './uploads/kyc/a.png', 'a.png']) {
      expect(buildKycDocUrl(p)).not.toContain('kyc/kyc/');
    }
  });

  it('returns empty string for missing input', () => {
    expect(buildKycDocUrl(undefined)).toBe('');
    expect(buildKycDocUrl('')).toBe('');
  });
});
