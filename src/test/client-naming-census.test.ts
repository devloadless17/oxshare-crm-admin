import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A CLIENT IS NEVER RENDERED AS NOTHING.
 *
 * `firstName` and `lastName` are maskable (RBAC-03) and a masked field is
 * REMOVED from the payload, so `[firstName, lastName].filter(Boolean).join(' ')`
 * is the empty string for any role that hides them. Screens then fell back in
 * three different ways, and all three are wrong:
 *
 *   || ''            an empty cell, which reads as a rendering fault
 *   || '—'           a dash, which reads as "there is no client here"
 *   || email         also maskable, so it collapses to the same empty string
 *   || user.id       the UUID — which this console does not show at all (0133)
 *
 * Reported from production: a client's partner card rendered blank and the
 * admin concluded the client had no IB. The IB existed, was inside their
 * territory, and only the NAME was masked. A masking feature that makes records
 * look ABSENT is worse than one that shows too much, because the reader draws a
 * confident wrong conclusion instead of asking.
 *
 * The rule: name, else email, else the PORTAL ID. `client.portalId` is
 * `maskable: false` in `client-fields.json` — it identifies the record rather
 * than the person — so it is always there to print. `clientLabel()` and
 * `<ClientIdentity>` both implement exactly that; this test stops a fourth
 * hand-rolled chain appearing.
 */

const ROOTS = ['components', 'app'].map((d) => join(__dirname, '..', d));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** The hand-rolled join this rule replaces. */
/*
 * BOUNDED on purpose. `[^\]]*` is unbounded and happily spans from an outer
 * `return [` — a column-definition array — all the way down to a `firstName`
 * hundreds of characters later, reporting the wrong construct at the wrong
 * line. A client-name join is a short expression; 120 characters per gap is
 * generous for one and far too short to swallow a file's structure.
 */
const HAND_ROLLED =
  /\[[^\]]{0,120}\bfirstName\b[^\]]{0,120}\blastName\b[^\]]{0,120}\]\s*\n?\s*\.?\s*filter\(/g;

/*
 * The other hand-rolled shape: a TEMPLATE LITERAL or JSX pair,
 * `${x.firstName} ${x.lastName}` / `{x.firstName} {x.lastName}`. Masked, it
 * printed "undefined undefined" on the IB approvals desk and fed "{name}" into
 * the withdrawal dialogs (29 Sep 2026). There is no Portal ID to excuse it in
 * the same breath, so any occurrence is an offender.
 */
const TEMPLATE_NAME = /\$?\{\s*[\w?.]*firstName[^}]{0,20}\}\s*\$?\{\s*[\w?.]*lastName[^}]{0,20}\}/g;

describe('every client is named by something a mask cannot remove', () => {
  it('no screen joins firstName and lastName by hand', () => {
    const offenders: string[] = [];

    for (const file of ROOTS.flatMap(sources)) {
      // The one file allowed to do it: it IS the implementation.
      if (file.endsWith(join('clients', 'client-identity.tsx'))) continue;

      const text = readFileSync(file, 'utf8');
      /*
       * The join itself is not the defect — the FALLBACK is. Handing the joined
       * value to `<ClientIdentity>` is correct, because that component prints
       * the Portal ID when name and email are both absent; so is ending the
       * chain in `#${portalId}` by hand.
       *
       * So the window after the match is what decides, not the match. A blunter
       * rule flagged `financial/transaction-columns.tsx`, which does exactly the
       * right thing — and a census that cries wolf is one somebody deletes.
       */
      /*
       * EVERY occurrence, not the first. A file with two client labels — one
       * ending in the Portal ID and one ending in `''` — passed a check that
       * only looked at whichever came first, which is precisely the shape of
       * bug this rule exists to find.
       */
      for (const m of text.matchAll(TEMPLATE_NAME)) {
        offenders.push(
          `${file.replace(join(__dirname, '..'), 'src')}:${
            text.slice(0, m.index).split('\n').length
          } (template name)`,
        );
      }
      for (const m of text.matchAll(HAND_ROLLED)) {
        const window = text.slice(m.index ?? 0, (m.index ?? 0) + 600);
        // CASE-INSENSITIVE: the field is `clientPortalId` in the network tree
        // and `portalId` elsewhere, and a case-sensitive test called the
        // correct one an offender.
        if (/portalid|ClientIdentity/i.test(window)) continue;
        offenders.push(
          `${file.replace(join(__dirname, '..'), 'src')}:${
            text.slice(0, m.index).split('\n').length
          }`,
        );
      }
    }

    expect(
      offenders,
      'A screen builds a client name by hand instead of using clientLabel() or\n' +
        '<ClientIdentity>. Both name fields are maskable and arrive UNDEFINED for a\n' +
        'role that hides them, so the hand-rolled version renders an empty string —\n' +
        'and an empty cell reads as "there is no client here" rather than "you may\n' +
        'not see this one". Fall through to the Portal ID, which is maskable: false.\n' +
        `Offenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('nothing falls back to a client UUID', () => {
    /*
     * The other half, and the one that hid behind a plausible-looking chain:
     * `name || email || user.id`. It never renders empty, so it survives the
     * rule above — and prints 36 characters of uuid in a confirmation dialog
     * for exactly the fully-masked client the reader most needs to identify.
     * A client is named by Portal ID in this console; the uuid is internal.
     */
    const offenders: string[] = [];
    const UUID_FALLBACK = /\|\|\s*(?:\w+\??\.)*(?:user\??\.)?id\s*[,)\n]/;

    for (const file of ROOTS.flatMap(sources)) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (!UUID_FALLBACK.test(line)) return;
        if (!/firstName|lastName|clientName|email/.test(text.slice(0, text.indexOf(line) + 400)))
          return;
        offenders.push(`${file.replace(join(__dirname, '..'), 'src')}:${i + 1}`);
      });
    }

    expect(
      offenders.filter((o) => !o.includes('client-identity')),
      'A client label falls back to a uuid. Use the Portal ID — see 0133.',
    ).toEqual([]);
  });
});
