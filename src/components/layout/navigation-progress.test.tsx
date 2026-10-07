import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NavigationProgress, startNavigationProgress } from './navigation-progress';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

/**
 * The bar's whole contract is about TIME: silent for a fast navigation (or it
 * flickers on every click), visible for a slow one (or the page looks frozen),
 * and never left behind.
 */
describe('NavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nav.pathname = '/dashboard';
    window.history.replaceState(null, '', '/dashboard');
  });
  afterEach(() => vi.useRealTimers());

  const arrive = (rerender: (ui: React.ReactElement) => void, path: string) => {
    nav.pathname = path;
    window.history.replaceState(null, '', path);
    rerender(<NavigationProgress label="Loading" />);
  };

  it('shows nothing for a navigation that lands within 150 ms', () => {
    const { rerender } = render(<NavigationProgress label="Loading" />);
    act(() => void startNavigationProgress('/clients'));
    act(() => void vi.advanceTimersByTime(100));
    act(() => void arrive(rerender, '/clients'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the bar once a navigation has waited 150 ms, and removes it on arrival', () => {
    const { rerender } = render(<NavigationProgress label="Loading" />);
    act(() => void startNavigationProgress('/clients'));
    act(() => void vi.advanceTimersByTime(149));
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-busy', 'true');

    act(() => void arrive(rerender, '/clients'));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-busy', 'false');
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('ignores a click on the page already on screen', () => {
    render(<NavigationProgress label="Loading" />);
    act(() => void startNavigationProgress('/dashboard'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('gives up on a navigation that never lands', () => {
    render(<NavigationProgress label="Loading" />);
    act(() => void startNavigationProgress('/clients'));
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('starts again for the next navigation after one is overtaken', () => {
    const { rerender } = render(<NavigationProgress label="Loading" />);
    act(() => void startNavigationProgress('/clients'));
    act(() => void vi.advanceTimersByTime(100));
    act(() => void startNavigationProgress('/wallets'));
    act(() => void vi.advanceTimersByTime(100));
    // 200 ms after the first click, but only 100 ms after the second: still silent.
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => void vi.advanceTimersByTime(60));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    act(() => void arrive(rerender, '/wallets'));
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
