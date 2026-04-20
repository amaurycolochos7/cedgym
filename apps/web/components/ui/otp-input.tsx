'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Accessible 6-digit OTP input. Supports:
 *  - typing 0-9, auto-advance
 *  - Backspace: clear current, else move back
 *  - ArrowLeft/ArrowRight navigation
 *  - Paste: fills from the focused index forward
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  className,
  ariaLabel = 'Código de verificación',
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const emit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const setDigitAt = (idx: number, digit: string) => {
    const chars = value.split('');
    while (chars.length < length) chars.push('');
    chars[idx] = digit;
    emit(chars.join(''));
  };

  const focusIdx = (idx: number) => {
    const clamped = Math.max(0, Math.min(length - 1, idx));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  const handleChange = (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigitAt(idx, '');
      return;
    }
    // Type a single digit.
    if (raw.length === 1) {
      setDigitAt(idx, raw);
      focusIdx(idx + 1);
      return;
    }
    // User typed / pasted multiple chars into one box.
    const chars = value.split('');
    while (chars.length < length) chars.push('');
    for (let i = 0; i < raw.length && idx + i < length; i += 1) {
      chars[idx + i] = raw[i];
    }
    emit(chars.join(''));
    focusIdx(Math.min(idx + raw.length, length - 1));
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace') {
      if (value[idx]) {
        setDigitAt(idx, '');
      } else if (idx > 0) {
        focusIdx(idx - 1);
        setDigitAt(idx - 1, '');
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusIdx(idx - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusIdx(idx + 1);
    }
  };

  const handlePaste = (
    idx: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!paste) return;
    e.preventDefault();
    const chars = value.split('');
    while (chars.length < length) chars.push('');
    for (let i = 0; i < paste.length && idx + i < length; i += 1) {
      chars[idx + i] = paste[i];
    }
    emit(chars.join(''));
    focusIdx(Math.min(idx + paste.length, length - 1));
  };

  return (
    <div
      className={cn('flex items-center justify-center gap-2 sm:gap-3', className)}
      role="group"
      aria-label={ariaLabel}
    >
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete="one-time-code"
          disabled={disabled}
          value={value[idx] ?? ''}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={(e) => handlePaste(idx, e)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Dígito ${idx + 1}`}
          className="h-14 w-11 rounded-xl border border-white/10 bg-input/70 text-center text-2xl font-bold text-white shadow-inner focus:border-brand-orange/70 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 sm:h-16 sm:w-14 sm:text-3xl"
        />
      ))}
    </div>
  );
}
