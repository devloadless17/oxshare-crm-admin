import { expect, test, type Page } from '@playwright/test';

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

/** Signed-in pages. */
const PRIVATE = [
  '/dashboard',
  '/clients',
  '/kyc',
  '/roles',
  '/admin-users',
  '/audit-log',
  '/settings',
  '/invite',
];

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
        el.getAttribute('aria-labelledby');
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
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        overflow.scrollWidth,
        `${path} is ${overflow.scrollWidth - overflow.clientWidth}px wider than the window`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
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
