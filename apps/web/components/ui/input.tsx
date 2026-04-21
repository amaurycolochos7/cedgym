'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * 'dark' (default) — for auth, landing, admin (dark navy surfaces).
   * 'light' — for the portal redesign (white cards, slate-900 text).
   */
  variant?: 'dark' | 'light';
}

const VARIANTS = {
  dark:
    'border border-white/10 bg-input/60 text-foreground shadow-inner placeholder:text-muted-foreground ' +
    'focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/30',
  light:
    'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', variant = 'dark', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl px-4 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          VARIANTS[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
