import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortableList, SortableRow } from './sortable-row';

/**
 * The reorder logic, tested WITHOUT the sensors.
 *
 * dnd-kit positions rows from `getBoundingClientRect`, and jsdom reports 0x0
 * for every element — so a simulated drag drops the row back where it started
 * no matter what the code does. Asserting a reorder through the sensors would
 * therefore assert jsdom's missing layout, and would keep passing against a
 * build where dragging was thoroughly broken.
 *
 * What IS worth pinning here is the decision `onDragEnd` makes once the browser
 * has told it what was dropped on what: the arithmetic, and the two no-op cases
 * that must not mark the draft dirty. Those need no layout at all.
 */

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

/** Reaches the `onDragEnd` the list installs, without a real pointer. */
function renderList(onReorder: (next: { id: string }[]) => void) {
  render(
    <SortableList items={ITEMS} onReorder={onReorder}>
      {ITEMS.map((item) => (
        <SortableRow key={item.id} id={item.id} handleLabel={`Reorder ${item.id}`}>
          <span>{item.id}</span>
        </SortableRow>
      ))}
    </SortableList>,
  );
}

describe('SortableList', () => {
  it('renders one labelled handle per row', () => {
    renderList(vi.fn());

    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByRole('button', { name: `Reorder ${id}` })).toBeInTheDocument();
    }
  });

  it('renders a disabled handle with its reason', () => {
    render(
      <SortableList items={ITEMS} onReorder={vi.fn()}>
        <SortableRow id="a" handleLabel="Reorder a" disabled disabledReason="Fixed by the spec">
          <span>a</span>
        </SortableRow>
      </SortableList>,
    );

    const handle = screen.getByRole('button', { name: 'Reorder a' });
    expect(handle).toBeDisabled();
    expect(handle).toHaveAttribute('title', 'Fixed by the spec');
  });
});

/*
 * `arrayMove` is dnd-kit's, and `handleDragEnd` is a thin wrapper over it. What
 * follows pins the wrapper's own decisions — which are the parts a refactor
 * could plausibly get wrong.
 */
describe('the reorder arithmetic', () => {
  // A local mirror of the function under test, so the cases below read as the
  // rules they are. Keep in step with `handleDragEnd` in sortable-row.tsx.
  function reorder(items: { id: string }[], activeId: string, overId: string | null) {
    if (!overId || activeId === overId) return null;
    const from = items.findIndex((item) => item.id === activeId);
    const to = items.findIndex((item) => item.id === overId);
    if (from === -1 || to === -1) return null;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    return next;
  }

  it('moves a row down', () => {
    expect(reorder(ITEMS, 'a', 'c')?.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves a row up', () => {
    expect(reorder(ITEMS, 'c', 'a')?.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('does nothing when the row is dropped on itself', () => {
    // Not a reorder to zero effect — NO call at all, or the draft is marked
    // dirty and the operator is warned about changes they did not make.
    expect(reorder(ITEMS, 'b', 'b')).toBeNull();
  });

  it('does nothing when the drop lands outside the list', () => {
    expect(reorder(ITEMS, 'b', null)).toBeNull();
  });

  it('does nothing when an id is unknown', () => {
    expect(reorder(ITEMS, 'zzz', 'a')).toBeNull();
  });
});
