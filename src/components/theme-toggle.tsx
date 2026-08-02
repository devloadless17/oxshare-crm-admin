'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <div className="h-7 w-7 rounded-md bg-muted" />
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
        className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-all ${
          theme === 'light'
            ? 'bg-background text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Light Mode"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-all ${
          theme === 'dark'
            ? 'bg-background text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Dark Mode"
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-all ${
          theme === 'system'
            ? 'bg-background text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="System Theme"
      >
        <Monitor className="h-4 w-4" />
      </button>
    </div>
  );
}
