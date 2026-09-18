import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ClientTagChips } from './client-tag-chips';

/**
 * ABSENT IS NOT EMPTY.
 *
 * RBAC-03 masking removes a masked key from the response entirely, so a reader
 * whose role masks `client.tags` receives a profile with no `tags` property at
 * all. The prop type said `readonly ClientTag[]` and the component went
 * straight to `tags.length`, so the client detail page threw
 * "Cannot read properties of undefined" and rendered nothing — reported from
 * production as masking a tag breaking the client page for a scoped admin.
 */
describe('ClientTagChips', () => {
  it('does not crash when tags are absent because they are masked', () => {
    expect(() => renderWithProviders(<ClientTagChips tags={undefined} />)).not.toThrow();
  });

  it('says HIDDEN rather than the em dash that means "has none"', () => {
    renderWithProviders(<ClientTagChips tags={undefined} />);
    expect(screen.getByText(/hidden by your permissions/i)).toBeInTheDocument();
  });

  it('still shows the em dash for a client who genuinely has no tags', () => {
    /*
     * The pair that makes the distinction real. Collapsing the two would tell a
     * scoped operator that an untagged client is one they are not cleared for,
     * or the reverse — and both mislead somebody who is deciding something.
     */
    renderWithProviders(<ClientTagChips tags={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/hidden by your permissions/i)).not.toBeInTheDocument();
  });

  it('renders the tags it is given', () => {
    const tag = { id: 't1', slug: 'vip', label: 'VIP', createdAt: '2026-09-18T00:00:00.000Z' };
    renderWithProviders(<ClientTagChips tags={[tag]} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});
