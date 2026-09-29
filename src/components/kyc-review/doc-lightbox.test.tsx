import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocLightbox, type LightboxDoc } from './doc-lightbox';

/**
 * The document viewer a reviewer actually decides from.
 *
 * The review screen shows each document in a fixed box, which is a thumbnail
 * whatever the object-fit: nobody can check a passport number or a utility
 * bill's date at 220px. Before this existed the only way to see one properly was
 * to open its raw URL in another tab, losing the rest of the submission.
 *
 * What is pinned here is what makes the tool usable rather than what it looks
 * like: that the controls exist, that rotation is available (nothing anywhere in
 * the pipeline corrects orientation, so this is the last chance to turn a
 * sideways ID before it is rejected as unreadable), and that paging resets the
 * view — landing on a new document already zoomed into a corner is worse than
 * not zooming at all.
 */

const DOCS: LightboxDoc[] = [
  { filePath: 'uploads/kyc/a.png', label: 'Passport' },
  { filePath: 'uploads/kyc/b.png', label: 'Selfie' },
  { filePath: 'uploads/kyc/c.pdf', label: 'Proof of address' },
];

function renderLightbox(index = 0) {
  const onClose = vi.fn();
  const onNavigate = vi.fn();
  render(<DocLightbox docs={DOCS} index={index} onClose={onClose} onNavigate={onNavigate} />);
  return { onClose, onNavigate };
}

describe('DocLightbox', () => {
  it('shows the document under what it IS — the client’s filename is not kept (D-84)', () => {
    renderLightbox();

    expect(screen.getByRole('dialog', { name: 'Passport' })).toBeInTheDocument();
  });

  it('offers zoom and rotate, which the fixed-size tile could not', () => {
    renderLightbox();

    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rotate/i })).toBeInTheDocument();
  });

  it('starts at 100% and cannot zoom out below it', () => {
    // Below 1:1 there is nothing to see that the tile did not already show.
    renderLightbox();

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeDisabled();
  });

  it('zooms in when asked', async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(screen.getByRole('button', { name: /zoom in/i }));

    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('RESETS the view when moving to another document', async () => {
    // Paging while zoomed used to be the obvious trap: the next document opens
    // scaled and offset, showing a corner of something never seen whole.
    const user = userEvent.setup();
    const { onNavigate } = renderLightbox();

    await user.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.getByText('150%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next document/i }));

    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('wraps around rather than dead-ending at the last document', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderLightbox(DOCS.length - 1);

    await user.click(screen.getByRole('button', { name: /next document/i }));

    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderLightbox();

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not offer zoom or rotate for a PDF', () => {
    // Those belong to the browser's PDF viewer; faking them here would be worse
    // than handing it over.
    renderLightbox(2);

    expect(screen.getByRole('button', { name: /zoom in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rotate/i })).toBeDisabled();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'http://localhost:3001/v1/uploads/kyc/c.pdf',
    );
  });

  it('renders nothing rather than throwing when the index is out of range', () => {
    // Defensive: `documents-of` drops absent files, so the list can shrink
    // between renders.
    const { container } = render(
      <DocLightbox docs={[]} index={0} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
