'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl border border-white/10 bg-input/60 px-4 py-2 text-sm text-foreground shadow-inner placeholder:text-muted-foreground focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
