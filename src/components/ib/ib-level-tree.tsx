'use client';

import * as React from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { IbLevel } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';

/**
 * The payout ladder, drawn as the chain it is.
 *
 * ## Why a tree and not a table
 *
 * A table presents rows as peers whose order is a sorting preference. This
 * order is the DATA: level 1 is the partner dealing with the broker, level 2
 * was recruited by them, and earnings climb that line. A connector between the
 * rungs says "this one sits under that one" in a way a `Level` column reading
 * 1, 2, 3 never did — that column looked like an id, and operators read the
 * screen as "we allow 2 partners" rather than "earnings travel 2 levels".
 *
 * ## Dragging renumbers PRIMARY KEYS
 *
 * Not a sort column. `ib_levels.level` is the key and `ib_accounts.level`
 * references it, so a drop is a renumber underneath live partners — which is
 * why it is one PATCH on the collection rather than a PATCH per row, and why
 * the API applies it in a transaction. A half-applied order would be a ladder
 * whose rungs do not match the people standing on them.
 *
 * ## Native drag events, no library
 *
 * A ladder is two to five rows and this is the whole of the interaction. Adding
 * a drag library for it would be a dependency serving one screen. The trade is
 * accepted deliberately: HTML5 drag-and-drop is not reachable by keyboard, so
 * the Edit dialog remains the complete non-pointer path to everything the drag
 * does — the order is a consequence of the level numbers, which are editable
 * there.
 */
export function IbLevelTree({
  levels,
  canManage,
  reordering,
  onEdit,
  onToggle,
  onDelete,
  onReorder,
  onAdd,
}: {
  levels: IbLevel[];
  canManage: boolean;
  reordering: boolean;
  onEdit: (level: IbLevel) => void;
  onToggle: (level: IbLevel) => void;
  onDelete: (level: IbLevel) => void;
  /** The new order, as CURRENT level numbers top-first. */
  onReorder: (order: number[]) => void;
  onAdd: () => void;
}) {
  const [draggingLevel, setDraggingLevel] = React.useState<number | null>(null);
  const [overLevel, setOverLevel] = React.useState<number | null>(null);

  const clearDrag = () => {
    setDraggingLevel(null);
    setOverLevel(null);
  };

  const drop = (targetLevel: number) => {
    if (draggingLevel === null || draggingLevel === targetLevel) {
      clearDrag();
      return;
    }

    const order = levels.map((l) => l.level);
    const from = order.indexOf(draggingLevel);
    const to = order.indexOf(targetLevel);
    if (from === -1 || to === -1) {
      clearDrag();
      return;
    }

    /*
     * Move, not swap. Dropping level 3 onto level 1 means "3 now leads", with
     * everything below shuffling down — swapping would leave 2 where it was,
     * which is not what dragging a row to the top looks like it does.
     *
     * Built by filter-and-insert rather than a pair of splices: `splice` is
     * typed as possibly returning nothing, and the index it hands back is only
     * correct before the first mutation.
     */
    const without = order.filter((l) => l !== draggingLevel);
    const insertAt = without.indexOf(targetLevel) + (to > from ? 1 : 0);
    const next = [...without.slice(0, insertAt), draggingLevel, ...without.slice(insertAt)];

    clearDrag();
    onReorder(next);
  };

  return (
    /*
     * ONE rail, drawn behind everything, rather than a segment per rung.
     *
     * The per-item version was rebuilt three times and broke at a different
     * seam each time: a connector living inside its own <li> ends at that box,
     * so every list boundary and every scrap of padding is somewhere the line
     * can stop. Margin arithmetic closed one gap and opened the next.
     *
     * A single absolutely-positioned line has no seams to get wrong. It spans
     * from the first node's centre to the last one's, the nodes sit on top of
     * it with their own background, and adding or removing a rung cannot
     * introduce a break because there is only ever one line.
     *
     * `top-4`/`bottom-4` is half a node (h-8), which is what puts the ends at
     * the centres of the first and last circles instead of their edges.
     */
    <ol className="relative" aria-busy={reordering}>
      {(levels.length > 1 || canManage) && (
        <span
          className="absolute left-4 top-4 bottom-4 w-0.5 -translate-x-1/2 bg-border"
          aria-hidden="true"
        />
      )}
      {levels.map((level, index) => {
        const isDragging = draggingLevel === level.level;
        const isOver = overLevel === level.level && draggingLevel !== level.level;

        return (
          <li key={level.level} className="relative flex items-start gap-3 pb-3">
            {/*
              The node sits ON the rail and has to HIDE it, not tint it.

              `bg-primary/10` alone is translucent, so the line showed straight
              through the circle. The opaque `bg-background` is the layer that
              actually masks it; the tint goes on an inner span above that, so
              the enabled state still reads without the rail behind it.
            */}
            <span className="relative z-10 flex h-8 w-8 shrink-0 rounded-full bg-background">
              <span
                className={`flex h-full w-full items-center justify-center rounded-full border-2 text-xs font-bold tabular ${
                  level.enabled
                    ? 'border-primary bg-primary/10 text-link'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </span>
            </span>

            <div
              draggable={canManage && !reordering}
              onDragStart={() => setDraggingLevel(level.level)}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                if (draggingLevel === null) return;
                // Without this the drop event never fires — the default is
                // "reject", which reads as the row simply not moving.
                e.preventDefault();
                setOverLevel(level.level);
              }}
              onDragLeave={() =>
                setOverLevel((current) => (current === level.level ? null : current))
              }
              onDrop={(e) => {
                e.preventDefault();
                drop(level.level);
              }}
              className={`flex-1 rounded-xl border bg-card p-4 ${
                isOver ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              } ${isDragging ? 'opacity-50' : ''} ${
                level.enabled ? '' : 'border-dashed'
              } ${canManage && !reordering ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {canManage && (
                    <GripVertical
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{level.name}</h3>
                      <Badge variant="tag">
                        {level.payoutModel === 'revenue_share'
                          ? t('ibLevels.modelRevenueShare')
                          : t('ibLevels.modelPerLot')}
                      </Badge>
                      {!level.enabled && (
                        <span className="text-xs text-muted-foreground">
                          {t('ibLevels.statusDisabled')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {/* The unit travels with the number, always. "70" alone
                            means 70% under one model and $70 under the other. */}
                      <span className="tabular font-semibold text-foreground">
                        {level.payoutModel === 'revenue_share'
                          ? `${trimRate(level.rateValue)}%`
                          : t('ibLevels.perLotValue', { value: trimRate(level.rateValue) })}
                      </span>
                      {' · '}
                      {level.maxDirectPartners === null
                        ? t('ibLevels.unlimitedPartners')
                        : t('ibLevels.maxPartners', { max: String(level.maxDirectPartners) })}
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(level)}
                      aria-label={t('ibLevels.editAria', { level: String(level.level) })}
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted focus-outline"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('ibLevels.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(level)}
                      className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted focus-outline"
                    >
                      {level.enabled ? t('ibLevels.disable') : t('ibLevels.enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(level)}
                      aria-label={t('ibLevels.deleteAria', { level: String(level.level) })}
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 focus-outline"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('ibLevels.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}

      {/*
        Add sits at the FOOT of the chain, where the new rung will appear.
        It was a button in the page header, which put "add a level" as far as
        possible from the thing being added and gave no clue where the result
        would land. Here the affordance is in the position it creates.
      */}
      {canManage && (
        <li className="relative flex items-start gap-3">
          {/* On the rail like any other node — the shared line above already
              reaches it, so this draws no segment of its own. `bg-background`
              for the same reason as the numbered nodes: it has to mask the
              line, and a translucent hover tint would let it show through. */}
          <button
            type="button"
            onClick={onAdd}
            title={t('ibLevels.create')}
            aria-label={t('ibLevels.create')}
            className="relative z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground hover:border-primary hover:text-link focus-outline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      )}
    </ol>
  );
}

/**
 * `70.0000` reads as `70`, `2.5000` as `2.5`.
 *
 * Display only. The value stays the API's string everywhere else — this never
 * feeds back into a request, because trimming and re-sending would send a
 * different string than the one stored.
 */
function trimRate(value: string): string {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
