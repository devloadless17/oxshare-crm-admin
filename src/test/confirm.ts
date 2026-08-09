import { screen, within } from '@testing-library/react';

/**
 * Structural, so both calling styles fit: the suites that hold a
 * `userEvent.setup()` instance and the ones that click through the default
 * export. Naming either concrete type would force half the callers to change
 * how they drive events for no reason connected to confirmations.
 */
type Clicker = { click: (element: Element) => Promise<unknown> };

/**
 * Answer the confirmation dialog the way an operator does.
 *
 * ## Why the `window.confirm` spies had to go
 *
 * Thirteen destructive handlers used to be tested by spying on
 * `window.confirm` and stubbing its return value. That spy asserted two things
 * at once — that a question was asked, and that its answer was obeyed — and it
 * asserted them against a function the app no longer calls. `confirm-dialog.tsx`
 * replaced it with a promise and a real `AlertDialog`, so a stubbed
 * `window.confirm` now proves nothing: it is never called, and the dialog it
 * was standing in for is left open and unanswered while the test asserts
 * against a mutation that was never going to fire.
 *
 * Driving the real dialog costs one line at each call site and tests what the
 * operator actually does, including the part `window.confirm` could never
 * cover: that the question names the right row.
 *
 * ## Identified by DOM order, not by label
 *
 * `AlertDialogFooter` renders Cancel first and the action second, and reverses
 * them only visually (`flex-col-reverse`). Matching on text instead would mean
 * every call site repeating its own `confirmLabel` — "Delete tag", "Suspend",
 * "Revoke" — and a test that silently stops answering the dialog the day that
 * wording changes. The dialog has exactly these two buttons; there is no close
 * affordance, deliberately, because dismissing a destructive question must be
 * a decision rather than a stray click.
 *
 * Returns the dialog's full text so a caller can assert on the WORDING — which
 * row, which consequence — without querying for it a second time.
 */
export async function answerConfirm(user: Clicker, answer: 'confirm' | 'cancel'): Promise<string> {
  const dialog = await screen.findByRole('alertdialog');
  const text = dialog.textContent ?? '';

  const buttons = within(dialog).getAllByRole('button');
  const target = answer === 'cancel' ? buttons[0] : buttons[buttons.length - 1];
  if (!target) throw new Error('The confirmation dialog rendered no buttons.');
  await user.click(target);

  return text;
}

/**
 * Assert that no confirmation was asked for.
 *
 * The counterpart to `answerConfirm`, for the actions that must NOT stop and
 * ask — reactivating a suspended client restores access rather than removing
 * it, and a confirmation there trains an operator to click through the ones
 * that matter.
 */
export function expectNoConfirm(): void {
  if (screen.queryByRole('alertdialog') !== null) {
    throw new Error('A confirmation dialog was opened, but none was expected.');
  }
}
