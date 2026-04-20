'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset',
  {
    variants: {
      variant: {
        default:
          'bg-white/5 text-white/80 ring-white/10',
        brand:
          'bg-brand-orange/15 text-brand-orange ring-brand-orange/30',
        success:
          'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
        warning:
          'bg-amber-500/15 text-amber-300 ring-amber-500/30',
        danger:
          'bg-red-500/15 text-red-300 ring-red-500/30',
        info: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
        muted:
          'bg-white/5 text-white/50 ring-white/5',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
