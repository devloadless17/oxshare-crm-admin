import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import {
  acceptAdminInvite,
  adminApiSession,
  API_NODE_BASE,
  clientIdByEmail,
  mintClientWithPendingKyc,
  registerClientWithPendingKyc,
  type MintedClient,
} from './helpers';

/** The seeded client, for events that need no fresh identity. */
const SEEDED_CLIENT = 'client@oxshare.com';

/**
 * THE CONSOLE UPDATES WITHOUT A REFRESH — and the console had no browser proof
 * of it at all. The portal has had `notifications-realtime.spec.ts` for a
 * while; every primitive below is borrowed from it deliberately.
 *
 * What is being proven, in the owner's words: "after an admin reviews a KYC
 * document and approves it, the sidebar count stays saying 1 as if he still
 * has something to work on — until refresh."
 *
 * Three different mechanisms have to hold for that sentence to be false, and
 * they fail independently, so each gets its own test:
 *
 *   1. MY OWN action refreshes MY OWN screen  — cache invalidation.
 *   2. A CLIENT's action reaches every reviewer — `notification.created`.
 *   3. ANOTHER OPERATOR's decision reaches me  — `resource.changed`.
 *
 * ⚠️ Every assertion here must fail if the update needed a page load. That is
 * what `plantMarker`/`markerSurvived` is for: a value on `window` that a
 * reload or a client-side navigation destroys. Without it a test that reloads
 * and then finds the right number passes while proving nothing.
 */

/**
 * Anything arriving faster than this cannot be the poll.
 *
 * The badges poll at 60s at their fastest. Five seconds leaves room for a
 * loaded CI box while staying an order of magnitude clear of it — so a pass
 * cannot have been carried by the fallback this feature is meant to beat.
 */
const REALTIME_BUDGET_MS = 5_000;

/** Plant a value that only survives if the document is never replaced. */
async function plantMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __oxshareNoReload?: string }).__oxshareNoReload = 'same-document';
  });
}

async function markerSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __oxshareNoReload?: string }).__oxshareNoReload === 'same-document',
  );
}

/**
 * The sidebar's KYC entry, whose badge is the number the owner reported.
 *
 * Matched on "KYC Review" specifically, NOT `/kyc/i` — the rail also carries
 * "KYC Workflow Builder", which sorts first and has no badge, so a loose
 * pattern with `.first()` reads 0 forever and fails on the wrong thing.
 */
const kycNav = (page: Page) => page.getByRole('link', { name: /kyc review/i });

/**
 * How many the KYC badge is claiming, or 0 when it is absent.
 *
 * Read from the nav link's whole text rather than a badge test id: the badge
 * is removed entirely at zero, so "no element" and "zero" are the same answer
 * and a locator that must exist would fail on the correct outcome.
 */
async function kycBadgeCount(page: Page): Promise<number> {
  const text = (await kycNav(page).textContent()) ?? '';
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

/** Wait for the badge to reach a value, inside the realtime budget. */
async function expectBadge(page: Page, predicate: (n: number) => boolean, what: string) {
  await expect
    .poll(async () => predicate(await kycBadgeCount(page)), {
      timeout: REALTIME_BUDGET_MS,
      message: what,
    })
    .toBe(true);
}

/**
 * Watch this page's realtime transport, and wait until it has JOINED.
 *
 * ⚠️ Not optional for any test that causes an event from outside the browser.
 * Socket.IO has NO REPLAY: an event emitted while the handshake is still in
 * flight is delivered to nobody and is gone, so the assertion that follows
 * fails on a feature that works. It cost a CI-only failure here and an
 * identical one in the portal's frame-capture spec on the same day — the
 * console's dev server compiles a route on first navigation, so the gap is
 * wide on CI and invisible on a warm local machine.
 *
 * `40/realtime` is the Engine.IO frame for "namespace joined" — the transport's
 * own signal, rather than a sleep that becomes a timing guess on slower
 * hardware.
 */
function watchSocketFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/socket.io/')) return;
    ws.on('framereceived', (frame) => frames.push(frame.payload.toString()));
  });
  // Socket.IO starts on long-polling and upgrades, so an early join arrives in
  // a polling RESPONSE rather than a WebSocket frame. Both are watched.
  page.on('response', (res) => {
    if (res.url().includes('/socket.io/') && res.url().includes('transport=polling')) {
      void res
        .text()
        .then((body) => frames.push(body))
        .catch(() => undefined);
    }
  });
  return frames;
}

/** `40/realtime` is the Engine.IO frame for "namespace joined". */
async function awaitSocketJoined(frames: string[]): Promise<void> {
  await expect
    .poll(() => frames.some((f) => f.includes('40/realtime')), {
      timeout: 30_000,
      message: 'the console never joined the realtime namespace',
    })
    .toBe(true);
}

test.describe('the KYC queue and its badge move together, without a refresh', () => {
  let admin: Awaited<ReturnType<typeof adminApiSession>>;
  let mine: MintedClient;

  test.beforeAll(async () => {
    /*
     * Past ONE login-cap window. `adminApiSession` waits out the five-a-minute
     * cap rather than weakening it, and that 65-second backoff cannot fit
     * inside the default 60-second hook timeout — a busy run would otherwise
     * fail the whole file in setup, at 0ms, pointing at nothing it asserts.
     */
    test.setTimeout(300_000);
    admin = await adminApiSession();
    mine = await mintClientWithPendingKyc(admin, 'rt');
  });

  test.afterAll(async () => {
    await mine?.dispose();
    await admin?.dispose();
  });

  test('MY OWN approval decrements MY OWN badge, in the same document', async ({ page }) => {
    /*
     * ⚠️ THE REPORTED BUG. The approve handler invalidated `['kyc']` while the
     * badge lived at `['admin','kyc','pending-count']`. React Query prefix-
     * matches, those share no prefix, so the invalidate matched nothing,
     * resolved successfully and refetched nothing. The count then corrected
     * only on its 60s poll — which is why it looked like "sometimes it works".
     */
    test.setTimeout(180_000);
    await page.goto(`/kyc/${mine.id}`);
    await expect(kycNav(page), 'the sidebar is not showing its KYC entry').toBeVisible();

    /*
     * WAITED FOR, not read once. The badge is a query of its own and resolves
     * a moment after the page paints, so reading it immediately after `goto`
     * captures 0 and fails the test on its setup rather than its subject.
     * Generous, because this is setup — the assertions below are what carry
     * the five-second realtime budget.
     */
    await expect
      .poll(() => kycBadgeCount(page), {
        timeout: 30_000,
        message: 'the pending submission is not being counted',
      })
      .toBeGreaterThan(0);
    const before = await kycBadgeCount(page);

    await plantMarker(page);

    // Claim first — the real reviewer flow. It must NOT change the count: the
    // badge counts `needs_review`, which is submitted AND under_review, so a
    // claim moves an item between two states the badge treats alike.
    await page.getByRole('button', { name: /claim/i }).first().click();
    await expect.poll(() => kycBadgeCount(page), { timeout: REALTIME_BUDGET_MS }).toBe(before);

    await page.getByRole('button', { name: /approve kyc submission/i }).click();

    /*
     * Confirm INSIDE the dialog. Approving is a decision, not a toggle, so it
     * opens a modal — and a page-wide `getByRole('button', {name: /approve/})`
     * resolves to the trigger BEHIND the overlay, which Playwright then
     * retries against for the whole timeout because the element is genuinely
     * visible and genuinely un-clickable.
     */
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /confirm approval/i }).click();

    await expectBadge(page, (n) => n === before - 1, 'the badge did not fall after an approval');
    expect(await markerSurvived(page), 'the page reloaded — this proves nothing').toBe(true);
  });

  test("a CLIENT's submission, then ANOTHER operator's decision, both land live", async ({
    page,
  }) => {
    /*
     * Two mechanisms, one minted client, on purpose.
     *
     * KYC uploads are capped at 10 a minute per IP and a submission needs
     * three of them, so a client per assertion would spend the platform's real
     * rate limit on test bookkeeping. The two events are naturally sequential
     * anyway — somebody submits, somebody else decides — so this is the
     * honest shape of the journey rather than a compromise.
     *
     *   1. `notification.created` — a client submits, and every reviewer's
     *      badge AND queue move.
     *   2. `resource.changed` — a SECOND operator approves it, and the row
     *      leaves the first operator's open queue. That half did not exist:
     *      the backend announced what CLIENTS did and nothing about what
     *      OPERATORS did, so two reviewers on one queue each worked from a
     *      list that had stopped being true.
     */
    test.setTimeout(300_000);
    /*
     * ⚠️ REGISTERED BEFORE THE NAVIGATION. The handshake happens as the page
     * mounts, so listeners attached after `goto` miss the very frames they are
     * waiting for — which is how the first attempt at this gate timed out on a
     * socket that had connected perfectly.
     */
    const frames = watchSocketFrames(page);
    await page.goto('/kyc');
    await expect(kycNav(page)).toBeVisible();
    // Both halves below are caused from OUTSIDE this browser, so the socket
    // has to be listening before either happens.
    await awaitSocketJoined(frames);
    /*
     * Settle before recording the baseline, but do NOT require it to be
     * non-zero: an empty queue is a legitimate state of this database, and a
     * test that needs work waiting before it can start is a test that fails
     * for a reason unrelated to what it asserts. The assertions below are all
     * RELATIVE to whatever this is.
     */
    await page.waitForTimeout(2_000);
    const before = await kycBadgeCount(page);
    await plantMarker(page);

    // A genuine domain event, entirely by wire: registration → verification →
    // three documents → submit. Nothing here touches the browser under test.
    /*
     * REGISTERED rather than leased, and this is the one place that is right.
     *
     * The assertion is that `admin.kyc.submitted` reaches a console that is
     * ALREADY OPEN, so the submission has to happen while this test is
     * watching. A pooled client's submission fired at seed time, before the
     * browser existed, and no frame would ever arrive — which is exactly how
     * this failed when the other ten call sites moved to the pool.
     */
    const inbound = await registerClientWithPendingKyc(admin, 'rt-in');
    try {
      /*
       * TRANSPORT FIRST, then the UI — so a failure says WHICH half broke.
       *
       * This asserted the badge alone and failed in CI while passing locally
       * in the same suite ordering, which left "did not raise the badge"
       * meaning any of: the row was never written, the fan-out excluded this
       * admin, the socket missed it, or the invalidation did nothing. Four
       * very different bugs behind one message.
       *
       * The frame is the seam. If this line fails the event never reached the
       * browser and the problem is server-side or in delivery; if it passes
       * and the badge assertion below fails, the event arrived and the console
       * did not act on it.
       */
      await expect
        .poll(() => frames.join('\n').includes('admin.kyc.submitted'), {
          timeout: REALTIME_BUDGET_MS * 2,
          message: 'no admin.kyc.submitted frame reached this console',
        })
        .toBe(true);

      await expectBadge(page, (n) => n > before, 'a new submission did not raise the badge');
      // And the QUEUE, not only the count. Before the registry those were
      // invalidated by different keys, so the badge moved and the table did not.
      const row = page.getByText(inbound.email, { exact: false });
      await expect(row).toBeVisible({ timeout: REALTIME_BUDGET_MS });
      expect(await markerSurvived(page), 'the page reloaded — this proves nothing').toBe(true);

      /*
       * A SECOND operator decides — a genuinely DIFFERENT admin, minted by
       * invitation, not another session of the same one.
       *
       * That distinction is load-bearing and this test found it the hard way:
       * the server excludes the ACTOR from the broadcast (their own screen
       * already refreshed from its own mutation), and the exclusion is by
       * admin id, not by session. A second `adminApiSession()` signs in as the
       * SAME e2e admin the browser holds, so the event was correctly
       * suppressed and the row correctly stayed — proving the exclusion works
       * while appearing to prove the feature does not.
       */
      const invited = await admin.post('/admin/invite', {
        email: `e2e-rt-peer-${Date.now()}@oxshare-e2e.test`,
        name: 'E2E Realtime Peer',
        permissions: ['kyc.view', 'kyc.review'],
      });
      expect(invited.ok(), `invite answered ${invited.status()}`).toBe(true);
      const inviteToken = new URL(
        ((await invited.json()) as { inviteUrl?: string }).inviteUrl ?? 'http://x/',
      ).searchParams.get('token')!;
      const other = await acceptAdminInvite(inviteToken, `Rtpeer-${Date.now()}-123!`);
      try {
        const approved = await other.ctx.patch(`${API_NODE_BASE}/admin/kyc/${inbound.id}/approve`, {
          headers: other.headers,
        });
        expect(approved.ok(), `the peer's approval answered ${approved.status()}`).toBe(true);
        await expect(row, "another operator's approval left the row on my queue").toBeHidden({
          timeout: REALTIME_BUDGET_MS,
        });
        await expectBadge(page, (n) => n === before, 'the badge did not fall back');
        expect(await markerSurvived(page), 'the page reloaded — this proves nothing').toBe(true);
      } finally {
        // Suspend rather than leave a live admin behind: the console's own
        // last-manager invariant and the admin list are asserted elsewhere.
        await admin.patch(`/admin/users/${other.id}/status`, { status: 'suspended' });
        await other.ctx.dispose();
      }
    } finally {
      await inbound.dispose();
    }
  });
});

test.describe('what must NOT move under the reader', () => {
  test('the audit log does not refetch when a queue changes', async ({ page }) => {
    /*
     * A forensic record, read deliberately and paginated. Refetching it under
     * somebody reading page three moves the rows they are reading — and this
     * is the screen used to reconstruct what happened, so a list that reorders
     * itself mid-read is worse than a stale one.
     *
     * Asserted on the WIRE, not the DOM: a refetch returning identical rows
     * would be invisible on screen and is still the bug.
     *
     * Triggered with a client SUSPENSION rather than a KYC submission —
     * `clients` is a broadcast resource too, and it costs no uploads against
     * the platform's real rate limit.
     */
    test.setTimeout(180_000);
    const admin = await adminApiSession();
    try {
      const target = await clientIdByEmail(admin, SEEDED_CLIENT);
      await page.goto('/audit-log');
      await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });

      let refetches = 0;
      page.on('request', (req) => {
        if (/\/v1\/admin\/audit/.test(new URL(req.url()).pathname)) refetches += 1;
      });

      expect(
        (await admin.patch(`/admin/users/${target}/status`, { status: 'suspended' })).ok() ||
          (await admin.patch(`/admin/clients/${target}/status`, { status: 'suspended' })).ok(),
      ).toBe(true);
      try {
        // Long enough for the event to have arrived and been acted on.
        await page.waitForTimeout(REALTIME_BUDGET_MS);
        expect(refetches, 'a queue change refetched the audit log under its reader').toBe(0);
      } finally {
        await admin.patch(`/admin/clients/${target}/status`, { status: 'active' });
      }
    } finally {
      await admin.dispose();
    }
  });
});
