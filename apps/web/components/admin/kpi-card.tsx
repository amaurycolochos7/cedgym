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
      <div className="flex items-start justify-between gap-2">
        {Icon ? (
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        {href && (
          <div className="text-slate-300 transition group-hover:text-blue-600">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-3 truncate text-3xl font-bold text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {(typeof delta === 'number' || hint) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {typeof delta === 'number' && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold',
                positive ? 'text-emerald-600' : 'text-rose-600',
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
          {hint && <span className="text-slate-500">{hint}</span>}
        </div>
      )}
    </>
  );

  const base =
    'relative rounded-2xl border border-slate-200 bg-white p-5';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'group block transition hover:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-100',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{body}</div>;
}
