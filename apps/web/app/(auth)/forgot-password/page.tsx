'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, KeyRound, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  type Country,
  parseE164,
  toE164,
} from '@/lib/countries';
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import type { ApiError } from '@/lib/schemas';

function formatPhoneDisplay(digits: string, country: Country): string {
  const d = digits.slice(0, 15);
  if (country.code === 'MX' || country.digits === 10) {
    return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)]
      .filter(Boolean)
      .join(' ');
  }
  const groups: string[] = [];
  let i = 0;
  while (i < d.length) {
    groups.push(d.slice(i, i + 3));
    i += 3;
  }
  return groups.filter(Boolean).join(' ');
}

function LightPhoneInput({
  id,
  value,
  onChange,
  error,
}: {
  id?: string;
  value: string;
  onChange: (e164: string) => void;
  error?: boolean;
}) {
  const parsed = useMemo(() => parseE164(value), [value]);
  const [country, setCountry] = useState<Country>(
    parsed.country || DEFAULT_COUNTRY,
  );
  useEffect(() => {
    if (value && parsed.country.code !== country.code) {
      setCountry(parsed.country);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const national = parsed.national;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const emit = (newCountry: Country, newDigits: string) => {
    onChange(toE164(newCountry, newDigits));
  };

  const borderClass = error
    ? 'border-rose-300 focus-within:border-rose-500 focus-within:ring-rose-100'
    : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-blue-100';

  return (
    <div className="relative">
      <div
        className={`flex min-h-[48px] w-full items-stretch overflow-hidden rounded-xl border bg-white transition focus-within:ring-4 ${borderClass}`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          aria-label="Seleccionar país"
        >
          <span aria-hidden>{country.flag}</span>
          <span>{country.dial}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={country.code === 'MX' ? '55 1234 5678' : 'Número'}
          value={formatPhoneDisplay(national, country)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 15);
            emit(country, raw);
          }}
          className="flex-1 bg-transparent px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
        />
      </div>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setSearch('');
            }}
            aria-hidden
          />
          <div className="absolute left-0 right-0 top-[52px] z-50 max-h-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar país o código…"
                autoFocus
                className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
              />
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-slate-500">
                  Sin resultados
                </li>
              )}
              {filtered.map((c) => (
                <li key={`${c.code}-${c.dial}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setCountry(c);
                      emit(c, national);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-slate-50 ${
                      c.code === country.code
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-base">
                        {c.flag}
                      </span>
                      <span className="font-medium">{c.name}</span>
                    </span>
                    <span className="font-mono text-slate-500">{c.dial}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const { handleSubmit, formState, setValue, watch } =
    useForm<ForgotPasswordInput>({
      resolver: zodResolver(forgotPasswordSchema),
      defaultValues: { phone: '' },
    });
  const phone = watch('phone');

  const mutation = useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: (_data, vars) => {
      toast.success('Código enviado por WhatsApp.');
      router.push(`/reset-password?phone=${encodeURIComponent(vars.phone)}`);
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: ForgotPasswordInput) => {
    setApiError(null);
    mutation.mutate({ phone: values.phone });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <KeyRound size={22} />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Recupera tu contraseña
        </h1>
        <p className="text-sm text-slate-600">
          Te enviaremos un código por WhatsApp para restablecerla.
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
          <label
            htmlFor="phone"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600"
          >
            WhatsApp registrado
          </label>
          <LightPhoneInput
            id="phone"
            value={phone}
            onChange={(v) =>
              setValue('phone', v, { shouldValidate: true, shouldDirty: true })
            }
            error={!!formState.errors.phone}
          />
          {formState.errors.phone?.message && (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {formState.errors.phone.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          Enviar código
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
