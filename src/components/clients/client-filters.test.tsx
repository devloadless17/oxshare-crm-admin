import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ClientFilters } from './client-filters';

/**
 * THE STATUS FILTER OFFERS ONLY STATES A CLIENT CAN ACTUALLY BE IN.
 *
 * `user_status` is an enum of `active | pending | suspended`, the API accepts
 * all three as a filter, and the published contract documents what `pending`
 * means. **No code path produces it.** Registration writes `active`
 * (`auth.service.ts:207`), `setClientStatus` is typed `'active' | 'suspended'`
 * so there is no way in or out, and the only row that ever held it was one seed
 * fixture.
 *
 * Offering it gave an operator a segment that can never have members. An empty
 * result then reads as a fact about CLIENTS — "nobody is pending" — when it is a
 * fact about the PRODUCT: nobody can be. The screen could not tell those apart,
 * and neither could the operator.
 *
 * This is not the "control the API does not back" defect in its usual form — the
 * endpoint would have accepted the filter quite happily. It is the quieter one:
 * a control the DATA cannot back.
 */

const props = {
  values: { q: '', type: '', status: '', tag: '' },
  tags: [],
  canViewTags: true,
  hiddenFilters: [] as string[],
  isFiltered: false,
  onChange: vi.fn(),
  onClear: vi.fn(),
};

/**
 * The status control is a Radix `Select`, so its options live in a PORTAL and
 * exist only once the trigger is opened. Asserting against the closed control
 * would find no options at all and pass the negative case for the wrong reason
 * — which is the shape this whole file is about.
 */
async function openStatusFilter() {
  const user = userEvent.setup();
  renderWithProviders(<ClientFilters {...props} />);
  await user.click(screen.getByLabelText('All account states'));
  return user;
}

describe('the client status filter', () => {
  it('offers the two states a client can reach', async () => {
    await openStatusFilter();

    expect(await screen.findByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Suspended' })).toBeInTheDocument();
  });

  it('does NOT offer `pending`, which nothing can produce', async () => {
    /*
     * The assertion this file exists for — and it is meaningful only because the
     * case above proves the list is open and populated. A closed control offers
     * nothing, which would satisfy this trivially.
     *
     * If a real pending state is ever wired — registration writing it,
     * verification promoting out of it — this SHOULD fail, pointing at the
     * option returning with its transitions rather than ahead of them.
     */
    await openStatusFilter();
    await screen.findByRole('option', { name: 'Active' });

    expect(
      screen.queryByRole('option', { name: 'Pending' }),
      'the filter offers a segment that can never have members — an empty result ' +
        'then reads as "nobody is pending" rather than "nobody can be"',
    ).not.toBeInTheDocument();
  });
});
