'use client';

import * as React from 'react';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

/**
 * Vertical drag-to-reorder, for the KYC builder's steps and for the fields
 * inside one.
 *
 * ## Why a handle rather than a draggable card
 *
 * Both lists are made of cards FULL of inputs — a step card holds its title,
 * slug and description, a field row holds four controls. If the card itself
 * were the drag source, every text selection inside it would start a drag
 * instead, which is the single most common way a builder like this becomes
 * unusable. `listeners` go on the handle alone; the rest of the card behaves
 * like ordinary markup.
 *
 * ## Keyboard reordering is not optional here
 *
 * The list this replaces had Up/Down buttons, which were fully keyboard
 * operable. Swapping them for mouse-only drag would REMOVE an ability, so the
 * handle is a real `<button>` carrying dnd-kit's keyboard sensor: Space picks
 * up, arrows move, Space drops, Escape cancels. `sortableKeyboardCoordinates`
 * is what makes the arrows track the list's own geometry.
 *
 * The Up/Down buttons stay too — see the builder page. Drag is an addition,
 * not a replacement, because a precise single-position nudge is genuinely
 * easier with a button than with a pointer.
 */

/** One draggable row. `children` renders the row's own content. */
export function SortableRow({
  id,
  disabled,
  handleLabel,
  disabledReason,
  className,
  children,
}: {
  id: string;
  /** Mandatory steps do not move — the handle renders inert rather than absent. */
  disabled?: boolean;
  /** Accessible name for the handle, e.g. "Reorder Identity document". */
  handleLabel: string;
  /** Hover text when `disabled` — a dead control has to say why. */
  disabledReason?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        // `CSS.Transform.toString` emits a translate3d, so the row moves on the
        // compositor rather than by re-laying out the list on every frame.
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        isDragging &&
          // Lifted, not hidden. The row stays legible while it moves so the
          // operator can see WHAT they are dropping, not just where.
          'relative z-20 opacity-90 shadow-lg ring-1 ring-primary/40',
        className,
      )}
      data-dragging={isDragging ? 'true' : undefined}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={handleLabel}
          title={disabled ? disabledReason : undefined}
          className={cn(
            'focus-outline mt-3 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground',
            'hover:bg-muted hover:text-foreground active:cursor-grabbing',
            'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
          )}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/**
 * The context the rows live in. Reorders `items` and hands the caller the new
 * order — it owns no state itself, because the builder's draft is the single
 * source of truth and a second copy here would be one more thing to sync.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    /*
     * An 8px threshold, so a CLICK on the handle is still a click.
     * Without it, the pointer-down that focuses the handle already counts as a
     * drag start, and a keyboard user tabbing to it sees the list jump.
     */
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // `over` is null when the drop lands outside the list, and equal ids mean
    // the row came back to where it started. Both are no-ops, and calling
    // `onReorder` for them would mark the draft dirty for a move that did not
    // happen.
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Vertical only, and never outside the list: this is a single column, so
      // horizontal travel is always accidental.
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
