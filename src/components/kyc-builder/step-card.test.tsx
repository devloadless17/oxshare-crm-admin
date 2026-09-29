import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { StepCard, type KycStepConfig } from './step-card';
import type { KycDocumentType, KycFieldConfig } from './field-editor';

/**
 * A step shown as what it IS (the identity core, 26 Sep 2026): the platform's
 * parts locked, the broker's parts theirs.
 */

const identity = (name: string, label: string, required = true): KycFieldConfig => ({
  id: `f-${name}`,
  name,
  label,
  type: 'text',
  required,
  system: true,
});

const PERSONAL: KycStepConfig = {
  id: 'step-1',
  stepNumber: 1,
  slug: 'personal',
  title: 'Personal Information',
  description: 'Legal identity details.',
  icon: 'User',
  enabled: true,
  core: true,
  alwaysOn: true,
  fields: [
    identity('firstName', 'First Name'),
    identity('city', 'City'),
    identity('postalCode', 'Postal / ZIP code', false),
    { id: 'q-1', name: 'customField_1', label: 'Occupation', type: 'text', required: true },
  ],
};

const CATALOGUE: KycDocumentType[] = [
  {
    value: 'passport',
    label: 'Passport',
    category: 'identity',
    parts: [{ key: 'front', label: 'Photo Page', required: true }],
  },
  {
    value: 'national_id',
    label: 'National ID',
    category: 'identity',
    parts: [
      { key: 'front', label: 'Front Side', required: true },
      { key: 'back', label: 'Back Side', required: true },
    ],
  },
  {
    value: 'utility_bill',
    label: 'Utility Bill',
    category: 'address',
    parts: [{ key: 'front', label: 'The Bill', required: true }],
  },
];

const handlers = () => ({
  onToggleEnabled: vi.fn(),
  onDelete: vi.fn(),
  onPatch: vi.fn(),
  onAddField: vi.fn(),
  onPatchField: vi.fn(),
  onRemoveField: vi.fn(),
  onReorderFields: vi.fn(),
});

describe('Personal Information', () => {
  it('gives each identity detail a required switch and a remove — never a name box (Phase 2)', async () => {
    const on = handlers();
    renderWithProviders(<StepCard step={PERSONAL} canDelete catalogue={CATALOGUE} {...on} />);
    expect(screen.getByRole('checkbox', { name: /first name is required/i })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /postal \/ zip code is required/i }),
    ).not.toBeChecked();
    expect(screen.queryByDisplayValue('First Name')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /first name is required/i }));
    expect(on.onPatchField).toHaveBeenCalledWith('f-firstName', { required: false });
    await user.click(screen.getByRole('button', { name: /stop asking for city/i }));
    expect(on.onRemoveField).toHaveBeenCalledWith('f-city');
  });

  it('can be switched off and retitled, and still not deleted', () => {
    renderWithProviders(
      <StepCard step={PERSONAL} canDelete catalogue={CATALOGUE} {...handlers()} />,
    );
    expect(screen.getByRole('button', { name: /^disable$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/step title/i)).toHaveValue('Personal Information');
    expect(screen.queryByRole('button', { name: /delete step/i })).toBeNull();
  });

  it('edits the broker’s own questions beside the details, and adds one', async () => {
    const on = handlers();
    renderWithProviders(<StepCard step={PERSONAL} canDelete catalogue={CATALOGUE} {...on} />);
    expect(screen.getByDisplayValue('Occupation')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /add field/i }));
    expect(on.onAddField).toHaveBeenCalled();
  });

  it('puts the server’s refusal under the field it is about', () => {
    renderWithProviders(
      <StepCard
        step={PERSONAL}
        canDelete
        catalogue={CATALOGUE}
        refusal={{ fields: { 'q-1': 'Already collected by the platform (First Name).' } }}
        {...handlers()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/already collected/i);
    expect(screen.getByDisplayValue('Occupation')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Identity Document', () => {
  const DOCUMENT: KycStepConfig = {
    id: 'step-2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    description: '',
    icon: 'FileText',
    enabled: true,
    core: true,
    alwaysOn: true,
    fields: [
      {
        id: 'f-doc-passport',
        name: 'passport',
        label: 'Passport',
        type: 'doc:passport',
        required: false,
      },
    ],
  };

  it('is a checklist of the catalogue’s identity documents, never an address one', () => {
    renderWithProviders(
      <StepCard step={DOCUMENT} canDelete catalogue={CATALOGUE} {...handlers()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'National ID' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Utility Bill' })).toBeNull();
  });

  it('keeps the last document ticked — a step with none could not be completed', () => {
    renderWithProviders(
      <StepCard step={DOCUMENT} canDelete catalogue={CATALOGUE} {...handlers()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeDisabled();
  });

  it('adds a document once, in catalogue order', async () => {
    const on = handlers();
    renderWithProviders(<StepCard step={DOCUMENT} canDelete catalogue={CATALOGUE} {...on} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'National ID' }));
    const next = on.onReorderFields.mock.calls[0]?.[0] as KycFieldConfig[];
    expect(next.map((field) => field.type)).toEqual(['doc:passport', 'doc:national_id']);
  });
});

describe('the selfie and the broker’s own steps', () => {
  it('lets the selfie be switched off, made optional, and hold questions (Phase 2)', async () => {
    const selfie: KycStepConfig = {
      ...PERSONAL,
      id: 'step-3',
      slug: 'selfie',
      title: 'Selfie Verification',
      alwaysOn: false,
      evidenceRequired: true,
      fields: [{ ...identity('selfie', 'Selfie Photo'), type: 'camera' }],
    };
    const on = handlers();
    renderWithProviders(<StepCard step={selfie} canDelete catalogue={CATALOGUE} {...on} />);
    expect(screen.getByRole('button', { name: /^disable$/i })).toBeInTheDocument();
    expect(screen.getByText(/one live selfie/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete step/i })).toBeNull();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /required/i }));
    expect(on.onPatch).toHaveBeenCalledWith({ evidenceRequired: false });
  });

  it('gives a step of the broker’s own a name box, and a delete only to kyc.delete', () => {
    const own: KycStepConfig = {
      ...PERSONAL,
      id: 'step-9',
      slug: 'source-of-funds',
      title: 'Source of funds',
      core: false,
      alwaysOn: false,
      fields: [],
    };
    const { unmount } = renderWithProviders(
      <StepCard step={own} canDelete catalogue={CATALOGUE} {...handlers()} />,
    );
    expect(screen.getByLabelText(/step title/i)).toHaveValue('Source of funds');
    expect(
      screen.getByRole('button', { name: /delete step source of funds/i }),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <StepCard step={own} canDelete={false} catalogue={CATALOGUE} {...handlers()} />,
    );
    expect(screen.queryByRole('button', { name: /delete step/i })).toBeNull();
  });
});
