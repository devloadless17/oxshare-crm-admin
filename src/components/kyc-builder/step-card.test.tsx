import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
const step = (overrides: Partial<KycStepConfig> = {}): KycStepConfig =>
  ({
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
