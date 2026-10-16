import { describe, expect, it } from 'vitest';
import { measureQuality, isBlankPixels } from './image-quality';

/**
 * The selfie quality hint, and the two ways it must fail SAFELY.
 *
 * It is not a security control — it runs in the client's browser and
 * `POST /kyc/upload` takes any JPEG from anyone — so nothing here asserts that a
 * bad frame is refused. What is asserted is the opposite pair: an ordinary photo
 * is waved through, and anything unmeasurable is waved through too.
 *
 * A gate that refuses a usable photo is worse than no gate. The client cannot
 * see what it saw, cannot argue with it, and has no way forward.
 *
 * Written against `measureQuality` (pixels) rather than `findQualityProblem`
 * (canvas) on purpose: jsdom has no 2D context, so canvas-based cases SKIP — and
 * a skipped test reports as PASSING. Four skipped cases would have read as
 * coverage while checking nothing.
 */

/** An RGBA buffer from a per-pixel grey value. */
function frame(width: number, height: number, grey: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = grey(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

const W = 64;
const H = 48;

describe('the selfie quality hint', () => {
  it('calls a near-black frame too dark', () => {
    expect(
      measureQuality(
        frame(W, H, () => 5),
        W,
        H,
      ),
    ).toBe('too_dark');
  });

  /** Bright, and with no detail at all — the focus measure reads zero. */
  it('calls a bright but featureless frame too blurry', () => {
    expect(
      measureQuality(
        frame(W, H, () => 154),
        W,
        H,
      ),
    ).toBe('too_blurry');
  });

  /** The case that matters most: an ordinary photo passes untouched. */
  it('passes a well-lit frame with detail in it', () => {
    const detailed = frame(W, H, (x) => (x % 6 < 3 ? 40 : 190));
    expect(measureQuality(detailed, W, H)).toBeNull();
  });

  /**
   * The thresholds are deliberately LOW, and this pins that rather than the
   * numbers: a dim-but-readable frame — an indoor room, not a dark one — must
   * not be called too dark, because that is the false refusal that makes the
   * whole hint a liability.
   */
  it('does not complain about a merely DIM frame with detail', () => {
    const dim = frame(W, H, (x) => (x % 6 < 3 ? 55 : 110));
    expect(measureQuality(dim, W, H)).toBeNull();
  });

  /**
   * Silence, not a refusal, when it cannot measure. A hint that cannot run must
   * never be the reason somebody cannot finish onboarding.
   */
  it.each([
    ['a zero-sized frame', 0, 0],
    ['a frame below the sampling floor', 4, 4],
  ])('says nothing about %s', (_label, w, h) => {
    expect(
      measureQuality(
        frame(Math.max(w, 1), Math.max(h, 1), () => 0),
        w,
        h,
      ),
    ).toBeNull();
  });

  it('says nothing when the buffer is shorter than the stated size', () => {
    expect(measureQuality(new Uint8ClampedArray(16), W, H)).toBeNull();
  });
});

describe('isBlankPixels — the black frame a phone can hand back', () => {
  const frame = (r: number, g: number, b: number, a = 255, n = 64) =>
    new Uint8ClampedArray(Array.from({ length: n }, () => [r, g, b, a]).flat());

  it('is blank when every pixel is black', () => {
    expect(isBlankPixels(frame(0, 0, 0))).toBe(true);
  });

  it('is blank when every pixel is transparent (an empty canvas)', () => {
    expect(isBlankPixels(frame(0, 0, 0, 0))).toBe(true);
  });

  it('is NOT blank for a dark but real photo with one lit pixel', () => {
    const dark = frame(5, 5, 5);
    dark.set([90, 80, 70, 255], 40);
    expect(isBlankPixels(dark)).toBe(false);
  });

  it('is NOT blank for an ordinary frame', () => {
    expect(isBlankPixels(frame(120, 110, 100))).toBe(false);
  });
});
