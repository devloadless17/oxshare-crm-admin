import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/*
 * `findBy*` and `waitFor` poll for 5s, not testing-library's default 1s.
 *
 * The default left the harness self-contradictory: vitest allows 20s per test
 * (`testTimeout` in vitest.config.mts), while every async DOM query inside it
 * gave up after ONE second. A screen whose React Query promise had not resolved
 * in that window failed with "Unable to find an element with the text …" and a
 * DOM dump still showing the loading spinner — which reads as a rendering bug in
 * the component, not as a query that was never given time to settle.
 *
 * That is exactly how it presented: the admin directory's suspended-status test
 * failed on a loaded machine while the other thirteen in the same file passed,
 * and passed again on re-run. Time spent reading it as a product defect is the
 * real cost of the mismatch.
 *
 * 10s is a polling CEILING, not a delay — a query that resolves immediately still
 * returns immediately, so the suite does not get slower. It keeps a 2x margin
 * under `testTimeout` so a genuinely stuck query still fails as a timeout with a
 * useful message rather than hitting the outer limit.
 *
 * The first test in a file is the one that fails, which is the tell: it pays the
 * module-import and first-render cost inside its own polling budget. On a busy
 * machine that import bill runs to minutes of CPU across workers, so 1s — and
 * even 5s — could be spent before the component had rendered at all.
 */
/*
 * 15s, raised from 10s on 18 Aug 2026 after three error-state assertions blew the
 * budget in one full run and passed alone immediately afterwards
 * (`clients/[id]`, `wallets`, `notifications-sheet` — all of them waiting for a
 * 404 to become a rendered BackendPending card).
 *
 * The cause is the one described above, measured: this machine has 22 cores, so
 * vitest hands 57 files to ~21 jsdom workers that import React and the app's
 * module graph simultaneously, and files that normally finish in 3s took 25–38s
 * in the failing run.
 *
 * CAPPING THE WORKERS WAS TRIED AND REJECTED, so nobody repeats the experiment:
 * `poolOptions.threads.maxThreads: 8` bounds the stampede but cost 44.3s against
 * a 32.1s baseline — a 38% slower suite to buy stability that a single green run
 * could not prove. Raising this ceiling is free by comparison: it is a POLLING
 * limit, so a query that resolves immediately still returns immediately, and only
 * a test that would otherwise fail spends the extra time.
 *
 * Still 25% under `testTimeout` (20s), which preserves the property the note
 * above depends on: a genuinely stuck query fails as "Unable to find an element"
 * with a DOM dump, not as a bare test timeout.
 *
 * If this needs raising a fourth time, stop and fix the contention instead —
 * either shard the suite or cap the workers and accept the wall-clock cost. A
 * ceiling that keeps climbing is a gate losing its meaning.
 */
configure({ asyncUtilTimeout: 15_000 });

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
//
// Without this cleanup, a component mounted in one test stays in the document for
// the next, and getByRole starts matching the wrong element — the kind of failure
// that reads as a flaky test rather than a missing teardown.
afterEach(() => {
  cleanup();
});

/*
 * jsdom shims that Radix UI needs.
 *
 * Radix's Select (and Dropdown, Popover…) drives its open/close through the
 * Pointer Events API and scrolls the highlighted item into view. jsdom implements
 * none of these, so without the stubs below a `click` on a SelectTrigger does
 * nothing at all: the portal never mounts, no `option` role ever appears, and a
 * test asserting on the menu fails as though the component were broken.
 *
 * These are the four the components in this app actually reach for. Keep them here
 * rather than per-test, because Select is on a dozen screens.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/*
 * Radix's Checkbox measures itself with `ResizeObserver`, which jsdom does not
 * implement — so without this the constructor throws during RENDER and takes the
 * whole component down, not just the checkbox.
 *
 * That presents in the worst possible way: every query in the file fails with
 * "Unable to find a label with the text of: /^host$/i", naming a field that has
 * nothing to do with checkboxes and sits ABOVE it in the form. Reading that as a
 * broken form is the obvious wrong turn, and it cost a full suite run here.
 *
 * A no-op is enough. The observer only feeds the size of the hidden bubble input
 * Radix renders for native form submission, and nothing in this app submits a
 * checkbox that way — every call site is controlled via `onCheckedChange`.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  // Cast for the reason `IntersectionObserver` below carries in full: a no-op
  // stub should not have to track additions to a DOM interface it is only
  // standing in for.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/*
 * `IntersectionObserver`, which jsdom also does not implement.
 *
 * Embla uses it to track which slides are in view. Same failure shape as
 * `matchMedia` above — it throws during init, inside an effect, from a stack
 * entirely within `node_modules`.
 *
 * The no-op never reports an intersection, so `slidesInView()` stays empty in
 * tests. Nothing in this app renders from that, and a test that needs it would
 * have to drive layout jsdom does not have anyway.
 */
if (typeof globalThis.IntersectionObserver === 'undefined') {
  /*
   * CAST rather than a class that satisfies the interface member by member.
   *
   * The structural version listed `root`, `rootMargin`, `thresholds` and
   * `takeRecords` to match `lib.dom.d.ts` — and broke the day TypeScript's DOM
   * lib grew `scrollMargin`, with an error naming a property this stub has no
   * opinion about. Every future addition to the interface breaks it again, in a
   * file whose entire purpose is to stop a MISSING API from being an error.
   *
   * The four methods below are what a caller actually invokes, so a typo in one
   * still fails at the call site. What the cast gives up is agreement with a
   * spec this no-op is not trying to implement.
   */
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

/*
 * `window.matchMedia`, which jsdom does not implement at all.
 *
 * Embla (the wallet carousel) calls it during INITIALISATION to resolve its
 * per-breakpoint options, so without this the constructor throws inside an
 * effect and every test that renders a carousel dies with "undefined is not a
 * function" pointing at `OptionsHandler` — a stack entirely inside
 * `node_modules`, naming nothing in this repo. That reads as a broken
 * dependency rather than a missing shim, which is the expensive way to find it.
 *
 * `matches: false` for every query is the right default, not an arbitrary one:
 * it means "no media condition applies", so components take their base
 * behaviour. For the carousel that resolves `prefers-reduced-motion` to false
 * and the animation stays on, which is the state worth exercising — a test run
 * under "reduced motion" would silently skip the movement it means to check.
 *
 * A test needing a specific answer should stub `window.matchMedia` itself for
 * the duration; this only stops the absence of the API from being an error.
 */
if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      // Both APIs: the modern pair is what this app uses, and the deprecated
      // pair is what some libraries still reach for on older browsers.
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
