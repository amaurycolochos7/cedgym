'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal native <select> wrapper styled to match the rest of the admin UI.
 * We skip Radix primitives for now to keep bundle lean — can swap later.
 */
export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-lg border border-white/10 bg-input/60 px-3 text-sm text-white focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
