'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError, Label } from '@/components/ui/form';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  completeProfileSchema,
  type CompleteProfileInput,
  type Gender,
  type Relationship,
} from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import { ageFromISO } from '@/lib/utils';
import type { ApiError } from '@/lib/schemas';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no decir' },
];

const RELATIONSHIP_OPTIONS: { value: Relationship; label: string }[] = [
  { value: 'padre', label: 'Padre' },
  { value: 'madre', label: 'Madre' },
  { value: 'hermano', label: 'Hermano/a' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'amigo', label: 'Amigo/a' },
  { value: 'tutor', label: 'Tutor/a' },
  { value: 'otro', label: 'Otro' },
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      fullName: '',
      birthDate: '',
      gender: 'prefiero_no_decir',
      emergencyContact: undefined,
    },
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState,
  } = form;

  const birthDate = watch('birthDate');
  const emergencyContact = watch('emergencyContact');
  const age = useMemo(() => ageFromISO(birthDate), [birthDate]);
  const isMinor = age !== null && age >= 0 && age < 18;

  const mutation = useMutation({
    mutationFn: authApi.completeProfile,
    onSuccess: () => {
      toast.success('Perfil actualizado.');
      router.push('/dashboard');
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: CompleteProfileInput) => {
    setApiError(null);
    mutation.mutate(values);
  };

  const onSkip = () => {
    if (isMinor) {
      toast.error(
        'Los menores de 18 años deben registrar un contacto de emergencia.',
      );
      return;
    }
    // Mark profile as skipped so dashboard can show the banner.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cedgym_profile_skipped', '1');
    }
    router.push('/dashboard');
  };

  // Ensure emergencyContact gets instantiated when minor is detected.
  const ensureEcExists = () => {
    if (!emergencyContact) {
      setValue(
        'emergencyContact',
        { name: '', relationship: 'padre', phone: '' },
        { shouldDirty: true },
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <span className="mx-auto inline-block rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-brand-orange">
          Paso 3 de 3
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Completa tu perfil
        </h1>
        <p className="text-sm text-white/60">
          Datos opcionales que nos ayudan a personalizar tu experiencia.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormError>{apiError}</FormError>

        <Field
          id="fullName"
          label="Nombre completo"
          error={formState.errors.fullName?.message}
        >
          <Input
            id="fullName"
            placeholder="Como aparece en tu INE"
            autoComplete="name"
            {...register('fullName')}
          />
        </Field>

        <Field
          id="birthDate"
          label="Fecha de nacimiento"
          error={formState.errors.birthDate?.message}
          hint={
            age !== null && age >= 0
              ? `Edad: ${age} años`
              : 'Formato: día / mes / año'
          }
        >
          <Input
            id="birthDate"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            {...register('birthDate', {
              onChange: (e) => {
                const v = e.target.value;
                const a = ageFromISO(v);
                if (a !== null && a < 18) ensureEcExists();
              },
            })}
          />
        </Field>

        <Field label="Género" error={formState.errors.gender?.message}>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GENDER_OPTIONS.map((opt) => {
                  const selected = field.value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? 'border-brand-orange bg-brand-orange/20 text-brand-orange'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </Field>

        {isMinor && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>
              Detectamos que eres menor de 18 años. Por tu seguridad necesitamos
              un contacto de emergencia.
            </p>
          </div>
        )}

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-widest text-white/60">
            Contacto de emergencia {isMinor && '(obligatorio)'}
          </legend>

          <Field
            id="ec-name"
            label="Nombre"
            error={formState.errors.emergencyContact?.name?.message}
          >
            <Input
              id="ec-name"
              placeholder="Nombre completo"
              {...register('emergencyContact.name')}
            />
          </Field>

          <Field
            label="Parentesco"
            error={formState.errors.emergencyContact?.relationship?.message}
          >
            <Controller
              control={control}
              name="emergencyContact.relationship"
              render={({ field }) => (
                <select
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  className="h-11 w-full rounded-xl border border-white/10 bg-input/60 px-3 text-sm text-foreground focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                >
                  <option value="" disabled>
                    Selecciona una opción
                  </option>
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>

          <Field
            id="ec-phone"
            label="Teléfono"
            error={formState.errors.emergencyContact?.phone?.message}
          >
            <Controller
              control={control}
              name="emergencyContact.phone"
              render={({ field }) => (
                <PhoneInput
                  id="ec-phone"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  error={!!formState.errors.emergencyContact?.phone}
                />
              )}
            />
          </Field>
        </fieldset>

        {formState.errors.emergencyContact &&
          !formState.errors.emergencyContact.name &&
          !formState.errors.emergencyContact.phone && (
            <p className="text-xs text-red-400">
              {/* top-level custom error from superRefine */}
              {formState.errors.emergencyContact.message as string}
            </p>
          )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Button type="submit" size="lg" className="flex-1" loading={mutation.isPending}>
            Completar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onSkip}
            disabled={isMinor || mutation.isPending}
            className="flex-1"
          >
            Saltar por ahora
          </Button>
        </div>
      </form>
    </div>
  );
}
