import { describe, expect, it } from 'vitest';
import { avatarSrc, initialsFor } from './avatar';

/**
 * The path arithmetic that decides whether a photo appears at all.
 *
 * This is the avatar twin of `kyc-doc-url.test.ts`, and it exists for the same
 * reason that one does: the failure is SILENT. `AvatarImage` falls back to
 * initials when the image 404s, so a wrong prefix does not show a broken image
 * — it shows the same initials the operator saw before they uploaded anything,
 * which reads as "the upload did not work" and sends somebody looking in the
 * wrong place entirely.
 */

describe('avatarSrc', () => {
  it('routes a stored path to the API origin', () => {
    // The API returns a path on its OWN origin. Rendered verbatim it asks the
    // Next server for a file it does not have.
    expect(avatarSrc('/uploads/admin-avatars/abc.png')).toBe(
      'http://localhost:3001/v1/uploads/admin-avatars/abc.png',
    );
  });

  it('does not double the prefix on a path that already lacks a slash', () => {
    expect(avatarSrc('uploads/admin-avatars/abc.png')).toBe(
      'http://localhost:3001/v1/uploads/admin-avatars/abc.png',
    );
  });

  it('normalises the shapes a filesystem path can arrive in', () => {
    // Windows separators and a leading './' both reach the API from multer's
    // own path handling — `kyc-doc-url.ts` was written after meeting all three.
    expect(avatarSrc('./uploads/admin-avatars/abc.png')).toBe(
      'http://localhost:3001/v1/uploads/admin-avatars/abc.png',
    );
    expect(avatarSrc('uploads\\admin-avatars\\abc.png')).toBe(
      'http://localhost:3001/v1/uploads/admin-avatars/abc.png',
    );
  });

  it('leaves an absolute URL alone', () => {
    // The §8.5 move to private object storage returns a signed URL. Prefixing
    // it would break every photo on the day that lands.
    const signed = 'https://cdn.example.com/a.png?sig=x';
    expect(avatarSrc(signed)).toBe(signed);
  });

  it('returns undefined for no photo, never an empty string', () => {
    /*
     * `AvatarImage` treats a falsy src as "render the fallback", and both
     * values are falsy — but an empty-string `src` on a bare <img> makes some
     * browsers re-request the current page. Undefined is the one that cannot.
     */
    expect(avatarSrc(null)).toBeUndefined();
    expect(avatarSrc(undefined)).toBeUndefined();
    expect(avatarSrc('')).toBeUndefined();
  });
});

describe('initialsFor', () => {
  it('takes the first and last word of a single name field', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL');
  });

  it('handles a middle name by ignoring it', () => {
    expect(initialsFor('Ada Byron Lovelace')).toBe('AL');
  });

  it('falls back to one letter for a single-word name', () => {
    expect(initialsFor('Ada')).toBe('A');
  });

  it('never renders an empty circle', () => {
    // 'U' for unknown. An empty avatar reads as a failed render rather than a
    // missing name.
    expect(initialsFor('')).toBe('U');
    expect(initialsFor(null)).toBe('U');
    expect(initialsFor('   ')).toBe('U');
  });
});
