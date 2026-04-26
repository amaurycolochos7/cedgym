'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import { useAuth, postLoginPathForRole } from '@/lib/auth';
import type { ApiError } from '@/lib/schemas';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect');
  const expired = params.get('expired') === '1';
  const idle = params.get('idle') === '1';
  const { hydrateFromAuthResponse, user, loading } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [apiError, setApiError] = useState<string | null>(
    idle
      ? 'Sesión cerrada por inactividad. Inicia sesión de nuevo.'
      : expired
      ? 'Tu sesión expiró. Inicia sesión de nuevo.'
      : null,
  );

  // If we land here already authenticated (e.g. opened /login in a new tab
  // while a session is active), bounce straight to the role's landing.
  // Skip when expired/idle so the corresponding message can render.
  useEffect(() => {
    if (loading || expired || idle) return;
    if (!user) return;
    router.replace(redirect ?? postLoginPathForRole(user.role));
  }, [loading, user, expired, idle, redirect, router]);

  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (resp) => {
      hydrateFromAuthResponse(resp);
      toast.success(`¡Hola de nuevo, ${resp.user.name.split(' ')[0]}!`);
      const dest = redirect ?? postLoginPathForRole(resp.user.role);
      router.push(dest);
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: LoginInput) => {
    setApiError(null);
    // Normalize identifier: if it looks like a phone, prefix +52.
    const ident = values.identifier.trim();
    const digitsOnly = ident.replace(/\D/g, '');
    const normalized =
      digitsOnly.length === 10 && !ident.includes('@')
        ? `+52${digitsOnly}`
        : ident;
    mutation.mutate({ identifier: normalized, password: values.password });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Bienvenido de vuelta
        </h1>
        <p className="text-sm text-slate-600">
          Ingresa con tu WhatsApp o correo para continuar.
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
            htmlFor="identifier"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600"
          >
            WhatsApp
          </label>
          <input
            id="identifier"
            autoComplete="username"
            placeholder="55 1234 5678"
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            {...register('identifier')}
          />
          {formState.errors.identifier?.message && (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {formState.errors.identifier.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600"
          >
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
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
          {formState.errors.password?.message && (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {formState.errors.password.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          Iniciar sesión
        </button>
      </form>

      <p className="text-center text-sm text-slate-600">
        ¿No tienes cuenta?{' '}
        <Link
          href={
            redirect && redirect !== '/dashboard'
              ? `/register?redirect=${encodeURIComponent(redirect)}`
              : '/register'
          }
          className="font-semibold text-blue-600 transition hover:text-blue-700"
        >
          Regístrate
        </Link>
      </p>
    </div>
  );
}
