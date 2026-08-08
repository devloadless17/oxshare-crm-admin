import { describe, expect, it } from 'vitest';
import { assetUrl } from './asset-url';

/**
 * TWIN of the same path in the sibling app.
 *
 * Every assertion here is a shape that reached a real `<img src>` and failed
 * silently — a missing brand mark reads as a broken image file, not as a path
 * the browser resolved against the wrong origin. None of these is caught by a
 * type: they are all `string`.
 */
describe('assetUrl', () => {
  /**
   * ⚠️ THE BUG. The upload endpoint answers with exactly this shape.
   *
   * The version segment is ADDED by the `/api/:path*` rewrite, so it must not
   * survive into the path handed to it — and the `/api` prefix must be added,
   * because this app's own origin serves no `/v1`.
   */
  it('routes an API upload path through the proxy, dropping the version segment', () => {
    expect(assetUrl('/v1/uploads/payment-logos/f1cb4bf8.png')).toBe(
      '/api/uploads/payment-logos/f1cb4bf8.png',
    );
  });

  it('does not double the version segment', () => {
    expect(assetUrl('/v1/uploads/x.png')).not.toContain('/v1');
  });

  /*
   * The seeded Whish logo is an https URL on a CDN, and the API still accepts
   * one. Rewriting it would point the browser at `/api/https://…`.
   */
  it('leaves an absolute https URL alone', () => {
    expect(assetUrl('https://cdn.example.com/whish.svg')).toBe('https://cdn.example.com/whish.svg');
  });

  /*
   * `null` is what a method with no logo carries. `undefined` out, so a caller
   * hands the result to an optional `src` without deciding what absent means —
   * an empty string as `src` makes a browser refetch the current PAGE as an
   * image.
   */
  it('answers undefined for a missing logo', () => {
    expect(assetUrl(null)).toBeUndefined();
    expect(assetUrl(undefined)).toBeUndefined();
    expect(assetUrl('   ')).toBeUndefined();
  });

  /*
   * Anchored at the start and requiring the following slash, so a bucket whose
   * name merely BEGINS with `v1` keeps its path. `/v1x/…` is not a version.
   */
  it('strips /v1 only as a whole leading segment', () => {
    expect(assetUrl('/v1x/logo.png')).toBe('/api/v1x/logo.png');
    expect(assetUrl('/uploads/v1/logo.png')).toBe('/api/uploads/v1/logo.png');
  });

  it('tolerates a path that arrives without its leading slash', () => {
    expect(assetUrl('uploads/logo.png')).toBe('/api/uploads/logo.png');
  });
});
