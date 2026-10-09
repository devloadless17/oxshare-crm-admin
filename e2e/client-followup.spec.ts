import { readFileSync } from 'node:fs';
import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  acceptAdminInvite,
  adminApi,
  API_NODE_BASE,
  APP_ORIGIN,
  createClientByStaff,
  csrfOf,
  E2E_TAGS,
  RESTRICTED_STATE,
} from './helpers';
import { psql } from './authenticator';

/**
 * A client's Follow-up and Result (backend 0212) — the staff's two notes,
 * driven through the real console against the real API and database.
 *
 * The property every journey here protects: nothing a person typed is lost
 * without a word. A colleague's save is shown, never silently taken over an
 * unsaved draft and never silently overwritten by one.
 *
 * Every client is minted for this run (`createClientByStaff`), so nothing here
 * writes to the seeded cohort other specs read.
 */

/** Letters only: a client's name may not carry digits. */
const RUN = Date.now()
  .toString(36)
  .replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)] ?? 'z');
const CARD_TITLE = 'Follow-up & result';
const DAY = 24 * 60 * 60 * 1000;

type Api = Awaited<ReturnType<typeof adminApi>>;

interface FollowUp {
  followUp: string | null;
  result: string | null;
  followUpAt: string | null;
  version: number;
  updatedBy: { id: string; name: string } | null;
}

/** A client this run owns, with a last name that finds it in the list. */
async function newClient(context: BrowserContext, label: string, firstName = 'Samir') {
  const lastName = `Fu${RUN}${label}`;
  const client = await createClientByStaff(context, `fu${RUN}${label}`.toLowerCase(), {
    firstName,
    lastName,
  });
  return { id: client.id, name: `${firstName} ${lastName}` };
}

async function readNotes(api: Api, id: number): Promise<FollowUp> {
  const res = await api.get(`/admin/clients/${id}/followup`);
  expect(res.status(), `reading the notes of #${id}`).toBe(200);
  return (await res.json()) as FollowUp;
}

async function writeNotes(
  api: Api,
  id: number,
  body: Partial<Omit<FollowUp, 'updatedBy'>>,
): Promise<FollowUp> {
  const current = await readNotes(api, id);
  const res = await api.put(`/admin/clients/${id}/followup`, {
    followUp: current.followUp,
    result: current.result,
    followUpAt: current.followUpAt,
    version: current.version,
    ...body,
  });
  expect(res.status(), `saving the notes of #${id}: ${await res.text()}`).toBe(200);
  return (await res.json()) as FollowUp;
}

/** The client page, opened on the Overview, with the notes card loaded. */
async function openCard(page: Page, id: number): Promise<Locator> {
  await page.goto(`/clients/${id}`);
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: CARD_TITLE }) });
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

const followUpBox = (card: Locator) => card.getByLabel('Follow-up', { exact: true });
const resultBox = (card: Locator) => card.getByLabel('Result', { exact: true });
const saveButton = (card: Locator) => card.getByRole('button', { name: 'Save notes' });

/** Save through the console and wait for the API's answer. */
async function saveFromCard(page: Page, card: Locator, id: number, keys = false) {
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/admin/clients/${id}/followup`) && r.request().method() === 'PUT',
    ),
    keys ? resultBox(card).press('Control+Enter') : saveButton(card).click(),
  ]);
  return res;
}

/** A local wall time today, as the instant the console sends. */
function todayAt(hours: number, minutes: number): Date {
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  return at;
}

/** The calendar's button for a day — `data-day` is the en-US date the browser renders. */
const dayButton = (page: Page, day: Date) =>
  page.locator(`[data-day="${day.toLocaleDateString('en-US')}"]`);

/** Invite a second editor, so a colleague's save reaches this console by realtime. */
async function inviteColleague(api: Api) {
  const name = `E2E Follow-up Colleague ${RUN}`;
  const invited = await api.post('/admin/invite', {
    email: `e2e-fu-colleague-${RUN}-${Date.now()}@oxshare-e2e.test`,
    name,
    permissions: ['clients.view', 'clients.followup.edit'],
  });
  expect(invited.ok(), `the invite answered ${invited.status()}`).toBe(true);
  const { inviteUrl } = (await invited.json()) as { inviteUrl?: string };
  const token = new URL(inviteUrl ?? 'http://x/').searchParams.get('token') ?? '';
  const session = await acceptAdminInvite(token, `Fucolleague-${Date.now()}-123!`);
  const put = (id: number, data: unknown) =>
    session.ctx.put(`${API_NODE_BASE}/admin/clients/${id}/followup`, {
      headers: session.headers,
      data,
    });
  const get = async (id: number) =>
    (await (
      await session.ctx.get(`${API_NODE_BASE}/admin/clients/${id}/followup`, {
        headers: session.headers,
      })
    ).json()) as FollowUp;
  return { ...session, name, put, get };
}

async function retire(api: Api, colleague: { id: string; ctx: APIRequestContext }) {
  // Suspended, never deleted: the audit trail keeps the administrator it names.
  await api.patch(`/admin/users/${colleague.id}/status`, { status: 'suspended' });
  await colleague.ctx.dispose();
}

test.describe('the notes card, for an editor', () => {
  test('starts empty, saves trimmed notes with a date and time, and they survive a reload', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'basic');
    const card = await openCard(page, client.id);

    await expect(followUpBox(card)).toHaveValue('');
    await expect(resultBox(card)).toHaveValue('');
    await expect(saveButton(card), 'nothing changed, nothing to save').toBeDisabled();
    await expect(card.getByText('No notes yet.')).toHaveCount(0);

    await followUpBox(card).fill('   Call back after payday   ');
    await resultBox(card).fill('     ');
    await card.getByRole('button', { name: 'Follow up on' }).click();
    const today = new Date();
    await dayButton(page, today).click();
    await card.getByLabel('Time (optional)').fill('16:30');

    const res = await saveFromCard(page, card, client.id);
    expect(res.status()).toBe(200);
    await expect(page.getByText('Notes saved')).toBeVisible();
    await expect(saveButton(card)).toBeDisabled();
    await expect(card.getByText(/Last edited by .+/)).toBeVisible();

    // The server holds the trimmed note, no blank result, and the chosen moment.
    const api = await adminApi(context);
    const stored = await readNotes(api, client.id);
    expect(stored.followUp).toBe('Call back after payday');
    expect(stored.result).toBeNull();
    expect(new Date(stored.followUpAt ?? '').getTime()).toBe(todayAt(16, 30).getTime());
    expect(stored.version).toBe(1);

    await page.reload();
    const again = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: CARD_TITLE }) });
    await expect(followUpBox(again)).toHaveValue('Call back after payday');
    await expect(again.getByLabel('Time (optional)')).toHaveValue('16:30');

    // Every change is in the audit log, before and after.
    const audit = await api.get(
      `/admin/audit-log?action=client.followup_update&subjectType=user&subjectId=${client.id}`,
    );
    expect(audit.ok()).toBe(true);
    const rows = ((await audit.json()) as { items: { details?: unknown }[] }).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.details).toMatchObject({
      before: { followUp: null, result: null, followUpAt: null },
      after: { followUp: 'Call back after payday', result: null },
    });
  });

  test('Ctrl+Enter saves, Discard puts the saved notes back, and the date can be cleared', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'keys');
    const api = await adminApi(context);
    await writeNotes(api, client.id, {
      result: 'Interested',
      followUpAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    const card = await openCard(page, client.id);
    await expect(resultBox(card)).toHaveValue('Interested');

    // Discard: back to what is stored, with nothing left to save.
    await resultBox(card).fill('Something I will not keep');
    await card.getByRole('button', { name: 'Discard changes' }).click();
    await expect(resultBox(card)).toHaveValue('Interested');
    await expect(saveButton(card)).toBeDisabled();

    // The keyboard: Ctrl+Enter from inside a box saves.
    await resultBox(card).fill('Deposited 500 USD');
    expect((await saveFromCard(page, card, client.id, true)).status()).toBe(200);
    expect((await readNotes(api, client.id)).result).toBe('Deposited 500 USD');

    // Clear the date: saved as no date at all.
    await card.getByRole('button', { name: 'Clear' }).click();
    await expect(card.getByLabel('Time (optional)')).toBeDisabled();
    expect((await saveFromCard(page, card, client.id)).status()).toBe(200);
    expect((await readNotes(api, client.id)).followUpAt).toBeNull();
  });

  test('a double click on Save never turns into a conflict with itself', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'dbl');
    const card = await openCard(page, client.id);
    const puts: number[] = [];
    page.on('response', (r) => {
      if (
        r.url().includes(`/admin/clients/${client.id}/followup`) &&
        r.request().method() === 'PUT'
      )
        puts.push(r.status());
    });
    await resultBox(card).fill('Clicked twice');
    await saveButton(card).dblclick();
    await expect(saveButton(card)).toBeDisabled();
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    expect(
      puts.every((status) => status === 200),
      `answers: ${puts.join(',')}`,
    ).toBe(true);
    await expect(card.getByRole('alert').filter({ hasText: 'changed these notes' })).toHaveCount(0);
    const stored = await readNotes(await adminApi(context), client.id);
    expect(stored.result).toBe('Clicked twice');
    expect(stored.version).toBe(1);
  });

  test('closing the tab with unsaved notes makes the browser ask first', async ({ context }) => {
    const client = await newClient(context, 'close');
    const page = await context.newPage();
    const card = await openCard(page, client.id);
    await followUpBox(card).fill('Not saved yet');
    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });

  test('a box stops at 2000 characters, and the counter says so', async ({ page, context }) => {
    const client = await newClient(context, 'long');
    const card = await openCard(page, client.id);

    await followUpBox(card).fill('x'.repeat(2100));
    const typed = await followUpBox(card).inputValue();
    expect(typed.length, 'the box let more than 2000 characters in').toBeLessThanOrEqual(2000);
    await expect(card.getByText(`${typed.length} / 2000`)).toBeVisible();

    expect((await saveFromCard(page, card, client.id)).status()).toBe(200);
    const stored = await readNotes(await adminApi(context), client.id);
    expect(stored.followUp).toHaveLength(typed.length);
  });

  test('line breaks, Arabic, emoji and markup are kept exactly and shown as text', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'text');
    const note = [
      'Line one',
      'سطر عربي — اتصل يوم الاثنين 🙂',
      '<img src=x onerror="window.__fuXss=1"><script>window.__fuXss=2</script>',
    ].join('\n');
    const card = await openCard(page, client.id);
    await followUpBox(card).fill(note);
    expect((await saveFromCard(page, card, client.id)).status()).toBe(200);

    await page.reload();
    const again = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: CARD_TITLE }) });
    await expect(followUpBox(again)).toHaveValue(note);
    expect(await page.evaluate(() => (window as { __fuXss?: number }).__fuXss)).toBeUndefined();

    // The list shows the first line as text, never as markup.
    await page.goto(`/clients?q=${encodeURIComponent(`fu${RUN}text`)}`);
    const row = page.getByRole('row').filter({ hasText: client.name });
    await expect(row.getByText('Line one', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as { __fuXss?: number }).__fuXss)).toBeUndefined();
  });

  test('an unsaved draft survives switching tabs, and leaving by a link asks first', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'draft');
    const api = await adminApi(context);
    await writeNotes(api, client.id, { result: 'Saved before' });
    const card = await openCard(page, client.id);

    await resultBox(card).fill('Typed, not saved');
    await page.getByRole('tab', { name: 'Documents' }).click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    const back = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: CARD_TITLE }) });
    await expect(resultBox(back), 'the draft was lost on a tab switch').toHaveValue(
      'Typed, not saved',
    );
    await expect(back.getByText('Your unsaved changes from earlier are still here.')).toBeVisible();

    // A link out asks first; Stay keeps everything.
    const allClients = page
      .getByRole('navigation')
      .first()
      .getByRole('link', { name: 'All clients' });
    await allClients.click();
    const ask = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(ask.getByText('Leave without saving the notes?')).toBeVisible();
    await ask.getByRole('button', { name: 'Stay on this page' }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`));
    await expect(resultBox(back)).toHaveValue('Typed, not saved');

    // Leave goes, and forgets the draft — the person was told it would be lost.
    await allClients.click();
    await ask.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/clients(\?|$)/);
    const reopened = await openCard(page, client.id);
    await expect(resultBox(reopened)).toHaveValue('Saved before');
    expect((await readNotes(api, client.id)).result).toBe('Saved before');
  });

  test('the date picker offers no day before today, and an overdue date never blocks a save', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'overdue');
    // A follow-up that has become overdue — written as the past would have left it.
    psql(
      `INSERT INTO client_followups (user_id, follow_up, follow_up_at, version) ` +
        `VALUES (${client.id}, 'Call about the bonus', now() - interval '3 days', 1)`,
    );
    const card = await openCard(page, client.id);
    await expect(followUpBox(card)).toHaveValue('Call about the bonus');

    await card.getByRole('button', { name: 'Follow up on' }).click();
    const today = new Date();
    await expect(dayButton(page, today)).toBeEnabled();
    const yesterday = new Date(today.getTime() - DAY);
    if (yesterday.getMonth() === today.getMonth()) {
      await expect(dayButton(page, yesterday)).toBeDisabled();
    }
    await page.keyboard.press('Escape');

    // Editing the note beside an overdue date saves, and keeps the date.
    await resultBox(card).fill('No answer, try again');
    expect((await saveFromCard(page, card, client.id)).status()).toBe(200);
    const stored = await readNotes(await adminApi(context), client.id);
    expect(stored.result).toBe('No answer, try again');
    expect(new Date(stored.followUpAt ?? '').getTime()).toBeLessThan(Date.now() - 2 * DAY);
  });
});

test.describe('two people on the same notes', () => {
  test("a colleague's save shows live; with a draft open it is shown beside it, and both choices work", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const api = await adminApi(context);
    const colleague = await inviteColleague(api);
    try {
      const client = await newClient(context, 'live');
      await writeNotes(api, client.id, { followUp: 'First words' });
      const card = await openCard(page, client.id);
      await expect(followUpBox(card)).toHaveValue('First words');

      // 1. Nothing unsaved here: their save simply appears, without a reload.
      const v1 = await colleague.get(client.id);
      expect(
        (
          await colleague.put(client.id, { ...pick(v1), followUp: 'Colleague rewrote it' })
        ).status(),
      ).toBe(200);
      await expect(followUpBox(card)).toHaveValue('Colleague rewrote it', { timeout: 15_000 });
      await expect(
        card.getByText(`Last edited by ${colleague.name}`, { exact: false }),
      ).toBeVisible();

      // 2. A draft open here: their save is SHOWN beside it, the draft untouched.
      await resultBox(card).fill('My unsaved result');
      const v2 = await colleague.get(client.id);
      expect((await colleague.put(client.id, { ...pick(v2), result: 'No answer' })).status()).toBe(
        200,
      );
      const conflict = card.getByRole('alert').filter({ hasText: 'changed these notes' });
      await expect(conflict).toContainText(
        `${colleague.name} changed these notes while you were editing.`,
        { timeout: 15_000 },
      );
      await expect(conflict.getByText('No answer')).toBeVisible();
      await expect(resultBox(card)).toHaveValue('My unsaved result');
      await expect(saveButton(card), 'a plain save would only be refused').toBeDisabled();

      // "Use their version" takes theirs and ends the conflict.
      await conflict.getByRole('button', { name: 'Use their version' }).click();
      await expect(resultBox(card)).toHaveValue('No answer');
      await expect(conflict).toHaveCount(0);

      // 3. Again, and this time "Save mine instead" saves over theirs, on purpose.
      await resultBox(card).fill('Mine, on purpose');
      const v3 = await colleague.get(client.id);
      expect(
        (await colleague.put(client.id, { ...pick(v3), result: 'Theirs again' })).status(),
      ).toBe(200);
      await expect(conflict).toBeVisible({ timeout: 15_000 });
      const [mine] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes(`/followup`) && r.request().method() === 'PUT',
        ),
        conflict.getByRole('button', { name: 'Save mine instead' }).click(),
      ]);
      expect(mine.status()).toBe(200);
      await expect(conflict).toHaveCount(0);
      const stored = await readNotes(api, client.id);
      expect(stored.result).toBe('Mine, on purpose');
      expect(stored.followUp).toBe('Colleague rewrote it');
    } finally {
      await retire(api, colleague);
    }
  });

  test('without realtime, the save itself is refused as stale and the conflict is shown', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const api = await adminApi(context);
    const colleague = await inviteColleague(api);
    try {
      const client = await newClient(context, 'stale');
      await writeNotes(api, client.id, { result: 'Before' });
      // Cut this page off from the realtime server: only the 409 can tell it.
      await page.routeWebSocket(/:3003\//, (ws) => ws.close());
      await page.route(/localhost:3003\//, (route) => route.abort());
      const card = await openCard(page, client.id);

      await resultBox(card).fill('My edit');
      const theirs = await colleague.get(client.id);
      expect(
        (await colleague.put(client.id, { ...pick(theirs), result: 'Their edit' })).status(),
      ).toBe(200);
      // No live update reached the page: it still believes it is current.
      await expect(resultBox(card)).toHaveValue('My edit');

      const res = await saveFromCard(page, card, client.id);
      expect(res.status()).toBe(409);
      expect(((await res.json()) as { code?: string }).code).toBe('FOLLOWUP_STALE');
      const conflict = card.getByRole('alert').filter({ hasText: 'changed these notes' });
      await expect(conflict.getByText('Their edit')).toBeVisible();
      await expect(resultBox(card), 'the refused draft was thrown away').toHaveValue('My edit');
      expect((await readNotes(api, client.id)).result).toBe('Their edit');
    } finally {
      await retire(api, colleague);
    }
  });
});

test.describe('the same administrator in two tabs', () => {
  test('a save in one tab makes the other tab’s save stale, and it says so', async ({
    page,
    context,
  }) => {
    const client = await newClient(context, 'tabs');
    await writeNotes(await adminApi(context), client.id, { result: 'Start' });
    const tabA = await openCard(page, client.id);
    const other = await context.newPage();
    const tabB = await openCard(other, client.id);

    await resultBox(tabA).fill('From tab A');
    expect((await saveFromCard(page, tabA, client.id)).status()).toBe(200);

    // Realtime skips the actor's own tabs, so tab B learns of it only from its save.
    await resultBox(tabB).fill('From tab B');
    const res = await saveFromCard(other, tabB, client.id);
    expect(res.status()).toBe(409);
    const conflict = tabB.getByRole('alert').filter({ hasText: 'changed these notes' });
    await expect(conflict.getByText('From tab A')).toBeVisible();
    await expect(resultBox(tabB)).toHaveValue('From tab B');
    await other.close();
  });
});

test.describe('who may read and write', () => {
  test('without clients.followup.edit the notes are text; out of territory they do not exist', async ({
    browser,
    context,
  }) => {
    const api = await adminApi(context);
    const inside = await newClient(context, 'scoped');
    const outside = await newClient(context, 'outside');
    // In the restricted admin's territory: the e2e-alpha tag.
    const tags = (await (await api.get('/admin/tags')).json()) as { id: string; slug: string }[];
    const alpha = tags.find((tag) => tag.slug === E2E_TAGS.alpha.slug);
    expect(alpha, 'the e2e-alpha tag is not seeded').toBeTruthy();
    expect((await api.post(`/admin/clients/${inside.id}/tags/${alpha!.id}`)).ok()).toBe(true);
    await writeNotes(api, inside.id, {
      followUp: 'First line\nSecond line',
      result: 'Interested',
      followUpAt: new Date(Date.now() + 2 * DAY).toISOString(),
    });

    const restricted = await browser.newContext({ storageState: RESTRICTED_STATE });
    try {
      const page = await restricted.newPage();
      const card = await openCard(page, inside.id);
      await expect(card.getByText('First line')).toBeVisible();
      await expect(card.getByText('Second line')).toBeVisible();
      await expect(card.getByText('Interested')).toBeVisible();
      await expect(card.getByRole('textbox')).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Save notes' })).toHaveCount(0);
      // No audit.view: no History link to a page they cannot open.
      await expect(card.getByRole('link', { name: 'History' })).toHaveCount(0);

      const restrictedApi = await adminApi(restricted);
      const write = await restrictedApi.put(`/admin/clients/${inside.id}/followup`, {
        followUp: 'not mine to write',
        result: null,
        followUpAt: null,
        version: 1,
      });
      expect(write.status(), 'a write without clients.followup.edit').toBe(403);
      const away = await restrictedApi.get(`/admin/clients/${outside.id}/followup`);
      expect(away.status(), 'a client outside the territory must read as missing').toBe(404);
    } finally {
      await restricted.close();
    }
  });
});

test.describe('the API refuses what the console never sends', () => {
  test('stale, past, far, offset-less, over-long and malformed saves are refused; NUL is dropped', async ({
    context,
  }) => {
    const api = await adminApi(context);
    const client = await newClient(context, 'api');
    const path = `/admin/clients/${client.id}/followup`;
    const saved = await writeNotes(api, client.id, { followUp: 'Base' });
    const body = { followUp: 'Base', result: null, followUpAt: null, version: saved.version };

    const stale = await api.put(path, { ...body, followUp: 'Different', version: 0 });
    expect(stale.status()).toBe(409);
    expect(((await stale.json()) as { code?: string }).code).toBe('FOLLOWUP_STALE');

    // The same notes from an old version change nothing, so they are not a conflict.
    expect((await api.put(path, { ...body, version: 0 })).status()).toBe(200);

    const past = await api.put(path, {
      ...body,
      followUpAt: new Date(Date.now() - 3 * DAY).toISOString(),
    });
    expect(past.status()).toBe(400);
    expect(((await past.json()) as { fields?: Record<string, string> }).fields).toHaveProperty(
      'followUpAt',
    );
    const far = await api.put(path, {
      ...body,
      followUpAt: new Date(Date.now() + 6 * 366 * DAY).toISOString(),
    });
    expect(far.status()).toBe(400);
    expect((await api.put(path, { ...body, followUpAt: '2030-01-01T10:00:00' })).status()).toBe(
      400,
    );
    expect((await api.put(path, { ...body, followUpAt: 'tomorrow' })).status()).toBe(400);
    expect((await api.put(path, { ...body, followUp: 'x'.repeat(2001) })).status()).toBe(400);
    expect(
      (await api.put(path, { followUp: 'Missing fields', version: saved.version })).status(),
    ).toBe(400);
    expect((await api.put(path, { ...body, version: 'one' })).status()).toBe(400);
    expect((await api.put(path, { ...body, version: -1 })).status()).toBe(400);

    // Not a Portal ID: 400. A number nobody holds: 404, like any missing client.
    expect(
      (await api.get('/admin/clients/0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47/followup')).status(),
    ).toBe(400);
    expect((await api.get('/admin/clients/999999999/followup')).status()).toBe(404);

    // A NUL cannot be stored by Postgres: it is dropped, never a 500.
    const nul = await api.put(path, { ...body, followUp: 'Before\u0000After' });
    expect(nul.status()).toBe(200);
    expect(((await nul.json()) as FollowUp).followUp).toBe('BeforeAfter');

    // Nothing above slipped through.
    const final = await readNotes(api, client.id);
    expect(final.followUp).toBe('BeforeAfter');
    expect(final.followUpAt).toBeNull();

    // Line endings unified; a note of only blank lines is no note.
    const crlf = await api.put(path, {
      ...body,
      version: final.version,
      followUp: 'a\r\nb',
      result: '\n\n  \n',
    });
    expect(crlf.status()).toBe(200);
    const normalised = (await crlf.json()) as FollowUp;
    expect(normalised.followUp).toBe('a\nb');
    expect(normalised.result).toBeNull();

    // Earlier today is allowed: within the day's grace, wherever the reader is.
    const grace = await api.put(path, {
      ...pick(normalised),
      followUpAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    });
    expect(grace.status()).toBe(200);
  });

  test('two simultaneous first saves: exactly one wins; a suspended client keeps their notes', async ({
    context,
  }) => {
    const api = await adminApi(context);
    const client = await newClient(context, 'race');
    const path = `/admin/clients/${client.id}/followup`;
    const [a, b] = await Promise.all(
      ['first', 'second'].map((text) =>
        api.put(path, { followUp: text, result: null, followUpAt: null, version: 0 }),
      ),
    );
    expect([a?.status(), b?.status()].sort()).toEqual([200, 409]);
    expect((await readNotes(api, client.id)).version).toBe(1);

    const suspended = await api.patch(`/admin/clients/${client.id}/status`, {
      status: 'suspended',
    });
    expect(suspended.ok()).toBe(true);
    const saved = await writeNotes(api, client.id, { result: 'Suspended: called about it' });
    expect(saved.result).toBe('Suspended: called about it');
  });
});

test.describe('the clients list', () => {
  test('shows the notes with Overdue and Today marks, filters by them, exports them, and bulk follows the filter', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const api = await adminApi(context);
    const overdue = await newClient(context, 'listodue', 'Overdue');
    const today = await newClient(context, 'listtoday', 'Today');
    const later = await newClient(context, 'listlater', 'Later');
    const none = await newClient(context, 'listnone', 'Nodate');

    psql(
      `INSERT INTO client_followups (user_id, follow_up, result, follow_up_at, version) VALUES ` +
        `(${overdue.id}, 'Chase the documents', 'No answer', now() - interval '3 days', 1)`,
    );
    await writeNotes(api, today.id, {
      followUp: 'Call at noon',
      // Opens like a formula: the export must neutralise it.
      result: '=HYPERLINK("http://example.com","click")',
      followUpAt: todayAt(12, 0).toISOString(),
    });
    await writeNotes(api, later.id, {
      followUp: 'Send the spreads',
      followUpAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    await writeNotes(api, none.id, { result: 'Not interested' });

    const q = `fu${RUN}list`;
    await page.goto(`/clients?q=${q}`);
    const row = (name: string) => page.getByRole('row').filter({ hasText: name });
    await expect(row(overdue.name)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('columnheader', { name: 'Follow-up' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Result' })).toBeVisible();

    await expect(row(overdue.name).getByText('Overdue', { exact: true })).toBeVisible();
    await expect(row(overdue.name).getByText('Chase the documents')).toBeVisible();
    await expect(row(overdue.name).getByText('No answer')).toBeVisible();
    await expect(row(today.name).getByText('Today', { exact: true })).toBeVisible();
    await expect(row(later.name).getByText('Send the spreads')).toBeVisible();
    await expect(row(later.name).getByText('Overdue', { exact: true })).toHaveCount(0);
    await expect(row(later.name).getByText('Today', { exact: true })).toHaveCount(0);
    await expect(row(none.name).getByText('Not interested')).toBeVisible();

    // The filter: due is today or overdue, in this browser's day.
    const filter = page.getByRole('combobox', { name: 'Any follow-up' });
    await filter.click();
    await page.getByRole('option', { name: 'Follow-up due', exact: true }).click();
    await expect(page).toHaveURL(/followUp=due/);
    await expect(row(overdue.name)).toBeVisible();
    await expect(row(today.name)).toBeVisible();
    await expect(row(later.name)).toHaveCount(0);
    await expect(row(none.name)).toHaveCount(0);

    // The export is the screen: the same rows, the notes in their own columns,
    // and a note that opens like a formula is defused.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    const csv = readFileSync(await download.path(), 'utf8')
      .trim()
      .split('\n');
    expect(csv[0]).toContain('Follow-up,Follow-up date,Result');
    expect(csv.slice(1)).toHaveLength(2);
    expect(csv.join('\n')).toContain(`'=HYPERLINK`);
    expect(csv.join('\n')).not.toContain('Send the spreads');

    await filter.click();
    await page.getByRole('option', { name: 'Follow-up later', exact: true }).click();
    await expect(row(later.name)).toBeVisible();
    await expect(row(overdue.name)).toHaveCount(0);
    await expect(row(today.name)).toHaveCount(0);

    await filter.click();
    await page.getByRole('option', { name: 'No follow-up date', exact: true }).click();
    await expect(row(none.name)).toBeVisible();
    await expect(row(later.name)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(row(later.name)).toBeVisible();
    await expect(row(overdue.name)).toBeVisible();

    // "All matching" bulk acts on the filtered set the reader saw, and nothing more.
    const tagged = await api.post('/admin/tags', { label: `E2E FU ${RUN}` });
    expect(tagged.ok(), `creating the run tag answered ${tagged.status()}`).toBe(true);
    const tag = (await tagged.json()) as { id: string; slug: string };
    try {
      const dueBy = new Date();
      dueBy.setHours(24, 0, 0, 0);
      const bulk = await context.request.post(`${API_NODE_BASE}/admin/clients/bulk/tags`, {
        headers: {
          ...(await bulkHeaders(context)),
          'Idempotency-Key': `e2e-fu-bulk-${RUN}`,
        },
        data: {
          target: {
            filter: { q, followUp: 'due', followUpDueBy: dueBy.toISOString() },
            expectedCount: 2,
          },
          add: [tag.id],
        },
      });
      expect([200, 201], `bulk answered ${await bulk.text()}`).toContain(bulk.status());
      const taggedRows = await api.get(`/admin/clients?q=${q}&tag=${tag.slug}&limit=50`);
      const ids = ((await taggedRows.json()) as { items: { id: number }[] }).items.map((c) => c.id);
      expect(ids.sort()).toEqual([overdue.id, today.id].sort());
    } finally {
      await api.del(`/admin/tags/${tag.id}`);
    }
  });

  test('History opens the audit log on this client’s note changes', async ({ page, context }) => {
    const client = await newClient(context, 'history');
    const api = await adminApi(context);
    await writeNotes(api, client.id, { followUp: 'One' });
    await writeNotes(api, client.id, { followUp: 'Two' });
    const card = await openCard(page, client.id);

    await card.getByRole('link', { name: 'History' }).click();
    await expect(page).toHaveURL(/\/audit-log\?action=client\.followup_update/);
    // The filter the link applied, by its label…
    await expect(page.getByRole('combobox', { name: 'Filter by action' })).toHaveText(
      'Client follow-up edited',
    );
    // …and exactly this client's two note changes, each naming the client.
    const rows = page
      .getByRole('row')
      .filter({ hasText: 'client.followup_update' })
      .filter({ hasText: `#${client.id}` });
    await expect(rows).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: 'client.followup_update' })).toHaveCount(
      2,
    );
  });
});

/** The four fields a save sends back, from what a GET returned. */
function pick(notes: FollowUp) {
  return {
    followUp: notes.followUp,
    result: notes.result,
    followUpAt: notes.followUpAt,
    version: notes.version,
  };
}

/** The Origin + CSRF + cookie trio a write needs, for a call `adminApi` has no verb for. */
async function bulkHeaders(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  return { Origin: APP_ORIGIN, 'X-OxShare-CSRF': await csrfOf(context), Cookie: cookie };
}
