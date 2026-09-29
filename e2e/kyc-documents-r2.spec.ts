import { expect, test } from './fixtures';
import { API_ORIGIN, STORAGE_STATE, adminApi, registerClientWithPendingKyc } from './helpers';

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
  /*
   * ONE REGISTRATION FOR THE WHOLE FILE, deliberately.
   *
   * `registerClientWithPendingKyc` is the expensive path — it spends one of ten
   * registrations an hour — and its docblock asks that the caller count be
   * checked before a new one is added: "Two of ten is within budget; a third
   * should not be added without re-counting." The lightbox cases below need a
   * submission whose documents have real BYTES (a pooled fixture carries seeded
   * document names with nothing behind them), so they need this fixture and not
   * a cheaper one.
   *
   * Hoisting it keeps the file at ONE caller rather than adding a third, which
   * is the honest way to obey that instruction rather than route around it.
   */
  let shared: Awaited<ReturnType<typeof registerClientWithPendingKyc>> | undefined;
  let targetUserId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ storageState: STORAGE_STATE });
    try {
      const api = await adminApi(ctx);
      const explicit = process.env['E2E_KYC_USER_ID'];
      shared = explicit ? undefined : await registerClientWithPendingKyc(api, 'r2docs');
      targetUserId = explicit ?? String(shared!.id);
    } finally {
      await ctx.close();
    }
  });

  test.afterAll(async () => {
    // The minted client owns an API context of its own; leaving it open leaks a
    // connection per run.
    await shared?.dispose();
  });

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
     * MINT a submission that has documents, rather than hunting for one.
     *
     * This used to walk the first six rows of the queue and `test.skip` when
     * none carried an image — defended at the time as "a fact about the data,
     * not a defect in the code". Two things make that wrong now.
     *
     * The pooled fixtures sit at the top of the queue and their documents are
     * seeded NAMES with no bytes behind them (`pool-doc.png`), so the walk
     * looks at six submissions that structurally cannot satisfy it and gives
     * up. And in CI the database is fresh — nobody has ever uploaded anything —
     * so the case could never run at all, while reporting as PASSING. That is
     * the one thing this spec exists to prevent: a document path that fails
     * SILENTLY.
     *
     * `registerClientWithPendingKyc` uploads three real files through the
     * portal and submits, so the reviewer opens a submission whose bytes
     * genuinely exist. It is the expensive path — one registration against a
     * 10/hour cap — and this is deliberately its SECOND caller, which the
     * helper's docblock asks be checked before adding. Two of ten is within
     * budget; a third should not be added without re-counting.
     *
     * `E2E_KYC_USER_ID` still wins when the caller already knows which
     * submission to open.
     */
    const targetUser = targetUserId;

    await page.goto(`/kyc/${targetUser}`);
    await page.waitForLoadState('networkidle');

    const documentImage = page.locator('img[src*="/uploads/kyc/"]').first();
    await expect(
      documentImage,
      'the review screen rendered no stored document for a submission that has three',
    ).toBeVisible({ timeout: 20_000 });

    // ── The bytes arrived, through the API ────────────────────────────────────
    await expect.poll(() => documentResponses.length, { timeout: 20_000 }).toBeGreaterThan(0);

    for (const { url, status } of documentResponses) {
      /*
       * The assertion that pins the PROXY-not-presigned decision (D-61): every
       * document read goes through the API's own /v1/uploads route — where the
       * client-scope check runs and the R-6.6 audit row is written — and never
       * to a presigned bucket URL that would route an audited PII read around
       * its own audit. (The browser calls the API's origin directly; the page's
       * origin stopped being the document host with the /api rewrite.)
       */
      expect(new URL(url).origin, `document fetched off the API: ${url}`).toBe(API_ORIGIN);
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

  /*
   * PAGING BETWEEN DOCUMENTS, which nothing drove.
   *
   * A submission carries three — the document, the selfie and the address proof —
   * and a reviewer compares them. Opening ONE was covered; moving between them
   * was not, and the lightbox is where a compliance decision is actually made.
   */
  test('a reviewer can page between the documents, and each opens at a clean view', async ({
    page,
  }) => {
    await page.goto(`/kyc/${targetUserId}`);

    const thumbnail = page.locator('img[src*="/uploads/kyc/"]').first();
    await expect(thumbnail).toBeVisible();
    await thumbnail.click();

    const lightbox = page.getByRole('dialog');
    await expect(lightbox, 'clicking a document opened no viewer').toBeVisible();

    const next = page.getByRole('button', { name: /next document/i });
    const zoomIn = page.getByRole('button', { name: /zoom in/i });

    /*
     * A submission with one document offers no paging, and asserting on a fixed
     * count would make this a test about the seeded form rather than the viewer.
     * The fixture uploads three, so this should be present — and if it is not,
     * saying so is more useful than skipping.
     */
    await expect(
      next,
      'the viewer offered no way to reach the other documents in this submission',
    ).toBeVisible();

    const shown = () => lightbox.locator('img').first().getAttribute('src');
    const first = await shown();

    /*
     * ZOOM, THEN PAGE. The lightbox resets zoom and rotation per document, and
     * its own comment says why: "A new document is a new view: carrying the
     * previous zoom and rotation over" is wrong. A reviewer who zoomed into a
     * passport's date of birth and then paged to the selfie would be looking at
     * a corner of it — and would have no reason to think they were.
     */
    await zoomIn.click();
    await next.click();

    await expect
      .poll(shown, { timeout: 10_000, message: 'paging showed the same document again' })
      .not.toBe(first);

    /*
     * Asserted on the ZOOM READOUT the lightbox shows, not on the computed
     * transform.
     *
     * The transform was the first thing I reached for and it is the wrong
     * instrument: the viewer animates its entrance, so a document that has just
     * opened reports a scale mid-flight — `matrix(1.10515, …)` on the run that
     * caught this. `ZOOM_STEP` is 0.5, so 1.105 is not a zoom level at all and
     * the assertion was reading an animation and calling it a defect.
     *
     * The readout is `Math.round(zoom * 100)%` — the number the reviewer
     * actually sees, settled rather than in transit, and the thing that would be
     * wrong if the reset broke.
     */
    await expect(
      lightbox.getByText(/^\s*100%\s*$/),
      'the next document opened still zoomed — a reviewer would see a corner of it',
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^close$/i }).click();
    await expect(lightbox, 'the viewer would not close').toBeHidden();
  });
});
