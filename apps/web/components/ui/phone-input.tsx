'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PhoneInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'value' | 'type'
  > {
  value?: string;
  onChange?: (value: string) => void;
  error?: boolean;
}

/** Formats raw 10-digit MX number as "55 1234 5678". */
export function formatMxDisplay(digits: string): string {
  const d = digits.slice(0, 10);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 6);
  const p3 = d.slice(6, 10);
  return [p1, p2, p3].filter(Boolean).join(' ');
}

/**
 * MX-only phone input. Stores a raw 10-digit string (no spaces) via onChange,
 * but renders a formatted version and a fixed "+52" prefix.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, error, className, ...rest }, ref) => {
    const display = formatMxDisplay(value);
    return (
      <div
        className={cn(
          'flex h-11 w-full items-stretch overflow-hidden rounded-xl border border-white/10 bg-input/60 focus-within:border-brand-orange/60 focus-within:ring-2 focus-within:ring-brand-orange/30',
          error && 'border-red-400/60 focus-within:border-red-400 focus-within:ring-red-400/30',
          className,
        )}
      >
        <span className="flex items-center gap-1 border-r border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/80">
          <span aria-hidden>🇲🇽</span>
          <span>+52</span>
        </span>
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="55 1234 5678"
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
            onChange?.(raw);
          }}
          className="flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          {...rest}
        />
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
