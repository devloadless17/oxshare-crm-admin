import { expect, test } from './fixtures';
import { adminApiSession, E2E_CLIENTS, E2E_RESTRICTED } from './helpers';

/**
 * FR-RBAC-03's mask, on the one surface no other spec checks: EXPORTS.
 *
 * A CSV leaves the building. If the mask holds on the screen and on the JSON
 * wire but the export writes the email anyway, the control is decoration —
 * the restricted operator just downloads what they were denied. So the same
 * three properties proven elsewhere for the list and the detail are proven
 * here for the file: the masked value is ABSENT, the out-of-scope client is
 * absent ENTIRELY, and an export the actor holds no key for refuses outright.
 */

test('the client CSV honours the mask, the territory, and the permission catalog', async () => {
  /*
   * TWO admin logins in the body, against a 5-a-minute-per-IP cap.
   *
   * Run alone this never waits and the default 60s was plenty. Run as test 110
   * of the full suite it arrives with the window already spent, so
   * `adminApiSession` sleeps out the cap — 65s, which cannot fit a 60s
   * timeout. The failure reads as a product timeout on the export and is
   * nothing of the kind, which is the expensive part.
   *
   * 180s, the same allowance every other spec that signs in makes. The cap is
   * waited out rather than raised: it protects the real login endpoint.
   */
  test.setTimeout(180_000);
  /*
   * Sessions minted over the wire, not read from the storage-state jars: the
   * jars' cookies are scoped to the BROWSER's API host, which in the crosshost
   * topology is not the host Node dials — a jar-seeded request context sends
   * no cookies there and answers 401. adminApiSession logs in on the Node
   * host, so its cookies always attach.
   */
  const restricted = await adminApiSession(E2E_RESTRICTED);
  const master = await adminApiSession();
  try {
    const res = await restricted.get(`/admin/clients/export`);
    expect(res.ok(), `restricted export answered ${res.status()}`).toBe(true);
    const csv = await res.text();

    // Their client is in the file — by NAME (First/Last are separate columns)...
    expect(csv, 'the scoped export lost their own client').toContain('Alpha,Aardvark');
    // ...but the masked email CELL is empty: the value is nowhere in the file.
    expect(csv, 'the mask does not reach the CSV').not.toContain(E2E_CLIENTS.alpha.email);

    // Territory: the fixture is scoped to the alpha tag with NO intake grant,
    // so every other client — tagged or not — is absent entirely.
    expect(csv, 'a client outside the territory leaked into the export').not.toContain('Bravo');
    expect(csv).not.toContain(E2E_CLIENTS.bravo.email);

    // The same file for the MASTER masks nothing — proving the CSV above was
    // masked by policy, not by the exporter dropping the column for everyone.
    const masterRes = await master.get(`/admin/clients/export`);
    expect(masterRes.ok()).toBe(true);
    const masterCsv = await masterRes.text();
    expect(masterCsv, 'the master export lost the email column').toContain(E2E_CLIENTS.alpha.email);
    expect(masterCsv, 'the master export lost the out-of-territory client').toContain(
      'Bravo,Baker',
    );

    // The restricted fixture's ROLE carries kyc.review, so the KYC export
    // answers — and must carry the same mask as the client one.
    const kycRes = await restricted.get(`/admin/kyc/export`);
    expect(kycRes.ok(), `kyc export answered ${kycRes.status()}`).toBe(true);
    expect(
      (await kycRes.text()).includes(E2E_CLIENTS.alpha.email),
      'the mask does not reach the KYC CSV',
    ).toBe(false);
    // The audit log is the master's alone.
    expect(
      (await restricted.get(`/admin/audit-log/export`)).status(),
      'an ungranted audit export answered',
    ).toBe(403);
  } finally {
    await restricted.dispose();
    await master.dispose();
  }
});
