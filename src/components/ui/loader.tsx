'use client';

import { Loader2 } from 'lucide-react';

export interface LoaderProps {
  /** Size variant for the spinner */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional loading message/text */
  text?: string;
  /** Whether to render in full-page / full-container centered overlay mode */
  fullPage?: boolean;
  /** Additional CSS class names */
  className?: string;
}

const iconSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
  xl: 'h-14 w-14',
};

export function Loader({ size = 'md', text, fullPage = false, className = '' }: LoaderProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${className}`}>
      <div className="relative flex items-center justify-center">
        <Loader2 className={`${iconSizes[size]} text-primary animate-spin`} />
      </div>
      {text && (
        <p className="text-xs md:text-sm font-medium text-muted-foreground animate-pulse tracking-wide">
          {text}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[400px] w-full flex-1 items-center justify-center p-8">
        {content}
      </div>
    );
  }

  return content;
}
