import { describe, expect, it } from 'vitest';
import { canAccess } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { t } from '@/lib/i18n';
import type { AdminNotification } from '@/lib/api/admin-notifications';
import { CATEGORIES, KIND_DISPLAY, lookOf, outcomeOf, pathOf } from './catalogue';

/**
 * The admin bell's catalogue — the one place a task becomes words and a link.
 *
 * `KIND_DISPLAY` is keyed by the backend's enum, so a missing kind is a compile
 * error already; what these add is what the types cannot see: that every link
 * lands on a screen that exists and names the client by Portal ID (never the
 * uuid — 0133), that a missing Portal ID degrades to the unfiltered list rather
 * than `?q=`, and that the outcome words follow the category.
 */

const SUBJECT_UUID = '6f1c0000-0000-4000-8000-00000000abcd';
const admin = {
  id: 'a-1',
  email: 'admin@oxshare.com',
  name: 'Admin',
  role: 'master_admin',
  permissions: ALL_PERMISSIONS,
  createdAt: new Date().toISOString(),
} as unknown as Parameters<typeof canAccess>[0];

const facts = (portalId: number | null, params: Record<string, unknown> = {}) => ({
  params: {
    transactionId: SUBJECT_UUID,
    userId: SUBJECT_UUID,
    amount: '10.00000000',
    currency: 'USD',
    ...params,
  },
  client: { portalId },
});

const row = (over: Partial<AdminNotification>): AdminNotification => ({
  id: 'n',
  kind: 'admin.withdrawal.requested',
  category: 'withdrawals',
  params: {},
  readAt: null,
  createdAt: new Date().toISOString(),
  subject: { kind: 'transaction', id: SUBJECT_UUID },
  client: { portalId: 1000245 },
  resolution: null,
  ...over,
});

describe('every task links somewhere real, by Portal ID', () => {
  for (const [kind, display] of Object.entries(KIND_DISPLAY)) {
    it(`${kind} lands on a screen that exists, filtered to #1000245`, () => {
      const href = display.href(facts(1000245));
      expect(href.startsWith('/')).toBe(true);
      expect(canAccess(admin, pathOf(href)), `${href} is no route`).toBe(true);
      expect(href).toContain('1000245');
      expect(href, 'a uuid in a link the operator can see').not.toContain(SUBJECT_UUID);
    });

    it(`${kind} degrades to the unfiltered list without a Portal ID`, () => {
      const href = display.href(facts(null));
      expect(href).not.toMatch(/[?&](q|userId)=(&|$)/);
      expect(href).not.toContain('null');
    });

    it(`${kind} has copy for its title and detail — no placeholder residue`, () => {
      expect(t(display.titleKey)).not.toBe(display.titleKey);
      const body = display.body(facts(1000245, { reason: 'reversed', credited: true }));
      const text = t(body.key, body.vars);
      expect(text).not.toBe(body.key);
      expect(text).not.toContain('{');
    });
  }
});

describe('categories and looks', () => {
  it('gives every category an icon and a tone', () => {
    for (const [category, look] of Object.entries(CATEGORIES)) {
      expect(look.icon, `${category} has no icon`).toBeTruthy();
      expect(look.tone, `${category} has no tone`).toMatch(/^bg-/);
    }
  });

  it('draws a money exception with the alert look, not its category’s', () => {
    expect(lookOf(row({ kind: 'admin.deposit.attention', category: 'deposits' })).tone).toContain(
      'destructive',
    );
    expect(lookOf(row({ kind: 'admin.deposit.submitted', category: 'deposits' })).tone).toContain(
      'success',
    );
  });
});

describe('how a handled task says it ended', () => {
  const ended = (category: AdminNotification['category'], outcome: string) =>
    t(outcomeOf(row({ category, resolution: { at: new Date().toISOString(), outcome } })).labelKey);

  it('says "Needs action" while nobody has handled it', () => {
    expect(t(outcomeOf(row({})).labelKey)).toBe('Needs action');
  });

  it('reads the same state word per subject', () => {
    // `success` is a deposit APPROVED but a withdrawal PAID.
    expect(ended('deposits', 'success')).toBe('Approved');
    expect(ended('withdrawals', 'success')).toBe('Paid');
    // `failure` is a payout CANCELLED, a transfer RELEASED, a deposit FAILED.
    expect(ended('withdrawals', 'failure')).toBe('Cancelled');
    expect(ended('transfers', 'failed')).toBe('Released');
    expect(ended('deposits', 'failure')).toBe('Failed');
  });

  it('never prints a state name it does not know', () => {
    expect(ended('kyc', 'something_new')).toBe('Handled');
  });
});
