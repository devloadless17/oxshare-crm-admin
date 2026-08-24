import { expect, test } from './fixtures';
import { STORAGE_STATE } from './helpers';

/**
 * A reviewer opening a client's identity documents, now served from Cloudflare R2.
 *
 * ## Why this spec is the important half
 *
 * The portal's spec proves a document goes IN. This proves it comes back OUT, on the
 * screen where it matters — and that path is the one the storage move could have
 * broken invisibly.
 *
 * The specific risk: this app's CSP is `img-src 'self' data:` (`src/lib/csp.ts`).
 * Documents are streamed through the API proxy, so they stay same-origin and render.
 * Had the implementation followed PLATFORM-CONVENTIONS R-7.3 literally and
 * redirected to a short-lived presigned URL on `*.r2.cloudflarestorage.com`, the
 * browser would refuse every one of them — and the failure is SILENT. The page
 * renders, the layout is right, the passport is simply not there. No HTTP test can
 * see that; only a browser can.
 *
 * So the assertions are: the bytes arrive same-origin, the image actually DECODES,
 * and the browser reports no CSP violation while doing it.
 */

test.use({ storageState: STORAGE_STATE });

test.describe('KYC documents are served from object storage', () => {
  test('a reviewer can open a document, and the browser is not blocked', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && /content security policy|refused to load/i.test(text)) {
        violations.push(text);
      }
    });

    /** Every request for a stored document, with the status it came back with. */
    const documentResponses: { url: string; status: number }[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/uploads/kyc/')) {
        documentResponses.push({ url: r.url(), status: r.status() });
      }
    });

    /*
     * Open a submission that actually HAS documents.
     *
     * `E2E_KYC_USER_ID` points straight at one when the caller knows which — the
     * portal's upload spec creates it. Without it, the queue is walked until a
     * submission with an image turns up.
     *
     * Skipped rather than failed when nothing is found: this runs against a shared
     * dev database, and "nobody has uploaded a document" is a fact about the data,
     * not a defect in the code. A test that goes red for that gets ignored, which is
     * worse than one that says why it did not run.
     */
    const targetUser = process.env.E2E_KYC_USER_ID;
    let documentImage = page.locator('img[src*="/uploads/kyc/"]').first();

    if (targetUser) {
      await page.goto(`/kyc/${targetUser}`);
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/kyc');
      await page.waitForLoadState('networkidle');

      const rows = page.getByRole('row');
      const count = Math.min(await rows.count(), 6);
      let found = false;
      for (let i = 1; i < count; i += 1) {
        // The queue is LIVE — another reviewer (or an earlier spec) approving
        // a submission removes its row, so the count measured before the walk
        // can exceed what is rendered now. Re-check instead of timing out.
        if ((await rows.count()) <= i) break;
        await rows.nth(i).click();
        await page.waitForLoadState('networkidle');
        if ((await documentImage.count()) > 0) {
          found = true;
          break;
        }
        await page.goBack();
        await page.waitForLoadState('networkidle');
      }
      if (!found) {
        test.skip(true, 'No submission in the first few rows carries an image document.');
        return;
      }
    }

    documentImage = page.locator('img[src*="/uploads/kyc/"]').first();
    if ((await documentImage.count()) === 0) {
      test.skip(true, 'This submission carries no image documents.');
      return;
    }

    // ── The bytes arrived, same-origin ────────────────────────────────────────
    await expect.poll(() => documentResponses.length, { timeout: 20_000 }).toBeGreaterThan(0);

    for (const { url, status } of documentResponses) {
      expect(new URL(url).origin, `document fetched cross-origin: ${url}`).toBe(
        new URL(page.url()).origin,
      );
      // The assertion that pins the proxy-not-presigned decision.
      expect(url).not.toContain('r2.cloudflarestorage.com');
      expect(status, `document request failed: ${url}`).toBeLessThan(400);
    }

    /*
     * It DECODED — not merely "the element is in the DOM".
     *
     * `naturalWidth` is 0 for an <img> whose bytes never arrived, were refused by
     * the CSP, or came back as something the browser will not treat as an image.
     * This single number is what distinguishes "the passport is on screen" from
     * "there is a broken image icon where the passport should be".
     */
    await expect(documentImage).toBeVisible();
    await expect
      .poll(() => documentImage.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    expect(violations, `CSP blocked something:\n${violations.join('\n')}`).toEqual([]);
  });
});
