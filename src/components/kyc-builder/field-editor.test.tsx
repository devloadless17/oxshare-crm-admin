import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { FieldEditor, keepArabicFor, type KycFieldConfig } from './field-editor';
import { placeRefusals } from './builder-save';
import type { KycStepConfig } from './step-card';

/**
 * A broker's question in Arabic (0179): a label and hint twin, and one Arabic
 * box per English choice — keyed by the English VALUE, so the answer stored is
 * still the English one and reordering or deleting a choice cannot misalign the
 * Arabic.
 */

const SELECT: KycFieldConfig = {
  id: 'q-1',
  name: 'customField_1',
  label: 'Employment',
  type: 'select',
  required: true,
  options: ['Employed', 'Self-employed', 'Retired'],
  optionsAr: { Employed: 'موظف' },
};

/** The editor with its own draft, the way the builder holds it. */
function Harness({
  initial,
  onField,
}: {
  initial: KycFieldConfig;
  onField?: (field: KycFieldConfig) => void;
}) {
  const [field, setField] = React.useState(initial);
  return (
    <FieldEditor
      field={field}
      slug="source-of-funds"
      onChange={(patch) =>
        setField((prev) => {
          const next = { ...prev, ...patch };
          onField?.(next);
          return next;
        })
      }
      onRemove={vi.fn()}
    />
  );
}

describe('the Arabic of a question', () => {
  it('edits the label and hint in Arabic, right to left', () => {
    const onField = vi.fn();
    renderWithProviders(<Harness initial={SELECT} onField={onField} />);
    const label = screen.getByLabelText('Label (Arabic)');
    expect(label).toHaveAttribute('dir', 'rtl');
    expect(label).toHaveAttribute('lang', 'ar');
    fireEvent.change(label, { target: { value: 'الوظيفة' } });
    fireEvent.change(screen.getByLabelText('Hint (Arabic)'), { target: { value: 'اختر واحدًا' } });
    expect(onField).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelAr: 'الوظيفة', hintAr: 'اختر واحدًا' }),
    );
    expect(screen.getByText(/leave blank to show the english/i)).toBeInTheDocument();
  });

  it('offers one Arabic box per English choice, keyed by the English value', () => {
    const onField = vi.fn();
    renderWithProviders(<Harness initial={SELECT} onField={onField} />);
    expect(screen.getByRole('textbox', { name: 'Arabic for “Employed”' })).toHaveValue('موظف');
    const retired = screen.getByRole('textbox', { name: 'Arabic for “Retired”' });
    expect(retired).toHaveAttribute('dir', 'rtl');

    fireEvent.change(retired, { target: { value: 'متقاعد' } });
    expect(onField).toHaveBeenLastCalledWith(
      expect.objectContaining({ optionsAr: { Employed: 'موظف', Retired: 'متقاعد' } }),
    );
  });

  it('says how many choices have no Arabic, and stops once all do', () => {
    renderWithProviders(<Harness initial={SELECT} />);
    expect(
      screen.getByText(
        /2 of 3 choices have no Arabic — clients reading Arabic will see the English/,
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Arabic for “Self-employed”' }), {
      target: { value: 'يعمل لحسابه' },
    });
    expect(screen.getByText(/1 of 3 choices has no Arabic/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Arabic for “Retired”' }), {
      target: { value: 'متقاعد' },
    });
    expect(screen.queryByText(/no Arabic —/)).toBeNull();
  });

  it('drops a choice’s entry when its Arabic box is emptied', () => {
    const onField = vi.fn();
    renderWithProviders(<Harness initial={SELECT} onField={onField} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Arabic for “Employed”' }), {
      target: { value: '' },
    });
    expect(onField).toHaveBeenLastCalledWith(expect.objectContaining({ optionsAr: undefined }));
  });

  it('keeps the Arabic of choices that still exist when the English list changes', () => {
    const arabic = { Employed: 'موظف', Retired: 'متقاعد' };
    expect(keepArabicFor(arabic, ['Retired', 'Student', 'Employed'])).toEqual(arabic);
    expect(keepArabicFor(arabic, ['Retired', 'Student'])).toEqual({ Retired: 'متقاعد' });
    expect(keepArabicFor(arabic, ['Student'])).toBeUndefined();
    expect(keepArabicFor(undefined, ['Student'])).toBeUndefined();
  });

  it('has no choice boxes on a type without choices', () => {
    renderWithProviders(<Harness initial={{ ...SELECT, type: 'text' }} />);
    expect(screen.queryByRole('textbox', { name: /Arabic for/ })).toBeNull();
    expect(screen.getByLabelText('Label (Arabic)')).toBeInTheDocument();
  });

  it('shows the server’s refusal of the choices’ Arabic under them', () => {
    renderWithProviders(
      <FieldEditor
        field={SELECT}
        slug="source-of-funds"
        errors={{ optionsAr: 'optionsAr must map each choice to its Arabic label.' }}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/optionsAr must map/);
  });
});

describe('placeRefusals — an Arabic refusal lands under its input', () => {
  const step = (id: string, fields: KycFieldConfig[]): KycStepConfig => ({
    id,
    stepNumber: 1,
    slug: id,
    title: id,
    enabled: true,
    fields,
  });
  const sent = [step('a', []), step('b', [SELECT])];

  it('keys a property refusal by step or field, and a bare one as before', () => {
    const placed = placeRefusals(
      {
        'steps.0.titleAr': 'too long',
        'steps.1.fields.0.optionsAr': 'not a map',
        'steps.1.fields.0': 'already collected',
        'steps.1': 'needs a question',
      },
      sent,
    );
    expect(placed.byStep['a']).toEqual({ fields: {}, properties: { titleAr: 'too long' } });
    expect(placed.byStep['b']).toEqual({
      step: 'needs a question',
      fields: { 'q-1': 'already collected' },
      fieldProperties: { 'q-1': { optionsAr: 'not a map' } },
    });
    expect(placed.firstStepId).toBe('a');
    expect(placed.form).toBeUndefined();
  });

  it('sends a path it cannot place to the form', () => {
    expect(placeRefusals({ 'steps.9.titleAr': 'x' }, sent).form).toBe('x');
    expect(placeRefusals({ format: 'y' }, sent).form).toBe('y');
  });
});
