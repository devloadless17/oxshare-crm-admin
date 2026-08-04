import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './modal';

/**
 * Regression test for a dialog that closed itself while you typed.
 *
 * Every caller passes an inline `onClose={() => setX(null)}`, so onClose had a new
 * identity on every render. That invalidated useFocusTrap's onKeyDown useCallback,
 * which invalidated its mount effect, so the effect re-ran on EVERY render and
 * re-focused the dialog's first focusable element each time — the Close button.
 *
 * The result: type a space in any modal field and the space activated the
 * now-focused Close button. The dialog vanished and took the input with it. It
 * reproduced on the commission-plan form and the withdrawal reject/settle
 * dialogs, i.e. the money screens.
 *
 * These tests use an inline arrow for onClose ON PURPOSE. Passing a stable
 * useCallback here would hide the very thing being guarded.
 */

function Harness({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Modal
      open={open}
      // Deliberately unstable — this is the shape every real caller uses.
      onClose={() => {
        setOpen(false);
        onClosed?.();
      }}
      title="Edit plan"
    >
      <label htmlFor="plan-name">Plan name</label>
      <input id="plan-name" defaultValue="" />
    </Modal>
  );
}

describe('Modal keyboard behaviour', () => {
  it('survives typing text that contains spaces', async () => {
    const onClosed = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClosed={onClosed} />);

    const input = screen.getByLabelText(/plan name/i);
    await user.type(input, 'Standard IB Plan');

    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(input).toHaveValue('Standard IB Plan');
  });

  it('puts initial focus on the first field, not the Close button', () => {
    render(<Harness />);
    // A user opening a dialog should land in the form. Landing on "Close dialog"
    // is what made the space keystroke destructive in the first place.
    expect(screen.getByLabelText(/plan name/i)).toHaveFocus();
  });

  it('keeps focus in the field across re-renders', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText(/plan name/i);
    await user.type(input, 'abc');

    // Before the fix, the mount effect re-ran on every keystroke and stole this.
    expect(input).toHaveFocus();
  });

  it('still closes on Escape', async () => {
    const onClosed = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClosed={onClosed} />);

    await user.keyboard('{Escape}');

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('still closes on the Close button', async () => {
    const onClosed = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClosed={onClosed} />);

    await user.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
