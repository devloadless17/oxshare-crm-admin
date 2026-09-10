import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_PERMISSIONS } from './permissions';

/**
 * `ALL_PERMISSIONS` REALLY IS EVERY KEY THE BACKEND CATALOGUE DEFINES.
 *
 * ## The failure this exists for, which is worse than an out-of-date list
 *
 * That fixture means "this administrator can do everything", and dozens of
 * screen tests grant it to assert a control is OFFERED. When the backend adds a
 * permission and nobody adds it here, those tests do not fail — the fixture
 * stays valid, the admin simply cannot do the new thing, and the FIRST test
 * written against the new control fails with the control missing from the DOM.
 *
 * That reads as a broken screen. It cost exactly that on 11 Sep 2026: a control
 * gated on `kyc.identity.correct` rendered nothing, and the obvious readings
 * were a broken permission check or a broken render. The real answer was a
 * fixture three keys behind — and the OTHER two, `ib.commissions.reverse` and
 * `transfers.abandon`, had been missing for longer with nothing reporting it.
 *
 * `permissions.ts` opens by calling itself "every permission key the backend
 * catalog defines". It was not, and nothing checked. Same shape as the ledger
 * trigger and the twin-file exclusion: a statement of fact in a comment, with
 * no mechanism holding it true.
 *
 * ## Why a test rather than generating the fixture
 *
 * Generating it would remove the drift and the REVIEW. A new permission is a
 * decision about what an operator may do; a human adding the key is a human
 * seeing it exist. This fails, names the keys, and takes ten seconds to fix.
 *
 * ## Absent backend is a SKIP, and a declared one
 *
 * Same reasoning as `sort-contract-census.test.ts`: a colleague may hold this
 * repo without its siblings, and a census that fails the build where it was
 * never able to run is not stricter, only broken somewhere else. The skip is
 * visible in the describe name rather than silent.
 */
function loadCatalogue(): Record<string, { permissions: { key: string }[] }> | null {
  for (const candidate of [
    // CI first — the same sparse-checkout path the sort census reads, and for
    // the same reason: a census that skips in CI runs only on a full checkout.
    '.contract/permissions.json',
    '../oxshare-crm-backend/src/config/permissions.json',
    '../../oxshare-crm-backend/src/config/permissions.json',
  ]) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')) as Record<
        string,
        { permissions: { key: string }[] }
      >;
    } catch {
      // Absence is a legitimate environment, not a failure.
    }
  }
  return null;
}

const CATALOGUE = loadCatalogue();

describe.skipIf(CATALOGUE === null)(
  'the ALL_PERMISSIONS fixture mirrors the backend catalogue',
  () => {
    const catalogueKeys = Object.values(CATALOGUE ?? {}).flatMap((group) =>
      group.permissions.map((permission) => permission.key),
    );

    it('is missing no key the backend defines', () => {
      const missing = catalogueKeys.filter((key) => !ALL_PERMISSIONS.includes(key));

      expect(
        missing,
        'the backend defines these and the fixture does not, so an admin granted ' +
          '"everything" in a test cannot do them — and the first test written against ' +
          'a control gated on one will fail with the control absent from the DOM, ' +
          'which reads as a broken screen. Add them to src/test/permissions.ts.',
      ).toEqual([]);
    });

    it('names no key the backend does not define', () => {
      /*
       * The other direction, and it fails differently: a fixture key the
       * catalogue dropped grants a power that no longer exists, so a test can
       * assert a control is offered to an operator the real API would refuse.
       * Green here, 403 in production.
       */
      const invented = ALL_PERMISSIONS.filter((key) => !catalogueKeys.includes(key));

      expect(
        invented,
        'the fixture names these and the backend catalogue does not — a test granting ' +
          'them asserts a power the API would refuse.',
      ).toEqual([]);
    });

    it('sees a catalogue worth checking against', () => {
      // A census whose subject list is empty agrees with every rule anybody
      // writes. Both cases above pass trivially against a catalogue that failed
      // to parse into anything.
      expect(catalogueKeys.length, 'the catalogue parsed to nothing').toBeGreaterThan(50);
    });
  },
);
