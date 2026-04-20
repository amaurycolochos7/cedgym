'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError } from '@/components/ui/form';
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
  const { hydrateFromAuthResponse } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [apiError, setApiError] = useState<string | null>(
    idle
      ? 'Sesión cerrada por inactividad. Inicia sesión de nuevo.'
      : expired
      ? 'Tu sesión expiró. Inicia sesión de nuevo.'
      : null,
  );

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
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Bienvenido de vuelta
        </h1>
        <p className="text-sm text-white/60">
          Ingresa con tu WhatsApp o correo para continuar.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormError>{apiError}</FormError>

        <Field
          id="identifier"
          label="WhatsApp o correo"
          error={formState.errors.identifier?.message}
        >
          <Input
            id="identifier"
            autoComplete="username"
            placeholder="tu@correo.com o 55 1234 5678"
            {...register('identifier')}
          />
        </Field>

        <Field
          id="password"
          label="Contraseña"
          error={formState.errors.password?.message}
        >
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-white/50 hover:text-white"
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-brand-orange hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={mutation.isPending}>
          Iniciar sesión
        </Button>
      </form>

      <p className="text-center text-sm text-white/60">
        ¿No tienes cuenta?{' '}
        <Link
          href={
            redirect !== '/dashboard'
              ? `/register?redirect=${encodeURIComponent(redirect)}`
              : '/register'
          }
          className="font-semibold text-brand-orange hover:underline"
        >
          Regístrate
        </Link>
      </p>
    </div>
  );
}
