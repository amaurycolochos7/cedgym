'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import { registerSchema, type RegisterInput } from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import {
  lsSetJSON,
  lsDelete,
} from '@/lib/utils';
import {
  POST_REGISTER_REDIRECT_KEY,
  type PostRegisterRedirect,
} from '@/lib/auth';
import type { ApiError } from '@/lib/schemas';

const PRODUCT_LABELS: Record<string, string> = {
  'powerlifting-12w': 'Powerlifting 12 Weeks',
  'boxing-foundations': 'Boxing Foundations',
  'football-elite': 'Football Élite',
};

function labelForSlug(slug?: string | null): string | undefined {
  if (!slug) return undefined;
  return (
    PRODUCT_LABELS[slug] ??
    slug
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect');
  const product = params.get('product');
  const productLabel = useMemo(() => labelForSlug(product), [product]);
  const [showPw, setShowPw] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { register, handleSubmit, setValue, watch, formState } = form;
  const phone = watch('phone');

  // Persist redirect intent for 24h so /verify can pick it up post-OTP.
  useEffect(() => {
    if (redirect) {
      const payload: PostRegisterRedirect = {
        path: redirect,
        productSlug: product ?? undefined,
        productLabel,
      };
      lsSetJSON(POST_REGISTER_REDIRECT_KEY, payload, 24 * 60 * 60 * 1000);
    } else {
      lsDelete(POST_REGISTER_REDIRECT_KEY);
    }
  }, [redirect, product, productLabel]);

  const mutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (_data, vars) => {
      toast.success('Cuenta creada. Te enviamos un código por WhatsApp.');
      router.push(`/verify?phone=${encodeURIComponent(vars.phone)}`);
    },
    onError: (err: unknown) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: RegisterInput) => {
    setApiError(null);
    mutation.mutate({
      name: values.name,
      email: values.email,
      phone: `+52${values.phone}`,
      password: values.password,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Crea tu cuenta
        </h1>
        <p className="text-sm text-white/60">
          Un perfil, todos los deportes. Empieza en menos de 1 minuto.
        </p>
      </div>

      {productLabel && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-orange/30 bg-brand-orange/10 px-4 py-3 text-sm text-brand-orange">
          <ShoppingCart size={18} className="mt-0.5 shrink-0" />
          <p>
            Completa tu registro para comprar{' '}
            <em className="font-bold not-italic">{productLabel}</em>.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormError>{apiError}</FormError>

        <Field
          id="name"
          label="Nombre"
          error={formState.errors.name?.message}
        >
          <Input
            id="name"
            autoComplete="name"
            placeholder="Tu nombre"
            {...register('name')}
          />
        </Field>

        <Field
          id="email"
          label="Correo electrónico"
          error={formState.errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            {...register('email')}
          />
        </Field>

        <Field
          id="phone"
          label="WhatsApp (México)"
          hint="Te enviaremos un código de verificación."
          error={formState.errors.phone?.message}
        >
          <PhoneInput
            id="phone"
            value={phone}
            onChange={(v) =>
              setValue('phone', v, { shouldValidate: true, shouldDirty: true })
            }
            error={!!formState.errors.phone}
          />
        </Field>

        <Field
          id="password"
          label="Contraseña"
          hint="Mínimo 8 caracteres, con mayúscula y número."
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
          label="Confirmar contraseña"
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
          Crear cuenta
        </Button>
      </form>

      <div className="flex flex-col items-center gap-1 text-center text-sm text-white/60">
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link
            href={
              redirect
                ? `/login?redirect=${encodeURIComponent(redirect)}`
                : '/login'
            }
            className="font-semibold text-brand-orange hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
