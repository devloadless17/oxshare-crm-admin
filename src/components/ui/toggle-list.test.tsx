import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleList } from './toggle-list';

const OPTIONS = [
  { value: 'client.email', label: 'Email address', hint: 'client.email' },
  { value: 'client.phone', label: 'Phone number', hint: 'client.phone' },
];

describe('ToggleList', () => {
  it('reports the selection state to assistive technology', () => {
    // `aria-pressed` rather than a visual tick alone: this control configures
    // who can see client PII, and a screen-reader user has to be able to tell
    // what is currently on.
    render(<ToggleList options={OPTIONS} selected={['client.email']} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /email address/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /phone number/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('emits the value on click', async () => {
    const onToggle = vi.fn();
    render(<ToggleList options={OPTIONS} selected={[]} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /phone number/i }));
    expect(onToggle).toHaveBeenCalledWith('client.phone');
  });

  it('emits on a SECOND click too, so the parent owns the toggle', async () => {
    // The component is controlled. Swallowing the deselect here would make
    // un-hiding a field impossible while looking like it worked.
    const onToggle = vi.fn();
    render(<ToggleList options={OPTIONS} selected={['client.phone']} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /phone number/i }));
    expect(onToggle).toHaveBeenCalledWith('client.phone');
  });

  it('blocks the click when the whole list is disabled', async () => {
    const onToggle = vi.fn();
    render(<ToggleList options={OPTIONS} selected={[]} onToggle={onToggle} disabled />);

    await userEvent.click(screen.getByRole('button', { name: /email address/i }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('disables ONE option and SAYS WHY', async () => {
    /*
     * The reason is the point of the prop.
     *
     * On both RBAC screens an option can be unavailable for a reason the
     * operator needs — a field the catalog says cannot be hidden, a tag outside
     * the acting admin's own scope. A greyed-out row with no explanation reads
     * as a bug, and the next thing that happens is a message asking why the
     * screen is broken.
     */
    const onToggle = vi.fn();
    render(
      <ToggleList
        options={[
          { value: 'client.email', label: 'Email address', hint: 'client.email' },
          {
            value: 'client.status',
            label: 'Account status',
            disabledReason: 'Suspend decisions are made from it.',
          },
        ]}
        selected={[]}
        onToggle={onToggle}
      />,
    );

    const locked = screen.getByRole('button', { name: /account status/i });
    expect(locked).toBeDisabled();
    expect(screen.getByText(/suspend decisions are made from it/i)).toBeInTheDocument();

    await userEvent.click(locked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('says something when there is nothing to choose from', () => {
    // An empty grid reads as a failed load. On the tag-scope panel "there are
    // no tags yet" is a real and common state, and it needs to say so.
    render(
      <ToggleList
        options={[]}
        selected={[]}
        onToggle={vi.fn()}
        emptyMessage="No tags created yet."
      />,
    );
    expect(screen.getByText('No tags created yet.')).toBeInTheDocument();
  });
});
