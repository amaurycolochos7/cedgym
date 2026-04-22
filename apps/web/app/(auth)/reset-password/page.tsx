'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import type { ApiError } from '@/lib/schemas';

/** Light-themed OTP input (inlined to avoid touching the shared dark primitive). */
function LightOtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
}: {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
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

  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3"
      role="group"
      aria-label="Código de verificación"
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
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '');
            if (!raw) {
              setDigitAt(idx, '');
              return;
            }
            if (raw.length === 1) {
              setDigitAt(idx, raw);
              focusIdx(idx + 1);
              return;
            }
            const chars = value.split('');
            while (chars.length < length) chars.push('');
            for (let i = 0; i < raw.length && idx + i < length; i += 1) {
              chars[idx + i] = raw[i];
            }
            emit(chars.join(''));
            focusIdx(Math.min(idx + raw.length, length - 1));
          }}
          onKeyDown={(e) => {
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
          }}
          onPaste={(e) => {
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
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Dígito ${idx + 1}`}
          className="h-14 w-11 rounded-xl border border-slate-300 bg-white text-center text-2xl font-bold text-slate-900 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50 sm:h-16 sm:w-14 sm:text-3xl"
        />
      ))}
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  // El query `phone` ya viene en E.164 desde el flujo de registro / modal.
  const rawPhone = params.get('phone') ?? '';
  const e164Phone = rawPhone.startsWith('+')
    ? rawPhone
    : `+${rawPhone.replace(/\D/g, '')}`;
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, control, formState } =
    useForm<ResetPasswordInput>({
      resolver: zodResolver(resetPasswordSchema),
      defaultValues: {
        phone: e164Phone,
        code: '',
        password: '',
        confirmPassword: '',
      },
    });

  const mutation = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Contraseña actualizada. Inicia sesión.');
      router.push('/login');
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: ResetPasswordInput) => {
    setApiError(null);
    mutation.mutate({
      phone: values.phone,
      code: values.code,
      password: values.password,
    });
  };

  const labelClass =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';
  const inputClass =
    'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Nueva contraseña
        </h1>
        <p className="text-sm text-slate-600">
          Ingresa el código que te enviamos por WhatsApp y tu nueva contraseña.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            {apiError}
          </div>
        )}

        <div>
          <label className={labelClass}>Código de 6 dígitos</label>
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <LightOtpInput
                value={field.value}
                onChange={field.onChange}
                autoFocus
              />
            )}
          />
          {formState.errors.code?.message && (
            <p className="mt-1.5 text-center text-xs text-rose-600" role="alert">
              {formState.errors.code.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-600"
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {formState.errors.password?.message ? (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {formState.errors.password.message}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              Mínimo 8 caracteres, mayúscula y número.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirmar nueva contraseña
          </label>
          <input
            id="confirmPassword"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
            {...register('confirmPassword')}
          />
          {formState.errors.confirmPassword?.message && (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {formState.errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          Restablecer contraseña
        </button>
      </form>

      <p className="text-center text-sm text-slate-600">
        <Link
          href="/login"
          className="font-semibold text-blue-600 transition hover:text-blue-700"
        >
          ← Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}

