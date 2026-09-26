import { expect, test } from './fixtures';
import {
  API_NODE_BASE,
  STORAGE_STATE,
  TOPOLOGY_PORTAL_ORIGIN,
  adminApi,
  mintFreshClientWithPendingKyc,
} from './helpers';

/**
 * A step the BROKER added, driven from both ends.
 *
 * The builder has always offered Add Step and the API has always accepted any
 * slug; until backend migration 0130 there was nowhere to put what a client
 * typed into one, so a custom step rendered, took input, and died at Continue
 * with `Unknown step`. Unit suites cover the pieces on each side. Nothing drove
 * the whole path, and it crosses three surfaces — the config API, the portal,
 * and the reviewer's card — which is where a piecewise-correct feature still
 * fails in practice.
 *
 * Four properties, because storing the answer is only the first of them:
 *
 *  1. it is REQUIRED when the broker says so — a `required` flag that nothing
 *     enforces is decoration, which is the exact bug `saveStep` already carried
 *     once for the personal step;
 *  2. an UNCONFIGURED slug is still refused — `POST /kyc/step` is client-facing,
 *     so accepting any slug is arbitrary client-controlled keys in an unbounded
 *     jsonb column;
 *  3. the answer SURVIVES a return, because the wizard reseeds from `/kyc/status`
 *     and an empty step means a client retypes answers they already gave;
 *  4. the REVIEWER can see it — an answer nobody reads is worse than one never
 *     collected, because the reviewer then decides having never seen it.
 */

test.use({ storageState: STORAGE_STATE });

const SLUG = 'e2e-compliance';
const TITLE = 'E2E Compliance Questions';
const FIELD = 'sourceOfFunds';
const LABEL = 'Source of Funds';
const ANSWER = 'Salary from employment';

/**
 * ADDED and DELETED, never a full-config replace.
 *
 * `PUT /admin/kyc-config` is a DELETE-then-INSERT of whatever it is handed, so
 * the snapshot-and-restore shape this file started with puts the live onboarding
 * flow at risk for every run: a spec that dies between the two leaves the
 * configuration as it found it only if the restore itself succeeds. Adding one
 * step and deleting it by id touches nothing else, and a failed cleanup leaves
 * an extra step rather than a missing one.
 */
let createdId: string | undefined;

test.beforeEach(async ({ context }) => {
  const api = await adminApi(context);
  const res = await api.post('/admin/kyc-config/steps', {
    slug: SLUG,
    title: TITLE,
    description: '',
    enabled: true,
    fields: [{ id: `f-${FIELD}`, name: FIELD, label: LABEL, type: 'text', required: true }],
  });
  expect(res.status(), 'the API refused to add a custom step').toBeLessThan(400);
  createdId = ((await res.json()) as { id: string }).id;
  expect(createdId, 'the created step came back with no id — it cannot be cleaned up').toBeTruthy();
});

test.afterEach(async ({ context }) => {
  if (!createdId) return; // the add failed; there is nothing to remove
  const api = await adminApi(context);
  const res = await api.del(`/admin/kyc-config/steps/${createdId}`);
  expect(
    res.status(),
    `FAILED TO REMOVE THE TEST STEP ${createdId} — it is still in the live KYC flow`,
  ).toBeLessThan(400);
  createdId = undefined;
});

test.describe('a custom KYC step, end to end', () => {
  test('is required, refuses a stranger, survives a return, and reaches the reviewer', async ({
    page,
    context,
  }) => {
    const admin = await adminApi(context);

    /*
     * A fixture client, not a registration. `POST /auth/register` is capped at
     * 10 an hour per IP and the suite budgets that cap deliberately; the
     * fixtures route costs none of it.
     */
    const client = await mintFreshClientWithPendingKyc(admin, 'customstep');

    try {
      const write = { Origin: TOPOLOGY_PORTAL_ORIGIN, 'X-OxShare-CSRF': client.csrf };

      /*
       * Rejected first, because the fixture arrives `submitted` and `saveStep`
       * refuses to edit a submission under review — correctly. This is also the
       * real sequence a broker creates by adding a compliance step: the clients
       * already in the queue are sent back to answer it.
       */
      const rejected = await admin.patch(`/admin/kyc/${client.id}/reject`, {
        reason: 'e2e: please answer the new compliance step',
      });
      expect(rejected.status(), 'could not send the fixture back for more information').toBe(200);

      // ── 1. REQUIRED is enforced by the server, not by the form ────────────
      // Attempted BEFORE the answer exists. The custom-step check runs ahead of
      // the document checks in `submit`, so this fails on the step itself.
      const premature = await client.portal.post(`${API_NODE_BASE}/kyc/submit`, { headers: write });
      expect(premature.status(), 'an unanswered required custom step was submittable').toBe(400);
      // Refused ON the step's own field — the server answers per field since
      // 26 Sep 2026, so the portal can put the sentence under the question.
      const refusal = (await premature.json()) as { fields?: Record<string, string> };
      expect(
        refusal.fields?.[FIELD],
        `submission was refused for some OTHER reason — this no longer tests the step: ${JSON.stringify(refusal)}`,
      ).toMatch(new RegExp(LABEL, 'i'));

      // ── 2. An UNCONFIGURED slug is refused ───────────────────────────────
      const stranger = await client.portal.post(`${API_NODE_BASE}/kyc/step`, {
        headers: write,
        data: { step: 'not-configured-at-all', data: { x: '1' } },
      });
      expect(stranger.status(), 'an unconfigured slug was accepted').toBe(400);

      // ── 3. A CONFIGURED slug saves ───────────────────────────────────────
      const saved = await client.portal.post(`${API_NODE_BASE}/kyc/step`, {
        headers: write,
        data: { step: SLUG, data: { [FIELD]: ANSWER } },
      });
      expect(saved.status(), 'the portal could not save a configured custom step').toBeLessThan(
        400,
      );

      // ── 4. It SURVIVES a return ──────────────────────────────────────────
      const status = await client.portal.get(`${API_NODE_BASE}/kyc/status`, { headers: write });
      const body = (await status.json()) as { stepData?: Record<string, Record<string, string>> };
      expect(
        body.stepData?.[SLUG]?.[FIELD],
        'the answer did not come back — a returning client would find the step empty',
      ).toBe(ANSWER);

      // ── 5. The REVIEWER sees it ──────────────────────────────────────────
      await page.goto(`/kyc/${client.id}`);
      await expect(
        page.getByText(ANSWER, { exact: false }).first(),
        'the reviewer cannot see the answer the client gave',
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(LABEL, { exact: false }).first()).toBeVisible();
    } finally {
      await client.dispose();
    }
  });
});
