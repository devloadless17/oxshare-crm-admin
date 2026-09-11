import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { adminApiSession, CONSOLE_PAGES } from './helpers';

/**
 * One sweep, every console page, for the defects a person notices and a test
 * suite usually does not.
 *
 * The portal's twin of this file exists because its verify-email screen shipped
 * two of them — it flashed unstyled content on every reload, and offered no way
 * off itself — and both were found by a human refreshing the page rather than by
 * either unit suite. Neither is specific to that screen, so both apps get swept
 * rather than patched one report at a time.
 *
 * ── One deliberate difference from the portal's sweep ───────────────────────
 *
 * There is NO 393px check here. The portal is used from phones and is asserted
 * at phone width; whether this console supports small screens at all is an open
 * question (DECISIONS D-43, raised by the KYC review as §11r "desktop-only, and
 * undeclared"). Asserting a mobile layout would invent a requirement nobody has
 * agreed to.
 *
 * What IS asserted is that it fits its own design width. A desktop console that
 * scrolls sideways at 1280px is broken on its own terms, and that needs no
 * decision from anyone.
 */

/** Signed-in pages — every built console page, shared with console-pages. */
const PRIVATE = CONSOLE_PAGES;

/**
 * Screens outside the console chrome.
 *
 * `/invite/accept` matters most of the three: it is the FIRST thing a new
 * administrator ever sees of this product, opened from an emailed link, on a
 * machine that has never loaded the app before — so it gets no warm cache and
 * every flaw is on show at the worst moment.
 */
const STANDALONE = ['/login', '/invite/accept'];

/**
 * Controls whose only content is an icon, and whether the browser can name them.
 *
 * Reads the accessibility tree rather than one attribute, so `aria-label`,
 * `title`, visually-hidden text and `aria-labelledby` all count — the question
 * is what assistive technology would announce, not which technique was used.
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const unnamed: string[] = [];
    document.querySelectorAll('button, a[href]').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const named =
        (el.textContent ?? '').trim().length > 0 ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('aria-labelledby') ||
        // `<label htmlFor>` association names a labelable element (buttons
        // included — Radix checkboxes render as one) exactly as an aria-label
        // would. Skipping it flagged every properly-labelled checkbox.
        ('labels' in el && ((el as HTMLButtonElement).labels?.length ?? 0) > 0);
      if (!named) {
        unnamed.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`);
      }
    });
    return unnamed;
  });
}

test.describe('no standalone screen flashes unstyled content', () => {
  /*
   * Scripting OFF, which is the precise question rather than a proxy for it:
   * runtime CSS-in-JS cannot apply without a script, a linked stylesheet always
   * does. No timing involved, so no flaky early sampling.
   */
  test.use({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });

  for (const path of STANDALONE) {
    test(`${path} is laid out before any script runs`, async ({ page }) => {
      await page.goto(path);

      const layout = await page.evaluate(() => {
        const root = document.querySelector('main') ?? document.body.firstElementChild;
        const card = root?.querySelector('div');
        const r = card?.getBoundingClientRect();
        return {
          rendered: Boolean(root),
          cardWidth: r?.width ?? null,
          viewport: window.innerWidth,
        };
      });

      expect(layout.rendered, `${path} rendered nothing without JavaScript`).toBe(true);
      if (layout.cardWidth !== null) {
        expect(
          layout.cardWidth,
          `${path} painted full-bleed without styles — it will jump when the script lands`,
        ).toBeLessThan(layout.viewport);
      }
    });
  }
});

test.describe('no page scrolls sideways at its own design width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const path of [...PRIVATE, ...STANDALONE]) {
    test(`${path} fits 1280px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        /*
         * ⚠️ `body.scrollWidth`, NEVER `documentElement.scrollWidth`.
         *
         * `globals.css` sets `overflow: hidden` on html AND body — deliberately,
         * it is what makes the shell's own container the only thing that
         * scrolls. The consequence: `documentElement.scrollWidth` is PINNED to
         * `clientWidth` and can never exceed it, so the assertion below was
         * structurally satisfied on every screen whatever its layout.
         *
         * MEASURED, not reasoned: on /financial at 400px, injecting a 3000px
         * child left documentElement at 400 while body.scrollWidth moved to
         * 3000. Two mutations — shrinking the viewport to 160px, and injecting
         * that child — BOTH passed against the old form.
         *
         * `Math.max` of the two rather than body alone, because THE TWO APPS
         * DIFFER and a per-app instrument would be a second thing to keep in
         * step. Measured in the portal by `crm-92`: its `html` computes
         * `overflow-x: visible`, so `documentElement.scrollWidth` DOES reach
         * 3000 there and its check was never vacuous. Taking the max is correct
         * in both without branching.
         *
         * ⚠️ And the reason I assumed otherwise is worth keeping: root
         * `CLAUDE.md` says these two `globals.css` files are byte-identical.
         * They are not, any more — the admin gained this `overflow: hidden`
         * rule and the portal never did. A claim about a twin file that was
         * true when written is still a claim about a document nobody has open.
         *
         * The clipping makes it worse rather than better: with overflow hidden
         * a reader cannot scroll to content that is too wide, so it is
         * unreachable rather than merely awkward. The symptom is suppressed and
         * the defect invisible — which is exactly "a test that never attempts
         * the forbidden thing".
         */
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        overflow.scrollWidth,
        `${path} is ${overflow.scrollWidth - overflow.clientWidth}px wider than the window`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});

/**
 * The same rule at PHONE width, for Domain 4's screens only.
 *
 * ## Why a narrower list rather than every page
 *
 * The 1280px sweep above covers everything, because 1280 is the width these
 * screens were designed at and none of them may break there. 400px is a
 * different claim: nothing in this console has been laid out for a phone yet,
 * so running it over all twenty pages would report other domains' unbuilt work
 * as this domain's regressions. Scoped to the screens actually signed off, it
 * says something true and keeps saying it.
 *
 * Widen this list as each domain is swept, never shrink it.
 *
 * ## `/invite/accept` is the one that genuinely matters
 *
 * It is the FIRST thing a new administrator sees of this product, and it is
 * reached by tapping a link in an email — which is to say, more often than not,
 * on a phone. The console pages are back-office screens an operator opens at a
 * desk; the accept page is the only one in Domain 4 whose realistic first view
 * is 400px wide.
 *
 * 400px rather than 375: it is the width the artifact guidance in this project
 * treats as the floor, and it is narrow enough to catch a fixed `min-width` or
 * an unwrapped filter row, which is what actually breaks these layouts.
 */
test.describe('console screens do not scroll sideways on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 } });

  /*
   * ⚠️ THIS LIST IS HAND-MAINTAINED, AND THAT IS THE DEFECT IT KEEPS PRODUCING.
   *
   * It was `['/admin-users', '/roles', '/audit-log']` — Domain 4's three
   * screens — and the block was named for that domain. Domain 6 then closed
   * without adding the MONEY screens, so the five surfaces where an operator
   * moves a client's funds were absent from the phone check entirely, while the
   * 1280px check beside it covered them automatically by deriving from
   * `CONSOLE_PAGES`.
   *
   * The identical gap was found in the portal's own sweep in the same session:
   * `/deposit`, `/withdraw` and `/transfer` — the three screens that ACT on
   * money — were missing while the six that merely display it were covered.
   * **The screens you look at get swept; the screens you act on get forgotten**,
   * because a hand-written list grows by whoever last remembered it.
   *
   * All of them pass, so in both cases the defect was the COVERAGE rather than
   * the layout. That is worth stating: a gap that turns out to be clean is
   * still a gap, because nothing was stopping it from being dirty.
   *
   * It stays hand-written rather than derived from `CONSOLE_PAGES` because a
   * phone run of every console page is minutes of CI for screens an operator
   * genuinely opens at a desk. The judgement is which surfaces a person might
   * reach on a phone — a withdrawal a client is chasing, a reconciliation
   * somebody checks after an alert — and that is a decision, not a filesystem
   * walk. **Adding to it is the maintenance cost of that decision.**
   */
  for (const path of [
    '/admin-users',
    '/roles',
    '/audit-log',
    // Domain 6 — the money surface. An operator chasing a withdrawal or
    // checking a reconciliation after an alert does it from wherever they are.
    '/transactions',
    '/financial',
    '/reconciliation',
    '/wallets',
    '/ledger',
  ]) {
    test(`${path} fits 400px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        /*
         * ⚠️ `body.scrollWidth`, NEVER `documentElement.scrollWidth`.
         *
         * `globals.css` sets `overflow: hidden` on html AND body — deliberately,
         * it is what makes the shell's own container the only thing that
         * scrolls. The consequence: `documentElement.scrollWidth` is PINNED to
         * `clientWidth` and can never exceed it, so the assertion below was
         * structurally satisfied on every screen whatever its layout.
         *
         * MEASURED, not reasoned: on /financial at 400px, injecting a 3000px
         * child left documentElement at 400 while body.scrollWidth moved to
         * 3000. Two mutations — shrinking the viewport to 160px, and injecting
         * that child — BOTH passed against the old form.
         *
         * The clipping makes it worse rather than better: with overflow hidden
         * a reader cannot scroll to content that is too wide, so it is
         * unreachable rather than merely awkward. The symptom is suppressed and
         * the defect invisible — which is exactly "a test that never attempts
         * the forbidden thing".
         */
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        clientWidth: document.documentElement.clientWidth,
        height: document.body.scrollHeight,
        text: (document.body.innerText ?? '').trim().length,
      }));

      /*
       * NON-VACUITY. A page that rendered NOTHING — a redirect to login, a
       * blank error boundary, a crashed hydration — cannot scroll sideways, so
       * it passes the assertion below for the one reason that should fail it.
       * This is the layout equivalent of a test that never attempts the
       * forbidden act.
       */
      expect(
        overflow.text,
        `${path} rendered almost no text at 400px — the layout assertion below ` +
          'would pass on a blank page, so this is checked first',
      ).toBeGreaterThan(200);
      expect(overflow.height, `${path} has no vertical extent at 400px`).toBeGreaterThan(100);

      /*
       * A table wider than the screen is FINE — `DataTable` puts one inside its
       * own `overflow-x: auto`, which is the correct answer for a grid of
       * columns nobody wants stacked. What this refuses is the DOCUMENT
       * scrolling, which means a header, a filter row or a dialog is pushing
       * the page itself wide and the operator is panning the whole screen to
       * read it.
       */
      expect(
        overflow.scrollWidth,
        `${path} is ${overflow.scrollWidth - overflow.clientWidth}px wider than a 400px screen`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }

  /**
   * `/invite/accept` WITH A REAL TOKEN, because without one it is a different
   * screen entirely.
   *
   * A bare `/invite/accept` renders the invalid-link state — about fifty
   * characters of apology and nothing else. Laying that out proves nothing
   * about the page a new administrator actually meets, which is a form: a
   * greeting naming them, a password field, a confirmation field and a submit
   * button. The terse error state passed a 400px check trivially and the FORM
   * had never been measured at any width but 1280.
   *
   * This is the screen with the strongest claim to a phone test in the whole
   * console — it is the first thing a new administrator ever sees of this
   * product and it is reached by tapping a link in an email.
   */
  test('/invite/accept fits 400px with a REAL invite, which is a different screen', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const admin = await adminApiSession();
    try {
      const email = `ux-mobile-invite-${Date.now()}@oxshare.com`;
      const res = await admin.post('/admin/invite', {
        email,
        name: 'UX Mobile Invitee',
        permissions: ['kyc.review'],
      });
      expect(res.ok(), `invite create answered ${res.status()}`).toBe(true);
      const { inviteUrl } = (await res.json()) as { inviteUrl?: string };
      if (!inviteUrl) throw new Error('no inviteUrl echoed — this spec needs the dev echo');
      const token = new URL(inviteUrl).searchParams.get('token');

      await page.goto(`/invite/accept?token=${token}`);
      await page.waitForLoadState('networkidle');

      // The FORM, not the apology: a password field is what distinguishes them,
      // so this doubles as the non-vacuity guard for the assertion below.
      await expect(page.locator('input[type="password"]').first()).toBeVisible();

      const overflow = await page.evaluate(() => ({
        /*
         * ⚠️ `body.scrollWidth`, NEVER `documentElement.scrollWidth`.
         *
         * `globals.css` sets `overflow: hidden` on html AND body — deliberately,
         * it is what makes the shell's own container the only thing that
         * scrolls. The consequence: `documentElement.scrollWidth` is PINNED to
         * `clientWidth` and can never exceed it, so the assertion below was
         * structurally satisfied on every screen whatever its layout.
         *
         * MEASURED, not reasoned: on /financial at 400px, injecting a 3000px
         * child left documentElement at 400 while body.scrollWidth moved to
         * 3000. Two mutations — shrinking the viewport to 160px, and injecting
         * that child — BOTH passed against the old form.
         *
         * The clipping makes it worse rather than better: with overflow hidden
         * a reader cannot scroll to content that is too wide, so it is
         * unreachable rather than merely awkward. The symptom is suppressed and
         * the defect invisible — which is exactly "a test that never attempts
         * the forbidden thing".
         */
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `/invite/accept is ${overflow.scrollWidth - overflow.clientWidth}px wider than a phone`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    } finally {
      await admin.dispose();
    }
  });
});

test.describe('every control can be announced', () => {
  for (const path of PRIVATE) {
    test(`${path} has no unnamed buttons or links`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const unnamed = await unnamedControls(page);
      expect(unnamed, `${path} has controls a screen reader announces as just "button"`).toEqual(
        [],
      );
    });
  }
});

/*
 * THE DEAD-END CHECK IS DELIBERATELY ABSENT FROM THIS SUITE.
 *
 * The portal asserts it on every standalone screen, and it caught a real trap
 * there. Ported here it failed on `/login`, and the honest reading is not that
 * the page is missing a link — it is that THIS CONSOLE HAS NO PASSWORD RECOVERY
 * AT ALL. No `/forgot-password` route, and no endpoint behind one: an admin who
 * forgets their password is locked out until somebody edits the database by
 * hand.
 *
 * That is a product gap, not a layout defect, and it is not one to close
 * quietly: password recovery for accounts that approve payouts is a design
 * decision — self-service by email, or reset by a master admin — with different
 * security properties. Recorded in DECISIONS rather than papered over with a
 * link to a page that does not exist.
 *
 * `/invite/accept` would be exempt regardless: an invitee has no account yet, so
 * there is nowhere to send them except the form in front of them. A dead end is
 * only a defect when there is an exit worth offering.
 *
 * Restore this block when recovery exists.
 */
