import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ClientNetworkTree } from './client-network-tree';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
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
    clientUserId: 1000100 + i,
    clientPortalId: 1000100 + i,
    firstName: 'Ada',
    lastName: `Number${i}`,
  })) as Referred;

function renderTree(props: Partial<React.ComponentProps<typeof ClientNetworkTree>> = {}) {
  return renderWithProviders(
    <ClientNetworkTree
      rootUserId="partner-1"
      rootPortalId={1000001}
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
    // By Portal ID — an address bar is on screen too, and the uuid is on none.
    expect(link).toHaveAttribute('href', '/clients?referredBy=1000001');
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

describe('referrals outside the reader’s territory', () => {
  /*
   * Reported from production by an administrator with scoped tags: a partner's
   * Network tab showed nobody, and read as "this client introduced no one".
   *
   * Every count on this tab is scoped to the reader's territory, which is right
   * for "50 of 213" over a list of 50 — and wrong for zero, because "none" and
   * "none that are yours" are opposite facts about a partner. An operator acts
   * on the first: chasing them for inactivity, or approving on the belief they
   * have no book.
   */
  it('says how many are outside the territory when the visible list is EMPTY', () => {
    renderTree({
      referredClients: [],
      referredShown: 0,
      referredTotal: 0,
      referredOutsideScope: 7,
    });

    expect(
      screen.getByText(/7 more clients introduced by this partner are outside your territory/i),
      'an empty tab claimed the partner had introduced nobody',
    ).toBeInTheDocument();
  });

  it('says it alongside a partial list too', () => {
    renderTree({
      referredClients: someClients(3),
      referredShown: 3,
      referredTotal: 3,
      referredOutsideScope: 2,
    });
    expect(
      screen.getByText(/2 more clients introduced by this partner are outside your territory/i),
    ).toBeInTheDocument();
  });

  it('says NOTHING for an unrestricted reader, who is outside nothing', () => {
    renderTree({
      referredClients: someClients(3),
      referredShown: 3,
      referredTotal: 3,
      referredOutsideScope: 0,
    });
    expect(screen.queryByText(/outside your territory/i)).not.toBeInTheDocument();
  });

  it('says nothing when the count is absent, which means "not stated" and not "none"', () => {
    renderTree({ referredClients: someClients(3), referredShown: 3, referredTotal: 3 });
    expect(screen.queryByText(/outside your territory/i)).not.toBeInTheDocument();
  });

  it('never names anyone the reader may not see', () => {
    /*
     * The whole disclosure is a NUMBER. If this ever renders a name, an email or
     * an id from outside the territory, the scope check has been undone by the
     * screen that was meant to respect it.
     */
    renderTree({
      referredClients: [],
      referredShown: 0,
      referredTotal: 0,
      referredOutsideScope: 7,
    });
    const notice = screen.getByText(/outside your territory/i);
    expect(notice.textContent).not.toMatch(/@/);
  });
});

describe('one row per person (owner, 26 Sep 2026)', () => {
  it('draws a client who is also a sub-partner once — as the partner', () => {
    /*
     * Reported: Cyrine was introduced by Bassam AND placed under him as a
     * partner, and the tree listed her twice — a leaf and a branch.
     */
    const clients = someClients(2);
    const partner = {
      level: 2,
      directPartners: [
        {
          userId: 1000101,
          portalId: 1000101,
          firstName: 'Ada',
          lastName: 'Number1',
          email: 'ada1@example.com',
          level: 3,
          active: true,
          referralCode: 'SUBCODE1',
        },
      ],
    } as unknown as IbPartnerDetail;

    renderTree({ referredClients: clients, partner });

    expect(screen.getAllByText('Ada Number1')).toHaveLength(1);
    // …as the expandable partner node, not the leaf.
    expect(screen.getByRole('button', { name: /Ada Number1/ })).toBeInTheDocument();
    expect(screen.getByText('Ada Number0')).toBeInTheDocument();
  });
});

describe('sub-partners outside the reader’s territory — a count, never who (R2)', () => {
  it('counts hidden sub-partners instead of claiming nobody is beneath them', () => {
    const partner = {
      level: 1,
      directPartners: [],
      directPartnersOutsideScope: 2,
    } as unknown as IbPartnerDetail;
    renderTree({ referredClients: [], partner });

    expect(
      screen.getByText(/2 sub-partners beneath this partner are outside your territory/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/nobody beneath them/i)).not.toBeInTheDocument();
  });

  it('never says "nobody" above a count of hidden referrals', () => {
    renderTree({ referredClients: [], referredOutsideScope: 4 });
    expect(screen.getByText(/4 more clients introduced/i)).toBeInTheDocument();
    expect(screen.queryByText(/nobody beneath them/i)).not.toBeInTheDocument();
  });
});
