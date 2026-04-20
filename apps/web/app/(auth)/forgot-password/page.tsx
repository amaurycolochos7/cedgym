'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/form';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import type { ApiError } from '@/lib/schemas';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const { handleSubmit, formState, setValue, watch } = useForm<ForgotPasswordInput>({
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
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
          <KeyRound size={22} />
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Recupera tu contraseña
        </h1>
        <p className="text-sm text-white/60">
          Te enviaremos un código por WhatsApp para restablecerla.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormError>{apiError}</FormError>

        <Field
          id="phone"
          label="WhatsApp registrado"
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

        <Button type="submit" size="lg" loading={mutation.isPending}>
          Enviar código
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
