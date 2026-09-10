import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ClientNetworkTree } from './client-network-tree';
import type { ClientProfile } from '@/lib/api/admin';
import { ALL_PERMISSIONS } from '@/test/permissions';

/**
 * THE CAP, AND THE ONLY THING THAT MAKES IT HONEST.
 *
 * `GET /admin/clients/:id` returns at most one screen of referred clients. Until
 * 11 Sep this component rendered that page and said nothing, so a partner with
 * two hundred referrals was indistinguishable from one with exactly fifty — and
 * the constant's own justification, *"the full book stays reachable through the
 * client list filtered by referrer"*, named a filter that existed nowhere in the
 * product.
 *
 * Both halves are true now. These pin the half that is this component's:
 *
 *   - the total comes from `referredTotal`, NEVER from the array's length,
 *     which is the count of what fitted. `IbOverviewDto` forbids that read by
 *     name — "a screen showing a total must read THIS" — and this screen was
 *     doing the forbidden thing by omission
 *   - a complete list says NOTHING, because a notice on every list teaches an
 *     operator to ignore it on the one that is capped
 *   - an absent total is "not stated", never "none"
 */
vi.mock('@/lib/api', () => {
  const api = { admin: { getPartnerDetail: vi.fn(), getClient: vi.fn() } };
  return { api, default: api };
});

/*
 * An identity is required, not scenery. `PermittedLink` renders a plain span
 * rather than a link for an operator who cannot reach the destination — that is
 * the whole reason it exists, so rows stop offering half the console a link
 * that lands on "no access". Without a mocked admin `useAdmin()` gives none, the
 * link is correctly withheld, and the case fails looking like a missing link
 * rather than a missing viewer.
 */
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      /*
       * The REAL list. A mocked admin holding `['*']` reaches NOTHING —
       * `hasPermission` matches keys exactly, `PermittedLink` then renders a
       * span instead of an anchor, and the case fails looking like a missing
       * link rather than a viewer with no permissions.
       *
       * ⚠️ THE WILDCARD DOES NOT EXIST, ANYWHERE, AND HAS NOT SINCE 0044.
       * `seed.ts:121` issues `ALL_PERMISSIONS` — real keys — and no guard
       * carries a `'*'` branch. So exact matching is not a gap the seed papers
       * over; it is correct, because nothing issues a wildcard to expand.
       *
       * It is written down here because of where the `['*']` in the first draft
       * of this file came FROM: the root `CLAUDE.md` still describes the seeded
       * admin as "(`master_admin`, permissions `["*"]`)", and both halves are
       * dead — `admin.guard.ts:39` says `admins.role` is read by no guard, no
       * service and no screen after 0044, and the wildcard went with it. A
       * document that every session loads produced a test double copied from
       * the DOCUMENT rather than the CODE, and the double then failed for a
       * reason that looked like a product defect.
       */
      permissions: ALL_PERMISSIONS,
      createdAt: new Date().toISOString(),
    },
    isLoading: false,
  }),
}));

type Referred = NonNullable<ClientProfile['referredClients']>;

const someClients = (n: number): Referred =>
  Array.from({ length: n }, (_, i) => ({
    clientUserId: `client-${i}`,
    firstName: 'Ada',
    lastName: `Number${i}`,
  })) as Referred;

function renderTree(props: Partial<React.ComponentProps<typeof ClientNetworkTree>> = {}) {
  return renderWithProviders(
    <ClientNetworkTree
      rootUserId="partner-1"
      rootName="Grace Hopper"
      partner={null}
      referredClients={someClients(3)}
      {...props}
    />,
  );
}

describe('the referral network tree', () => {
  it('says how many of how many when the list is CAPPED, and links to the rest', () => {
    renderTree({ referredClients: someClients(50), referredShown: 50, referredTotal: 213 });

    expect(screen.getByText(/showing 50 of 213/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /see all of them/i });
    // The link is what makes the cap honest rather than merely stated: before
    // this filter existed there was nowhere for it to point.
    expect(link).toHaveAttribute('href', '/clients?referredBy=partner-1');
  });

  it('says NOTHING when the list is complete', () => {
    /*
     * The half that is easy to skip, and the one that keeps the notice worth
     * reading. A cap notice on a complete list is noise, and noise on every
     * profile is how an operator learns to skip the line that matters.
     */
    renderTree({ referredClients: someClients(3), referredShown: 3, referredTotal: 3 });

    expect(screen.queryByText(/showing 3 of 3/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /see all of them/i })).not.toBeInTheDocument();
  });

  it('says nothing when the total is ABSENT — that is "not stated", not "none"', () => {
    // `referredTotal` is withheld, not zeroed, from a reader without ib.view.
    // Rendering "0 of 0" for a withheld figure would state a fact nobody sent.
    renderTree({ referredClients: someClients(3) });

    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });

  it('never derives the total from the array it was given', () => {
    /*
     * The mistake this whole change exists to correct, asserted directly: hand
     * it three rows and a total of 213 — a shape the server produces for a
     * scoped reader whose territory holds three of a partner's book — and the
     * number on screen must be the SERVER's, not the array's.
     */
    renderTree({ referredClients: someClients(3), referredShown: 3, referredTotal: 213 });

    expect(screen.getByText(/showing 3 of 213/i)).toBeInTheDocument();
  });
});
