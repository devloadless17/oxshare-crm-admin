import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabPanel, type TabDefinition } from './tabs';

/**
 * The hand-written tab strip.
 *
 * `tabs.tsx` argues that a tab strip is a roving tabindex and six ARIA
 * attributes, and therefore not worth a dependency. This file is the other half
 * of that argument: the keyboard behaviour and the ARIA wiring that Radix would
 * have supplied are pinned here rather than assumed.
 */

const TABS: TabDefinition[] = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
];

function Harness({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  return (
    <>
      <Tabs tabs={TABS} value={value} onValueChange={onValueChange} idPrefix="t" />
      <TabPanel value="one" activeValue={value} idPrefix="t">
        panel one
      </TabPanel>
      <TabPanel value="two" activeValue={value} idPrefix="t">
        panel two
      </TabPanel>
      <TabPanel value="three" activeValue={value} idPrefix="t">
        panel three
      </TabPanel>
    </>
  );
}

describe('ARIA wiring', () => {
  it('marks exactly one tab selected', () => {
    render(<Harness value="two" onValueChange={vi.fn()} />);

    const selected = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Two');
  });

  it('points each tab at its panel', () => {
    render(<Harness value="two" onValueChange={vi.fn()} />);

    const tab = screen.getByRole('tab', { name: 'Two' });
    const panel = screen.getByRole('tabpanel');

    // The pair of references a screen reader uses to announce "tab 2 of 3,
    // panel". A mismatched id here is invisible on screen and total to a
    // non-visual user.
    expect(tab.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.getAttribute('id'));
    // An inactive tab's panel is not in the page, so it names none: a reference
    // to a missing id is invalid ARIA (axe, 26 Sep 2026).
    expect(screen.getByRole('tab', { name: 'One' })).not.toHaveAttribute('aria-controls');
  });

  it('keeps one tab stop for the whole strip', () => {
    // Roving tabindex: Tab reaches the strip once, then arrows move within it.
    // Without this a three-tab strip costs three Tab presses to walk past.
    render(<Harness value="two" onValueChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('only the active panel renders', () => {
  it('renders nothing for the inactive ones', () => {
    // Not hidden with CSS — absent. Each settings panel fires its own query on
    // mount, and one of them 403s for a non-master admin.
    render(<Harness value="two" onValueChange={vi.fn()} />);

    expect(screen.getByText('panel two')).toBeInTheDocument();
    expect(screen.queryByText('panel one')).toBeNull();
    expect(screen.queryByText('panel three')).toBeNull();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
});

describe('keyboard navigation', () => {
  it('moves right with ArrowRight', async () => {
    const onValueChange = vi.fn();
    render(<Harness value="one" onValueChange={onValueChange} />);

    screen.getByRole('tab', { name: 'One' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledWith('two');
  });

  it('moves left with ArrowLeft', async () => {
    const onValueChange = vi.fn();
    render(<Harness value="two" onValueChange={onValueChange} />);

    screen.getByRole('tab', { name: 'Two' }).focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(onValueChange).toHaveBeenCalledWith('one');
  });

  it('wraps around at both ends', async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<Harness value="three" onValueChange={onValueChange} />);

    screen.getByRole('tab', { name: 'Three' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith('one');

    onValueChange.mockClear();
    rerender(<Harness value="one" onValueChange={onValueChange} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onValueChange).toHaveBeenCalledWith('three');
  });

  it('jumps to the ends with Home and End', async () => {
    const onValueChange = vi.fn();
    render(<Harness value="two" onValueChange={onValueChange} />);

    screen.getByRole('tab', { name: 'Two' }).focus();
    await userEvent.keyboard('{Home}');
    expect(onValueChange).toHaveBeenCalledWith('one');

    onValueChange.mockClear();
    await userEvent.keyboard('{End}');
    expect(onValueChange).toHaveBeenCalledWith('three');
  });

  it('ignores keys it does not handle', async () => {
    // ArrowDown is the VERTICAL orientation's key. The strip declares
    // aria-orientation="horizontal", so it must leave that alone rather than
    // hijacking a scroll.
    const onValueChange = vi.fn();
    render(<Harness value="two" onValueChange={onValueChange} />);

    screen.getByRole('tab', { name: 'Two' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('clicking', () => {
  it('selects the clicked tab', async () => {
    const onValueChange = vi.fn();
    render(<Harness value="one" onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Three' }));

    expect(onValueChange).toHaveBeenCalledWith('three');
  });

  it('is controlled — a click alone does not change what is shown', async () => {
    // No internal state: the settings screen keeps the active tab in the URL,
    // and a second copy here would disagree with it the moment someone hits Back.
    render(<Harness value="one" onValueChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Three' }));

    expect(screen.getByText('panel one')).toBeInTheDocument();
    expect(screen.queryByText('panel three')).toBeNull();
  });
});
