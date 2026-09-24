import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './theme-toggle';

/**
 * Light or dark — one icon beside the bell, and exactly two states.
 *
 * The client asked for this directly: no "System" choice, and the control in
 * the header rather than three levels into the account menu.
 */

const theme = vi.hoisted(() => ({ resolvedTheme: 'light', setTheme: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => theme }));
vi.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

beforeEach(() => {
  theme.setTheme.mockClear();
  theme.resolvedTheme = 'light';
});

describe('ThemeToggle', () => {
  it('on a LIGHT page offers dark, by name, and switches to it', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: /switch to dark mode/i });
    await user.click(button);

    expect(theme.setTheme).toHaveBeenCalledWith('dark');
  });

  it('on a DARK page offers light, and switches to it', async () => {
    theme.resolvedTheme = 'dark';
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(theme.setTheme).toHaveBeenCalledWith('light');
  });

  it('only ever sets light or dark — never "system"', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button'));
    theme.resolvedTheme = 'dark';
    render(<ThemeToggle />);
    await user.click(screen.getAllByRole('button')[1]!);

    for (const [value] of theme.setTheme.mock.calls) {
      expect(['light', 'dark'], `set an unexpected theme: ${String(value)}`).toContain(value);
    }
  });

  it('decides from resolvedTheme, so a first visit following a DARK device offers light', () => {
    /*
     * Before anyone clicks, `theme` is "system" and only `resolvedTheme` says
     * what is actually on screen. Reading `theme` would show a moon on a page
     * the device has already made dark — offering the state it is already in.
     */
    theme.resolvedTheme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
  });
});
