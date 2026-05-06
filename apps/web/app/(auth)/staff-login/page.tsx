'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import { useAuth, postLoginPathForRole } from '@/lib/auth';
import type { ApiError } from '@/lib/schemas';

/**
 * Login dedicado para staff (SUPERADMIN, ADMIN, RECEPTIONIST).
 *
 * Lo separamos del /login de socios para que cada uno tenga el
 * teclado nativo correcto en mobile:
 *   - Socios → /login         → input type="tel" (numérico)
 *   - Staff  → /staff-login   → input type="email" (alfa)
 *
 * El backend (POST /auth/login) acepta tanto teléfono como correo en
 * el campo `identifier`, así que no hay que tocar el endpoint —
 * solo cambia la copy + el tipo de input.
 *
 * Después del login, postLoginPathForRole redirige según el rol:
 *   SUPERADMIN/ADMIN  → /admin/dashboard
 *   RECEPTIONIST      → /staff/scan
 *   ATHLETE           → /portal/dashboard (caso edge: si un socio
 *                        entra aquí con su correo, igual lo manda
 *                        al portal correcto).
 */
export default function StaffLoginPage() {
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

  // Si caemos aquí con sesión activa, ir directo al landing del rol.
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
    // Staff acepta correo o teléfono. Detectamos por el contenido:
    //   - si tiene @ → es correo, lo bajamos a minúsculas
    //   - si son puros dígitos (10 o más) → es teléfono, prefijamos +52
    //   - cualquier otra cosa → tal cual, que el backend decida
    const raw = values.identifier.trim();
    let identifier = raw;
    if (raw.includes('@')) {
      identifier = raw.toLowerCase();
    } else {
      const digitsOnly = raw.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        identifier = `+52${digitsOnly}`;
      } else if (digitsOnly.length >= 11) {
        identifier = `+${digitsOnly}`;
      }
    }
    mutation.mutate({ identifier, password: values.password });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Acceso staff
        </h1>
        <p className="text-sm text-slate-600">
          Para administradores y recepción. Ingresa con tu correo o teléfono.
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
            Correo o teléfono
          </label>
          <input
            id="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="tu@cedgym.mx"
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

      <p className="text-center text-[11px] text-slate-400">
        ¿Eres socio del gym?{' '}
        <Link
          href="/login"
          className="font-semibold text-slate-500 hover:text-slate-700"
        >
          Inicia sesión aquí →
        </Link>
      </p>
    </div>
  );
}
