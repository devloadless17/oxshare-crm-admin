import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput, formatPhone } from './phone-input';

/**
 * The admin copy of the portal's phone input (owner, 26 Sep 2026) — the
 * portal's own cases, so the two cannot drift, and the reading format the
 * profile shows.
 */
describe('PhoneInput', () => {
  it('reads a WHOLE international number pasted into the box — country and all', async () => {
    // Stripped to digits behind the chosen code, `+961 70 123 456` became
    // `+961 96170123456` and every save was refused (admin e2e, 29 Sep 2026).
    const onChange = vi.fn();
    render(<PhoneInput aria-label="Phone" value="" onChange={onChange} defaultCountryCode="+1" />);
    const input = screen.getByLabelText('Phone');
    await userEvent.click(input);
    await userEvent.paste('+961 70 123 456');

    expect(onChange).toHaveBeenLastCalledWith('+961 70 123 456');
    expect(screen.getByRole('button', { name: /\+961/ })).toBeInTheDocument();
    expect(input).toHaveValue('70 123 456');
  });

  it('keeps a typed + on screen until a dial code fits, then carries on in the number', async () => {
    const onChange = vi.fn();
    render(<PhoneInput aria-label="Phone" value="" onChange={onChange} defaultCountryCode="+1" />);
    const input = screen.getByLabelText('Phone');
    await userEvent.type(input, '+96');
    expect(input).toHaveValue('+96');
    await userEvent.type(input, '1');
    expect(screen.getByRole('button', { name: /\+961/ })).toBeInTheDocument();
    await userEvent.type(input, '70123456');
    expect(onChange).toHaveBeenLastCalledWith('+961 70123456');
  });

  it('shows a saved number that arrives after it mounted', () => {
    const { rerender } = render(<PhoneInput aria-label="Phone" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Phone')).toHaveValue('');

    rerender(<PhoneInput aria-label="Phone" value="+961 70777777" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Phone')).toHaveValue('70777777');
    expect(screen.getByRole('button', { name: /\+961/ })).toBeInTheDocument();
  });

  it('shows a stored E.164 number GROUPED the way it is read', () => {
    // The server keeps one canonical string per number (backend 0139). Shown
    // raw, a client's own number came back from a save as an unbroken run of
    // digits under the cursor.
    render(<PhoneInput aria-label="Phone" value="+96170123456" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Phone')).toHaveValue('70 123 456');
    expect(screen.getByRole('button', { name: /\+961/ })).toBeInTheDocument();
  });

  it('keeps a number typed without grouping exactly as typed', () => {
    render(<PhoneInput aria-label="Phone" value="+961 70777777" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Phone')).toHaveValue('70777777');
  });

  it('does not disturb what the client is typing — its own echo is not an outside change', async () => {
    let value = '';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    const { rerender } = render(
      <PhoneInput aria-label="Phone" value={value} onChange={onChange} />,
    );

    const input = screen.getByLabelText('Phone');
    for (const key of '70 123') {
      await userEvent.type(input, key);
      rerender(<PhoneInput aria-label="Phone" value={value} onChange={onChange} />);
    }

    expect(input).toHaveValue('70 123');
    expect(value).toBe('+961 70 123');
  });

  it('reads the most specific dial code — +1684 is American Samoa, not +1', () => {
    render(<PhoneInput aria-label="Phone" value="+1684 633 1234" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /\+1684/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveValue('633 1234');
  });

  it('names the country button by its country, for a screen reader', () => {
    render(<PhoneInput aria-label="Phone" value="+96170123456" onChange={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Country code — Lebanon (+961)' }),
    ).toBeInTheDocument();
  });
});

describe('formatPhone', () => {
  it('groups a stored E.164 number, and leaves anything else as it is', () => {
    expect(formatPhone('+96170123456')).toBe('+961 70 123 456');
    expect(formatPhone('not a number')).toBe('not a number');
    expect(formatPhone(null)).toBe('');
  });
});
