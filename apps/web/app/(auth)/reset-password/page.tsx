'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OtpInput } from '@/components/ui/otp-input';
import { Field, FormError } from '@/components/ui/form';
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import type { ApiError } from '@/lib/schemas';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const rawPhone = params.get('phone') ?? '';
  const phoneDigits = rawPhone.replace(/\D/g, '').slice(-10);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState,
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      phone: phoneDigits,
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
      phone: `+52${values.phone}`,
      code: values.code,
      password: values.password,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Nueva contraseña
        </h1>
        <p className="text-sm text-white/60">
          Ingresa el código que te enviamos por WhatsApp y tu nueva contraseña.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormError>{apiError}</FormError>

        <DevOtpHint phone={`+52${phoneDigits}`} purpose="PASSWORD_RESET" />

        <Field label="Código de 6 dígitos" error={formState.errors.code?.message}>
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <OtpInput
                value={field.value}
                onChange={field.onChange}
                autoFocus
              />
            )}
          />
        </Field>

        <Field
          id="password"
          label="Nueva contraseña"
          hint="Mínimo 8 caracteres, mayúscula y número."
          error={formState.errors.password?.message}
        >
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
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

        <Field
          id="confirmPassword"
          label="Confirmar nueva contraseña"
          error={formState.errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            {...register('confirmPassword')}
          />
        </Field>

        <Button type="submit" size="lg" loading={mutation.isPending}>
          Restablecer contraseña
        </Button>
      </form>

      <p className="text-center text-sm text-white/60">
        <Link
          href="/login"
          className="font-semibold text-brand-orange hover:underline"
        >
          ← Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}

// Dev-only hint — mirror of the component on /verify. When the WhatsApp
// bot isn't paired locally the API still logs the code to stdout with a
// `[OTP DEV]` prefix; this tells the dev to look there instead of
// staring at an input waiting for a message that never comes.
function DevOtpHint({
  phone,
  purpose,
}: {
  phone: string;
  purpose: 'REGISTER' | 'PASSWORD_RESET';
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isDevEnv = process.env.NEXT_PUBLIC_ENV === 'development';
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    setVisible(isDevEnv || isLocal);
  }, []);
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-100">
      <p className="font-semibold text-blue-200">Modo dev</p>
      <p className="mt-1 leading-relaxed">
        El código real está en los logs del servidor API (stdout). Busca
        una línea como{' '}
        <code className="rounded bg-black/40 px-1 py-0.5">[OTP DEV]</code>{' '}
        con <code className="px-1">phone={phone}</code>{' '}
        <code className="px-1">purpose={purpose}</code> y copia los 6
        dígitos aquí.
      </p>
    </div>
  );
}
