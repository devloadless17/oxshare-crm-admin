'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useHydrated } from '@/hooks/use-hydrated';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The server cannot know the stored theme, so the toggle renders as a
  // skeleton until hydration rather than flashing the wrong active state.
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <div className="h-7 w-7 rounded-md bg-muted" />
        <div className="h-7 w-7 rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-1 backdrop-blur-xs">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium focus-outline ${
          theme === 'light'
            ? 'bg-background text-link shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Light Mode"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium focus-outline ${
          theme === 'dark'
            ? 'bg-background text-link shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Dark Mode"
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
