'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Colour for the dashboard charts, in both themes.
 *
 * ## Why the values are here and not in `globals.css`
 *
 * Recharts writes `fill` and `stroke` as SVG presentation ATTRIBUTES, and a few
 * of the things it draws are not DOM elements at all — the gradient stops it
 * builds, the colour it hands a custom tooltip renderer, the palette a legend
 * key mirrors. `var(--…)` works for the first kind and silently produces black
 * for the second, so a chart written entirely against CSS custom properties
 * renders half-invisible in one theme and looks fine in the other. Everything a
 * chart paints therefore has to resolve to a literal string before it reaches
 * Recharts.
 *
 * Two ways to get literals: read the app's tokens back out with
 * `getComputedStyle`, or state the chart palette here. This file does the
 * second, because the app's semantic tokens are not a data-visualisation
 * palette and cannot be made into one — `--primary` is a single brand amber,
 * `--info`/`--success`/`--warning`/`--destructive` are four STATUS colours with
 * reserved meanings, and there is no fifth. Series identity needs a set that is
 * distinguishable under protanopia and deuteranopia, and that property has to
 * be measured rather than assumed.
 *
 * These values are the validated default from the data-visualisation standard,
 * re-checked against THIS app's card surfaces (`--card`: `#ffffff` light,
 * `#1c1c1f` dark) rather than the standard's own:
 *
 *   categorical, 4 slots, light on #ffffff — worst adjacent CVD ΔE 9.1,
 *     normal-vision ΔE 22.9; aqua (2.82:1) and yellow (2.17:1) sit below 3:1
 *   categorical, 4 slots, dark on #1c1c1f — worst adjacent CVD ΔE 8.4,
 *     normal-vision ΔE 19.8; all four clear 3:1
 *   ordinal ramp, 5 steps, both modes — monotone lightness, every adjacent
 *     gap ≥ 0.06, light end ≥ 2:1 on its surface
 *
 * The two sub-3:1 light slots carry the RELIEF the standard requires: every
 * chart using them ships a visible legend and either direct labels or a value
 * column, so no number is reachable by colour alone.
 *
 * The CHROME below (grid, axis, ink) does come from the app's tokens — those
 * are exactly what the semantic layer is for, and they must track any future
 * edit to `globals.css`. See `useChartTokens`.
 */

/**
 * Categorical slots, in fixed order. Slot N is always the same hue in both
 * themes — the dark column is the same four hues re-stepped for a dark
 * surface, not a different palette.
 *
 * ORDER IS THE SAFETY MECHANISM and is not cosmetic: it is what the adjacent-
 * pair CVD check was run against. Assign slots in sequence and never cycle.
 * A fifth series does not get a generated fifth hue — it gets folded, faceted,
 * or the chart form changes.
 */
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500'],
} as const;

/**
 * One blue ramp, light→dark, for ORDERED categories — the KYC funnel, whose
 * stages have a real sequence.
 *
 * Ordered data takes a ramp rather than four identities on purpose: the reader
 * should see the order in the colour. The dark column runs the other way
 * because the anchor flips with the surface — "more" is the step furthest from
 * the background, which is dark on white and light on near-black.
 */
const ORDINAL = {
  light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
  dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'],
} as const;

/**
 * The reserved status scale — good / warning / serious / critical.
 *
 * Deliberately distinct steps from the categorical slots so a status colour
 * never impersonates a series, and never reused as "series 5". Mode-invariant
 * by design; all four clear 3:1 on the dark surface, and on the light surface
 * `warning` (1.83:1) and `serious` (2.64:1) do not — which is why every use
 * here pairs the colour with a written label, never colour alone.
 */
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export interface ChartTokens {
  /** Categorical identity slots, in fixed assignment order. */
  series: readonly string[];
  /** One-hue ramp for ordered stages, near-surface first. */
  ordinal: readonly string[];
  /** Reserved state colours. Always shipped with a written label. */
  status: typeof STATUS;
  /** Hairline grid, one step off the surface. */
  grid: string;
  /** Axis rule and tick text. */
  axis: string;
  /** Primary ink, for tooltip values. */
  ink: string;
  /** Secondary ink, for tooltip labels and legends. */
  inkMuted: string;
  /** The card the chart sits on — the colour of every surface gap and ring. */
  surface: string;
  /** True once the theme is known. Charts do not paint before this. */
  ready: boolean;
  /** Which palette column is in use. Exposed for tooltips and legends. */
  mode: 'light' | 'dark';
}

/**
 * Read one CSS custom property off `<html>` as a literal colour.
 *
 * `getComputedStyle` rather than the raw token text, so a value defined as
 * `var(--ox-amber)` resolves to a hex instead of reaching Recharts as an
 * unresolvable string. Falls back when the property is missing — a chart with a
 * slightly-off gridline is a far better failure than one that throws.
 */
function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/**
 * The palette for the theme currently on screen.
 *
 * Gated on `useHydrated` for the reason the theme toggle is: the server cannot
 * know the stored theme, so anything derived from it differs between the server
 * render and the first client render. Charts must therefore not paint until
 * after hydration — which is also what keeps Recharts out of the prerender,
 * where it measures a container that has no size and warns on every build.
 *
 * `resolvedTheme` rather than `theme`, because `theme` is `'system'` for anyone
 * who never touched the toggle and `'system'` is not a palette.
 */
export function useChartTokens(): ChartTokens {
  const hydrated = useHydrated();
  const { resolvedTheme } = useTheme();
  const mode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';

  /*
   * Re-read on every theme change. The chrome tokens live in `globals.css` and
   * change under the `.dark` class, so a value captured once would be the light
   * gridline drawn on the dark card — the exact failure this hook exists to
   * prevent.
   */
  const chrome = React.useMemo(() => {
    const dark = mode === 'dark';
    const fallback = {
      grid: dark ? '#2d2d32' : '#e2e2e2',
      axis: dark ? '#a0a0a8' : '#616167',
      ink: dark ? '#f4f4f6' : '#1a1a1e',
      surface: dark ? '#1c1c1f' : '#ffffff',
    };
    if (!hydrated || typeof window === 'undefined') return fallback;

    const styles = window.getComputedStyle(document.documentElement);
    return {
      grid: readToken(styles, '--border', fallback.grid),
      axis: readToken(styles, '--muted-foreground', fallback.axis),
      ink: readToken(styles, '--foreground', fallback.ink),
      surface: readToken(styles, '--card', fallback.surface),
    };
  }, [hydrated, mode]);

  return {
    series: CATEGORICAL[mode],
    ordinal: ORDINAL[mode],
    status: STATUS,
    grid: chrome.grid,
    axis: chrome.axis,
    ink: chrome.ink,
    inkMuted: chrome.axis,
    surface: chrome.surface,
    ready: hydrated,
    mode,
  };
}
