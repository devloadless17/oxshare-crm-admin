'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string;
  onChange?: (date: string) => void;
  maxDate?: string;
  minDate?: string;
  requireAdult?: boolean; // Default true: enforces 18+ age limit
}

const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className, value, onChange, maxDate, minDate, requireAdult = true, disabled, ...props }, ref) => {
    const adultMaxDate = React.useMemo(() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 18);
      return d.toISOString().split('T')[0];
    }, []);

    const effectiveMax = maxDate || (requireAdult ? adultMaxDate : undefined);

    return (
      <div className={cn('relative flex items-center', className)}>
        <CalendarIcon className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
        <Input
          ref={ref}
          type="date"
          value={value || ''}
          max={effectiveMax}
          min={minDate}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className="pl-9 pr-3 uppercase tracking-wider text-xs font-medium cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          {...props}
        />
      </div>
    );
  },
);
DatePicker.displayName = 'DatePicker';

export { DatePicker };
