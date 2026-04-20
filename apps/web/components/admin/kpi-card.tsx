'use client';

import Link from 'next/link';
import {
  type LucideIcon,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  /** Percentage delta vs. previous period (signed). */
  delta?: number;
  /** Small text under the value (e.g. "vs. last month"). */
  hint?: string;
  /** If set, the card becomes a clickable Link. */
  href?: string;
  className?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  href,
  className,
}: KpiCardProps) {
  const positive = typeof delta === 'number' && delta >= 0;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:text-[11px]">
          {label}
        </div>
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange ring-1 ring-brand-orange/20 sm:h-9 sm:w-9">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 truncate text-xl font-bold text-white sm:text-2xl md:text-3xl">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {typeof delta === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              positive
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-red-500/15 text-red-300',
            )}
          >
            {positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {positive ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-white/40">{hint}</span>}
      </div>
      {href && (
        <div className="absolute right-3 top-3 text-white/20 transition group-hover:text-brand-orange">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      )}
    </>
  );

  const base =
    'relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-3 sm:p-5';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'group block transition-all hover:border-brand-orange/50 hover:from-white/[0.07] hover:shadow-[0_0_30px_rgba(255,107,26,0.08)] focus:outline-none focus:ring-2 focus:ring-brand-orange/40',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{body}</div>;
}
