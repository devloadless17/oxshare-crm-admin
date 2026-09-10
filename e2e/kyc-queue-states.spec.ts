import { expect, test } from './fixtures';
import { routeHit, STORAGE_STATE } from './helpers';

/**
 * THE KYC QUEUE'S FOUR NON-HAPPY STATES, IN A REAL BROWSER.
 *
 * ## Why this file exists
 *
 * `AsyncBoundary` gives every screen six states and this queue renders four of
 * them. Only one — `ready`, with rows — had ever been opened by a browser.
 * The other three were asserted in jsdom against a mocked `api.get`, which
 * proves the branch exists in the component and proves nothing about whether a
 * real 500 from a real API reaches it: the axios interceptor, the refresh
 * retry and `useResource`'s own status mapping all sit between the two, and
 * none of them is present in a jsdom test.
 *
 * ## The assertion this file is actually for
 *
 * **An outage must never render as an empty queue.** That is defect class 7,
 * and this is the screen where it costs the most: a reviewer who sees "no
 * submissions match the current filters" closes the tab, and the submissions
 * that were waiting stay waiting. The copy on the error card says so in
 * capitals — *"This is NOT an empty queue"* — precisely because the two states
 * are one silent failure apart.
 *
 * So every failure case here carries a NEGATIVE assertion: the empty-state
 * sentence must be absent. An error card that renders correctly BESIDE an
 * empty-state message is still the bug.
 *
 * ## And the positive control, which is the half that is easy to skip
 *
 * `renders the empty state when the queue is GENUINELY empty` is not a
 * courtesy case. Without it, every assertion below is satisfied by a screen
 * that has forgotten how to render an empty queue at all — "the empty sentence
 * is absent" is trivially true of a page that can never show it. The two cases
 * only mean something as a pair: same screen, same request, two bodies, two
 * different answers.
 *
 * Every injection goes through `routeHit`, so a handler that never fired fails
 * the test rather than quietly leaving the page talking to the real API.
 */

test.use({ storageState: STORAGE_STATE });

/** The shape `GET /admin/kyc` answers with — an empty page of a real queue. */
const EMPTY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  limit: 25,
  counts: { needs_review: 0, approved: 0, rejected: 0 },
};

const EMPTY_SENTENCE = /no submissions match/i;

test.describe('the KYC queue when the API does not answer with rows', () => {
  test('reports an OUTAGE as an outage, never as an empty queue', async ({ page }) => {
    const route = await routeHit(page, '/admin/kyc', (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 500,
          code: 'INTERNAL',
          message: 'Internal server error',
        }),
      }),
    );

    await page.goto('/kyc');

    // An ALERT with a retry: something failed, and it is worth trying again.
    await expect(page.getByRole('alert').filter({ hasText: /retry/i })).toBeVisible({
      timeout: 30_000,
    });

    /*
     * THE ASSERTION THIS FILE EXISTS FOR, and it goes FIRST on purpose.
     *
     * An earlier draft checked the screen's own error copy before this, and the
     * copy assertion failed — which meant the run never reached the line that
     * actually matters and reported nothing about it either way. A weak
     * assertion placed ahead of a load-bearing one does not merely fail; it
     * HIDES the load-bearing one. Same family as a precondition skip.
     */
    expect(
      await page.getByText(EMPTY_SENTENCE).count(),
      'an outage is being reported to a reviewer as an empty compliance queue',
    ).toBe(0);
    await expect(page.getByRole('table')).toBeHidden();

    expect(route.hits(), 'the failure was never injected — this asserted nothing').toBeGreaterThan(
      0,
    );
  });

  test("shows the reviewer BOTH the warning and the API's reason", async ({ page }) => {
    /*
     * `kyc.queueLoadFailed` reads *"Failed to load the review queue. This is NOT
     * an empty queue — submissions may be waiting."* It was written to stop a
     * reviewer treating an outage as a cleared backlog.
     *
     * IT WAS UNREACHABLE FOR EVERY SERVER-SIDE ERROR until 10 Sep 2026, which
     * is to say: for the entire case it was written for. `AsyncBoundary`
     * rendered `apiErrorMessage(error, errorMessage)`, and that helper prefers
     * `response.data.message` — which `AllExceptionsFilter` puts on every
     * envelope. The reviewer saw "Internal server error" and nothing else.
     *
     * This spec used to PIN that, on the reasoning that the precedence was a
     * copy decision for the owner. He asked for it closed rather than recorded,
     * and he was right to: the two messages answer different questions and the
     * screen has room for both. The caller's line leads and the API's follows
     * as detail.
     *
     * Both halves are asserted because fixing either one by dropping the other
     * is the trap — and both apps had done exactly that, in opposite directions.
     */
    const route = await routeHit(page, '/admin/kyc', (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 500,
          code: 'INTERNAL',
          message: 'Internal server error',
        }),
      }),
    );

    await page.goto('/kyc');

    await expect(page.getByText(/this is NOT an empty queue/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Internal server error')).toBeVisible();

    expect(route.hits(), 'nothing was intercepted').toBeGreaterThan(0);
  });

  test('the Retry button actually refetches, and the queue recovers', async ({ page }) => {
    /*
     * A retry that is wired to nothing looks identical to one that works, until
     * somebody clicks it during a real incident.
     *
     * ⚠️ THE INJECTION HAS TO OUTLAST REACT QUERY'S OWN RETRY. The first
     * version of this failed only the FIRST request and let the rest through,
     * and the screen never entered `error` at all — the automatic retry
     * recovered before any card rendered, and the test waited thirty seconds
     * for a Retry button that was never going to exist. The app was behaving
     * CORRECTLY; the instrument was too shallow to reach the state it was
     * testing. So: fail every request until the error card is actually on
     * screen, and only then open the door.
     */
    let failing = true;
    const route = await routeHit(page, '/admin/kyc', async (r) => {
      if (failing) {
        await r.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 503, code: 'UNAVAILABLE', message: 'down' }),
        });
        return;
      }
      await r.continue();
    });

    await page.goto('/kyc');
    const retry = page.getByRole('button', { name: /^retry$/i });
    await expect(retry).toBeVisible({ timeout: 30_000 });

    const hitsBeforeClick = route.hits();
    failing = false;
    await retry.click();

    // The real table is in its place. Asserting the table rather than a row
    // count: the queue's true contents are the database's business, and a spec
    // needing a particular number of rows breaks the first time somebody
    // approves one by hand.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeHidden();

    expect(
      route.hits(),
      'the click issued no request — the retry is not wired to a refetch',
    ).toBeGreaterThan(hitsBeforeClick);
  });

  test('renders the empty state when the queue is GENUINELY empty', async ({ page }) => {
    /*
     * The positive control for the two cases above. It is what makes their
     * negative assertion mean "the screen chose the right one of two states"
     * rather than "the screen cannot render this state at all".
     */
    const route = await routeHit(page, '/admin/kyc', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      }),
    );

    await page.goto('/kyc');

    await expect(page.getByText(EMPTY_SENTENCE)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/failed to load the review queue/i)).toBeHidden();

    expect(route.hits(), 'the empty page was never served').toBeGreaterThan(0);
  });

  test('a 403 is a CLOSED DOOR, not a broken queue and not an empty one', async ({ page }) => {
    /*
     * This is the review page's bug, on the queue beside it: until Sep 2026
     * `kyc/[userId]` rendered "submission not found" for a 403, telling a
     * reviewer denied by RBAC-03 that the record did not exist. A permission
     * failure has to say "permission", because the two have different fixes —
     * one is a role to change, the other is a support ticket.
     *
     * And it must offer NO retry. Retrying a 403 cannot succeed; the admin
     * clicks it, watches it fail, and reports a bug against a system working
     * exactly as configured.
     */
    const route = await routeHit(page, '/admin/kyc', (r) =>
      r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 403, code: 'FORBIDDEN', message: 'nope' }),
      }),
    );

    await page.goto('/kyc');

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeHidden();

    expect(
      await page.getByText(EMPTY_SENTENCE).count(),
      'a denied reviewer is being shown an empty compliance queue',
    ).toBe(0);
    expect(
      await page.getByText(/failed to load the review queue/i).count(),
      'a permission failure is being reported as an outage',
    ).toBe(0);

    expect(route.hits(), 'the 403 was never injected').toBeGreaterThan(0);
  });
});
