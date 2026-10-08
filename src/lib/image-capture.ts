/**
 * Preparing a phone photo of an identity document for upload.
 *
 * ## The three problems this solves, and why they are one function
 *
 * 1. **Orientation.** Phone photos are stored in the sensor's native rotation
 *    with an EXIF tag saying how to turn them. Nothing in this system applied
 *    it — not the portal, not the upload path, not the admin viewer — so a
 *    reviewer regularly received a sideways ID, rejected it as unreadable, and
 *    the client was asked days later to re-photograph a document that was
 *    perfectly legible and merely rotated.
 *
 * 2. **GPS.** The same EXIF block routinely carries the coordinates where the
 *    photo was taken, the device serial and the capture time. Nobody chose to
 *    collect a client's home location; it is what happens when a camera
 *    original is stored verbatim.
 *
 * 3. **Size.** A modern phone camera produces 3–12 MB. Over mobile data that is
 *    minutes of upload, and past 10 MB it is refused outright — which, for
 *    someone who cannot resize a photo on a phone, is where signup is abandoned.
 *
 * All three are fixed by the same act: decode the image, draw it to a canvas in
 * its correct orientation, and re-encode. Doing them separately would mean
 * decoding the same multi-megabyte image three times.
 *
 * ## What is deliberately NOT altered
 *
 * An image already within the size cap is **not scaled**. Its pixels are the
 * pixels the client captured. The re-encode still happens — that is what applies
 * the rotation and drops the GPS block — but nothing is thrown away for the sake
 * of a smaller file.
 *
 * `MAX_EDGE` is set well above what a reviewer needs rather than at it: 2000px
 * on the long edge is roughly 250 dpi across a passport bio page, comfortably
 * enough to read a machine-readable zone, and several times a 300 dpi scan of an
 * ID card's short dimension. The compression is high-quality for the same
 * reason. This is a compliance document, so the bias is towards keeping detail
 * and paying for it in bytes.
 *
 * Non-images — a PDF bank statement — are passed through untouched. There is
 * nothing to orient, no EXIF to strip, and rasterising a PDF would destroy the
 * one format that is already both small and sharp.
 */

import { t } from '@/lib/i18n';

/** The longest edge we will store. See the note above on why it is generous. */
export const MAX_EDGE = 2000;

/**
 * Below this, a document is likely to come back rejected as unreadable.
 *
 * A WARNING threshold, never a block. 1000px on the long edge is about 125 dpi
 * across an ID card — poor, but sometimes legible, and a legitimate small scan
 * refused outright is a worse outcome than a marginal one a reviewer can judge.
 * The client is told; the decision stays with the human who can actually see it.
 */
export const MIN_READABLE_EDGE = 1000;

/** High enough that the re-encode is not what makes a document unreadable. */
const JPEG_QUALITY = 0.92;

/**
 * How long to wait for a decode before giving up and uploading the original.
 *
 * An `<img>` that neither loads nor errors leaves its promise pending forever,
 * and the uploader would sit on "preparing" with no way out. That is not
 * hypothetical — it is what the fallback path does in an environment with no
 * image loading, and a browser that fails to decode a corrupt file can behave
 * the same way.
 *
 * Generous, because decoding a 12 MP image on a mid-range phone is genuinely
 * slow: this is a stuck-detector, not a performance budget.
 */
const DECODE_TIMEOUT_MS = 15_000;

export interface NormalisedImage {
  file: File;
  /** Pixels actually stored, after any scaling. */
  width: number;
  height: number;
  /** True when the image was larger than `MAX_EDGE` and was scaled down. */
  wasResized: boolean;
  /** True when the result is below `MIN_READABLE_EDGE` — advisory only. */
  tooSmall: boolean;
}

/**
 * Target dimensions for a source of the given size — a pure seam.
 *
 * Separated so the arithmetic is testable without a canvas: jsdom has no real
 * image decoding, and a bug here (an inverted ratio, a rounded-to-zero edge)
 * would silently produce an unreadable document rather than throwing.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number; wasResized: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height, wasResized: false };

  const ratio = maxEdge / longest;
  return {
    // `max(1, …)` so an extreme aspect ratio cannot round the short edge to
    // zero, which would produce a canvas that throws rather than a thin image.
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    wasResized: true,
  };
}

/** Is this something we can decode, orient and re-encode? */
export function isNormalisableImage(file: File): boolean {
  // Explicitly NOT `image/*`: HEIC reports as an image and most browsers cannot
  // decode it, so trying would fail after the user has waited for a decode.
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase());
}

/**
 * Decode with the EXIF rotation already applied.
 *
 * `createImageBitmap(..., { imageOrientation: 'from-image' })` is the explicit
 * way to ask for it. Browsers that lack the option fall back to an `<img>`,
 * which modern engines also auto-orient — so the fallback is a degradation in
 * certainty, not in behaviour, and it is why the size check below is done on the
 * DECODED dimensions rather than on anything EXIF claims.
 */
async function decodeOriented(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through — some engines reject the options bag rather than ignoring it.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(
        () => reject(new Error(t('upload.imageTimedOut'))),
        DECODE_TIMEOUT_MS,
      );
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error(t('upload.imageUnreadable')));
      };
      img.src = url;
    });
  } finally {
    // Revoked once decoding has resolved, failed or timed out.
    URL.revokeObjectURL(url);
  }
}

function dimensionsOf(source: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return source instanceof HTMLImageElement
    ? { w: source.naturalWidth, h: source.naturalHeight }
    : { w: source.width, h: source.height };
}

function canvasToJpeg(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], name, { type: 'image/jpeg' }))
          : // A null blob means the browser could not encode. Rejecting beats
            // uploading an empty file, which reaches the reviewer as a corrupt
            // document and comes back as the client's fault.
            reject(new Error(t('upload.imageUnprocessable'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/** Swap the extension for `.jpg`, since that is what is now inside. */
function jpegName(original: string): string {
  return `${original.replace(/\.[^./\\]+$/, '') || 'document'}.jpg`;
}

/**
 * Orient, optionally downscale, and strip metadata.
 *
 * Returns the ORIGINAL file untouched for anything that is not a decodable
 * image, and for any failure along the way: a client who cannot complete
 * verification because our optimisation threw is worse off than one who uploads
 * a large file. The server's own limits remain the control.
 */
export async function normaliseDocumentImage(file: File): Promise<NormalisedImage> {
  const passthrough: NormalisedImage = {
    file,
    width: 0,
    height: 0,
    wasResized: false,
    tooSmall: false,
  };
  if (!isNormalisableImage(file)) return passthrough;

  try {
    const source = await decodeOriented(file);
    const { w, h } = dimensionsOf(source);
    if (!w || !h) return passthrough;

    const target = targetDimensions(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough;
    ctx.drawImage(source, 0, 0, target.width, target.height);
    if (!(source instanceof HTMLImageElement)) source.close();

    return {
      file: await canvasToJpeg(canvas, jpegName(file.name)),
      width: target.width,
      height: target.height,
      wasResized: target.wasResized,
      tooSmall: Math.max(target.width, target.height) < MIN_READABLE_EDGE,
    };
  } catch {
    return passthrough;
  }
}
