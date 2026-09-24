import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { StepCard } from './step-card';
import type { components } from '@/lib/api/types.gen';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * THE LAST STEP CANNOT BE DELETED — and this is NOT the rule the owner retired.
 *
 * The retired rule (15 Aug 2026) pinned WHICH four steps were undeletable —
 * `personal`, `document`, `selfie`, `address` — and it refused deletions an
 * operator legitimately wanted; a KYC flow sold as configurable that cannot drop
 * four of its steps is not configurable. That rule is gone and `kyc-builder.spec.ts`
 * asserts a once-mandatory step CAN be removed.
 *
 * This refuses only the deletion that leaves NOTHING behind. Zero steps is not a
 * configuration anyone could choose; it is the absence of one, and no client can
 * ever verify again.
 *
 * ## Why it is guarded here at all
 *
 * `PUT /admin/kyc-config` answered **200** to `{ steps: [] }` and left zero steps —
 * a full replace, DELETE-then-conditionally-insert, so an empty array deleted
 * everything and inserted nothing. It was reachable by CLICKING: four ordinary
 * deletions, each behind its own confirm dialog, then Save, then a success toast,
 * and onboarding was gone for every client in the database.
 */
const step = (overrides: Partial<KycStepConfig> = {}): KycStepConfig => ({
  id: 'step-1',
  stepNumber: 1,
  slug: 'personal',
  title: 'Personal Information',
  description: 'Legal identity details.',
  icon: 'User',
  enabled: true,
  fields: [],
  ...overrides,
});

const noop = vi.fn();
const props = {
  index: 0,
  onMove: noop,
  onToggleEnabled: noop,
  onDelete: noop,
  onPatch: noop,
  onAddField: noop,
  onPatchField: noop,
  onRemoveField: noop,
  onReorderFields: noop,
};

describe('StepCard delete control', () => {
  it('refuses to delete the ONLY remaining step, and says why', () => {
    renderWithProviders(<StepCard {...props} step={step()} total={1} />);

    const remove = screen.getByRole('button', { name: /only step left/i });
    expect(remove).toBeDisabled();
    /*
     * The reason is on the control, not only in a toast after the click. A
     * disabled button with no explanation is indistinguishable from a broken
     * one, and the operator's next move is to report it.
     */
    expect(remove).toHaveAccessibleName(/cannot verify anyone/i);
  });

  it('allows deleting a step when others remain — including a once-mandatory one', () => {
    // The positive control. Without it, "the delete button is disabled" would be
    // satisfied by a screen that had lost the ability to delete anything at all,
    // which is the rule the owner deliberately removed.
    renderWithProviders(<StepCard {...props} step={step()} total={4} />);

    const remove = screen.getByRole('button', { name: /delete step personal information/i });
    expect(remove).toBeEnabled();
  });
});

describe('StepCard offers each step only what it can store', () => {
  /*
   * Reported from local testing: a passport on a step the broker added, with no
   * home for its pages, and a File field on Proof of Address marked required that
   * blocked nothing. The server refuses both on save; the builder no longer
   * offers them, and says what each step is for.
   */
  const catalogue = [
    { value: 'passport', label: 'Passport', category: 'identity' as const, parts: [] },
    { value: 'utility_bill', label: 'Utility Bill', category: 'address' as const, parts: [] },
  ];
  const field = (type: string) => ({
    id: 'f-1',
    name: 'customField_1',
    label: 'Upload',
    type: type as KycStepConfig['fields'][number]['type'],
    required: true,
  });
  const optionsOf = async (s: KycStepConfig) => {
    const user = userEvent.setup();
    renderWithProviders(<StepCard {...props} step={s} total={2} catalogue={catalogue} />);
    await user.click(screen.getByRole('combobox', { name: /input type/i }));
    const list = await screen.findByRole('listbox');
    return within(list)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
  };

  it('an added step offers uploads but no document — and says where documents go', async () => {
    const options = await optionsOf(
      step({ slug: 'source-of-funds', title: 'Source of funds', fields: [field('file')] }),
    );
    expect(options.some((o) => /file uploader/i.test(o))).toBe(true);
    expect(options.some((o) => /passport|utility bill/i.test(o))).toBe(false);
    expect(
      screen.getByText(/belong on the Identity Document and Proof of Address steps/i),
    ).toBeInTheDocument();
  });

  it('Proof of Address offers its own documents AND every plain type — questions and uploads too', async () => {
    const options = await optionsOf(
      step({ slug: 'address', title: 'Proof of Address', fields: [field('doc:utility_bill')] }),
    );
    expect(options.some((o) => /utility bill/i.test(o))).toBe(true);
    expect(options.some((o) => /file uploader/i.test(o))).toBe(true);
    expect(options.some((o) => /passport/i.test(o))).toBe(false);
    expect(screen.getByText(/any question or upload you add is asked too/i)).toBeInTheDocument();
  });

  it('will not remove the last document on a document step, and says why', () => {
    renderWithProviders(
      <StepCard
        {...props}
        step={step({
          slug: 'address',
          title: 'Proof of Address',
          fields: [field('doc:utility_bill')],
        })}
        total={2}
        catalogue={catalogue}
      />,
    );
    expect(screen.getByRole('button', { name: /at least one document/i })).toBeDisabled();
  });

  it('offers CHOICES on a checkbox — none is a single tick box, some make it "tick all that apply"', () => {
    renderWithProviders(
      <StepCard {...props} step={step({ slug: 'extra', fields: [field('checkbox')] })} total={2} />,
    );
    expect(screen.getByLabelText(/choices \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/a single tick box/i)).toBeInTheDocument();
  });

  it('shows no "Required" on a document — the step requires the chosen one, and nothing reads the flag', () => {
    renderWithProviders(
      <StepCard
        {...props}
        step={step({
          slug: 'address',
          title: 'Proof of Address',
          fields: [field('doc:utility_bill')],
        })}
        total={2}
        catalogue={catalogue}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /required/i })).not.toBeInTheDocument();
    expect(screen.getByText(/client picks one document/i)).toBeInTheDocument();
  });

  it('keeps "Required" on a field whose flag the server enforces', () => {
    renderWithProviders(
      <StepCard {...props} step={step({ slug: 'extra', fields: [field('file')] })} total={2} />,
    );
    expect(screen.getByRole('checkbox', { name: /required/i })).toBeChecked();
  });
});
