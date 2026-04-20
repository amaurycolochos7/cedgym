'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'text-xs font-semibold uppercase tracking-widest text-white/70',
        className,
      )}
      {...props}
    />
  );
}

interface FieldProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {typeof error === 'string' ? error : error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200',
        className,
      )}
    >
      {children}
    </div>
  );
}
