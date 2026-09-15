import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UrlSearchInput } from './url-search-input';

/**
 * THE SEARCH BOX KEEPS WHAT YOU TYPE.
 *
 * Reported twice by the owner, in the same words both times: *"I am not able to
 * type normally in the search input."* A raw `<input value={url.get('q')}>`
 * writes the URL on every keystroke through `router.replace`, which is
 * asynchronous — so the re-render arrives holding the PREVIOUS value, React
 * re-applies it to a controlled input, and the character is gone.
 *
 * `/clients` fixed it privately and five later screens copied the broken shape.
 * This asserts the behaviour of the shared component that replaced them, so the
 * fix cannot be un-learned a third time.
 */
describe('UrlSearchInput', () => {
  const props = { label: 'Search client', placeholder: 'Search by name' };

  it('keeps the WHOLE term as it is typed, not a subset of the keystrokes', async () => {
    const onChange = vi.fn();
    render(<UrlSearchInput value="" onChange={onChange} {...props} />);

    // Nine characters, each its own round trip under the broken wiring.
    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');

    // The half the operator sees: their own text, intact, while typing.
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');
  });

  it('writes the URL ONCE, after the typing stops', async () => {
    // The other half of why the box is debounced: nine keystrokes were nine
    // router writes and nine requests.
    const onChange = vi.fn();
    render(<UrlSearchInput value="" onChange={onChange} {...props} delayMs={50} />);

    await userEvent.type(screen.getByRole('searchbox'), 'alexandra');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('alexandra'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('accepts a value the operator did not type — Clear, Back, a shared link', async () => {
    const { rerender } = render(<UrlSearchInput value="alexandra" onChange={vi.fn()} {...props} />);
    expect(screen.getByRole('searchbox')).toHaveValue('alexandra');

    // "Clear filters" empties the URL; the box has to follow.
    rerender(<UrlSearchInput value="" onChange={vi.fn()} {...props} />);
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''));
  });

  it('does not fight the operator mid-word when its own write comes back', async () => {
    /*
     * The subtle half. The debounced write lands in the URL, the parent
     * re-renders with that value, and a naive sync effect would then re-set the
     * input — discarding anything typed in between. The component compares
     * against the last value IT wrote, so a bounce-back is a no-op.
     */
    const onChange = vi.fn();
    const { rerender } = render(
      <UrlSearchInput value="" onChange={onChange} {...props} delayMs={20} />,
    );
    const box = screen.getByRole('searchbox');

    await userEvent.type(box, 'alex');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('alex'));

    // The URL now says 'alex' — the box's own write coming back.
    rerender(<UrlSearchInput value="alex" onChange={onChange} {...props} delayMs={20} />);
    await userEvent.type(box, 'andra');

    expect(box).toHaveValue('alexandra');
  });
});
