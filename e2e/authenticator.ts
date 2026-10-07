import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * THE AUTHENTICATOR, DRIVEN THE WAY A PERSON DRIVES IT (since backend 0191).
 *
 * Every administrator signs in with a code from an authenticator app, and the
 * e2e suite does too — there is deliberately NO bypass: a "skip the second
 * factor" switch is a production setting waiting to be flipped by mistake, and
 * a suite that skips it never proves the real sign-in works.
 *
 * Instead the suite is its own authenticator app:
 *   - ENROL: the setup screen shows the key as text (`data-testid="totp-secret"`,
 *     the "can't scan?" line); we read it, compute the code (RFC 6238), type it.
 *   - CHALLENGE: an already-enrolled account is asked for a code; we compute it
 *     from the key saved at enrolment (`e2e/.auth/totp/<email>`, gitignored).
 *   - LOCALLY, before each sign-in, the account's authenticator is cleared in the
 *     dev database so every run enrols afresh and never depends on a stale file.
 *     No network route can reset an authenticator — on purpose — so this needs
 *     the database (E2E_DB_EXEC); where it is unreachable (CI's fresh database)
 *     the saved key carries the run.
 *
 * Only DEDICATED TEST ACCOUNTS are ever reset (`e2e-*@oxshare.com`,
 * `*@oxshare-e2e.test`); anything else throws rather than wiping a real
 * person's authenticator on the dev database.
 */

const SECRETS = join(__dirname, '.auth', 'totp');

/** RFC 6238, SHA-1, 6 digits, 30-second steps — what the API checks. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/[\s=]+/g, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Run SQL against the DEV database (`E2E_DB_EXEC` overrides the docker default). */
export function psql(sql: string): string {
  const cmd = (
    process.env.E2E_DB_EXEC ?? 'docker exec -i oxshare-postgres psql -U oxshare -d oxshare -tA'
  ).split(' ');
  const [bin = 'docker', ...args] = cmd;
  return execFileSync(bin, [...args, '-c', sql], { encoding: 'utf8', stdio: 'pipe' }).trim();
}

let reachable: boolean | undefined;
export function devDbReachable(): boolean {
  if (reachable === undefined) {
    try {
      psql('select 1');
      reachable = true;
    } catch {
      reachable = false;
    }
  }
  return reachable;
}

const TEST_ACCOUNT = /^e2e-[a-z0-9-]+@oxshare\.com$|@oxshare-e2e\.test$/i;

/** Clear a TEST account's authenticator in the dev DB, so its next sign-in enrols. */
export function resetAuthenticator(email: string): void {
  if (!TEST_ACCOUNT.test(email)) {
    throw new Error(`Refusing to reset the authenticator of ${email}: not an e2e test account.`);
  }
  if (!devDbReachable()) return;
  psql(
    'UPDATE admins SET totp_secret=NULL, totp_pending_secret=NULL, totp_enabled_at=NULL, ' +
      `totp_last_step=NULL WHERE email='${email.replace(/'/g, "''")}'`,
  );
  // The server forgot the last step, so the window guard below may too.
  rmSync(`${secretFile(email)}.step`, { force: true });
}

function secretFile(email: string): string {
  return join(SECRETS, email.toLowerCase());
}

/**
 * A code the API will accept:
 *   - never from the last 4 s of a 30-s step (it could expire in flight);
 *   - never from a step this account already used — the API refuses a replayed
 *     step (`consumeTotpStep`), rightly, so two sign-ins of one account inside
 *     one window would fail the second. The last step used is kept beside the key.
 */
async function freshCode(secret: string, email?: string): Promise<string> {
  const stepFile = email ? `${secretFile(email)}.step` : undefined;
  const used = stepFile && existsSync(stepFile) ? Number(readFileSync(stepFile, 'utf8')) : -1;
  for (;;) {
    const now = Date.now() / 1000;
    const step = Math.floor(now / 30);
    if (now % 30 > 26 || step <= used) {
      await new Promise((r) => setTimeout(r, (30 - (now % 30) + 1) * 1000));
      continue;
    }
    if (stepFile) {
      mkdirSync(dirname(stepFile), { recursive: true });
      writeFileSync(stepFile, String(step));
    }
    return totp(secret);
  }
}

/**
 * After the password step: finish whichever authenticator screen is showing.
 * Returns without doing anything when neither appears (the sign-in landed).
 */
export async function completeAuthenticator(
  page: Page,
  email: string,
): Promise<'done' | 'rate-limited'> {
  const code = page.locator('#totp-code');
  const limited = page.getByText(/too many attempts/i);
  const seen = await Promise.race([
    code.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'code' as const),
    limited.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'limited' as const),
  ]).catch(() => 'none' as const);
  // The authenticator step is rate limited, rightly: the caller waits it out.
  if (seen === 'limited') return 'rate-limited';
  if (seen === 'none') return 'done';

  const shown = page.getByTestId('totp-secret');
  let secret: string;
  if (await shown.isVisible()) {
    // Enrolment: the key is on screen, exactly as for a person who cannot scan.
    secret = ((await shown.textContent()) ?? '').replace(/\s+/g, '');
    mkdirSync(dirname(secretFile(email)), { recursive: true });
    writeFileSync(secretFile(email), secret, { mode: 0o600 });
  } else {
    if (!existsSync(secretFile(email))) {
      throw new Error(
        `${email} is already enrolled and no key was saved for it. Clear its authenticator ` +
          '(the dev database is unreachable from here), or delete e2e/.auth and re-seed.',
      );
    }
    secret = readFileSync(secretFile(email), 'utf8').trim();
  }
  await code.fill(await freshCode(secret, email));
  await page.getByRole('button', { name: /verify/i }).click();
  return (await limited
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false))
    ? 'rate-limited'
    : 'done';
}

/**
 * The same second factor for an API-only session (`adminApiSession`): answer the
 * challenge `POST /admin/auth/login` returned — enrolling when it says
 * `totp_setup`, else a code from the saved key. Cookies land in `request`.
 */
export async function completeAuthenticatorApi(
  request: APIRequestContext,
  apiBase: string,
  origin: string,
  email: string,
  login: { step?: 'totp' | 'totp_setup'; challengeToken?: string },
): Promise<void> {
  if (!login.challengeToken) return;
  const headers = { Origin: origin };
  const challengeToken = login.challengeToken;
  let secret: string;
  if (login.step === 'totp_setup') {
    const setup = await request.post(`${apiBase}/admin/auth/totp/setup`, {
      headers,
      data: { challengeToken },
    });
    if (!setup.ok()) throw new Error(`authenticator setup answered ${setup.status()}`);
    secret = ((await setup.json()) as { secret: string }).secret;
    mkdirSync(dirname(secretFile(email)), { recursive: true });
    writeFileSync(secretFile(email), secret, { mode: 0o600 });
  } else {
    if (!existsSync(secretFile(email))) {
      throw new Error(`${email} is already enrolled and no key was saved for it.`);
    }
    secret = readFileSync(secretFile(email), 'utf8').trim();
  }
  for (let attempt = 0; ; attempt += 1) {
    const verify = await request.post(`${apiBase}/admin/auth/totp/verify`, {
      headers,
      data: { challengeToken, code: await freshCode(secret, email) },
    });
    // The code check is rate limited, rightly; WAIT the cap out, never weaken it.
    if (verify.status() === 429 && attempt < 3) {
      const after = Number(verify.headers()['retry-after'] ?? '60');
      await new Promise((r) => setTimeout(r, (Number.isFinite(after) ? after + 1 : 61) * 1000));
      continue;
    }
    if (!verify.ok()) {
      throw new Error(`authenticator code answered ${verify.status()}: ${await verify.text()}`);
    }
    break;
  }
}
