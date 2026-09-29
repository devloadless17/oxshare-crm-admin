/**
 * How long a dashboard chart waits after its box changes size before it redraws.
 *
 * Collapsing the sidebar changes the page's width. A chart redraw costs ~80ms on
 * the dashboard, and without a wait every chart's ResizeObserver redrew during the
 * sidebar's 300ms slide — the dashboard alone felt heavy (reported 30 Sep 2026).
 * 350ms puts the ONE redraw just after the slide ends (the content pane moves in a
 * single step, see admin-layout.tsx), so it never interrupts the animation.
 */
export const CHART_RESIZE_DEBOUNCE_MS = 350;
