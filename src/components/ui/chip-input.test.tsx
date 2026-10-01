import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ChipInput, type ChipOption } from './chip-input';

const COUNTRIES: ChipOption[] = [
  { value: 'EG', label: 'Egypt' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'SY', label: 'Syria' },
  { value: 'AE', label: 'United Arab Emirates', aliases: ['UAE'] },
];

function Harness({
  options,
  onChange,
}: {
  options?: ChipOption[];
  onChange?: (v: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ChipInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={options}
      ariaLabel="Countries"
    />
  );
}

describe('ChipInput', () => {
  it('picks from the list by search and Enter, and never adds a typo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness options={COUNTRIES} onChange={onChange} />);
    const box = screen.getByRole('combobox', { name: 'Countries' });
    await user.type(box, 'egy{Enter}');
    expect(screen.getByRole('button', { name: 'Remove Egypt' })).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(['EG']);
    await user.type(box, 'Egpyt{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('turns a pasted comma list into chips, and reports what is not on the list', () => {
    const onChange = vi.fn();
    render(<Harness options={COUNTRIES} onChange={onChange} />);
    const box = screen.getByRole('combobox', { name: 'Countries' });
    fireEvent.paste(box, { clipboardData: { getData: () => 'Lebanon, Iraq, Narnia' } });
    expect(onChange).toHaveBeenLastCalledWith(['LB', 'IQ']);
    expect(screen.getByRole('status')).toHaveTextContent('Narnia');
  });

  it('free mode adds on Enter or comma, and Backspace removes the last chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = screen.getByRole('combobox', { name: 'Countries' });
    await user.type(box, 'Salary{Enter}Gift,');
    expect(onChange).toHaveBeenLastCalledWith(['Salary', 'Gift']);
    await user.type(box, '{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['Salary']);
  });

  it('adds a TYPED list on Enter, by name, short name or the start of one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness options={COUNTRIES} onChange={onChange} />);
    const box = screen.getByRole('combobox', { name: 'Countries' });
    await user.type(box, 'syria, leb, uae{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['SY', 'LB', 'AE']);
  });
});
