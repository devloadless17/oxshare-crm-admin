import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DocumentGroups } from './document-groups';

/**
 * The review's document tiles after a rejection (reported 28 Sep 2026): a
 * returned bill looked exactly like an accepted passport. The tile of a file
 * the reviewer returned says so, in red, and no other tile does.
 */
describe('the document tiles', () => {
  it('says "Returned", in red, on the file the reviewer returned — and only there', () => {
    renderWithProviders(
      <DocumentGroups
        groups={[
          {
            id: 'identity',
            title: 'Identity document',
            docs: [{ filePath: '/uploads/kyc/f.png', fileName: 'f.png', label: 'Passport' }],
          },
          {
            id: 'address',
            title: 'Proof of address',
            docs: [
              {
                filePath: '/uploads/kyc/b.png',
                fileName: 'b.png',
                label: 'Utility Bill',
                returned: true,
              },
            ],
          },
        ]}
        onOpen={vi.fn()}
      />,
    );

    const address = screen.getByTestId('docs-group-address');
    expect(within(address).getByText('Returned')).toHaveClass('text-destructive');
    expect(within(screen.getByTestId('docs-group-identity')).queryByText('Returned')).toBeNull();
  });
});
