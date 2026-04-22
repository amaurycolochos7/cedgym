'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Eye, EyeOff, Loader2, Search, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  type Country,
  parseE164,
  toE164,
} from '@/lib/countries';
import { registerSchema, type RegisterInput } from '@/lib/schemas';
import { authApi, normalizeError } from '@/lib/api';
import { lsSetJSON, lsDelete } from '@/lib/utils';
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

/** Light-themed phone input (inlined so we don't touch the shared dark primitive). */
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

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect');
  const product = params.get('product');
  const productLabel = useMemo(() => labelForSlug(product), [product]);
  const [showPw, setShowPw] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [existsModal, setExistsModal] = useState<{
    phone: string;
    email: string;
  } | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
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
    onError: (err: unknown, vars) => {
      const norm = normalizeError(err) as ApiError;
      // Si el backend detectó teléfono/email duplicado → abrir modal con
      // la opción de recuperar contraseña en lugar de mostrar un error feo.
      if (norm.code === 'USER_EXISTS' || norm.status === 409) {
        setExistsModal({ phone: vars.phone, email: vars.email });
        setApiError(null);
        return;
      }
      setApiError(norm.message);
    },
  });

  const onSubmit = (values: RegisterInput) => {
    setApiError(null);
    mutation.mutate({
      name: values.name,
      email: values.email,
      phone: values.phone,
      password: values.password,
    });
  };

  // Dispara OTP de reset y redirige a /reset-password con el teléfono.
  const handleRecover = async () => {
    if (!existsModal) return;
    try {
      await authApi.forgotPassword({ phone: existsModal.phone });
      toast.success('Código enviado por WhatsApp');
      router.push(
        `/reset-password?phone=${encodeURIComponent(existsModal.phone)}`,
      );
    } catch (e) {
      const norm = normalizeError(e) as ApiError;
      toast.error(norm.message || 'No se pudo enviar el código');
    }
  };

  const labelClass =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';
  const inputClass =
    'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';
  const errorClass = 'mt-1.5 text-xs text-rose-600';

  if (showTerms) {
    return <TermsPanel onClose={() => setShowTerms(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700">
          Paso 1 de 2
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Crea tu cuenta
        </h1>
      </div>

      {productLabel && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <ShoppingCart size={18} className="mt-0.5 shrink-0" />
          <p>
            Completa tu registro para comprar{' '}
            <em className="font-bold not-italic">{productLabel}</em>.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            {apiError}
          </div>
        )}

        <div>
          <label htmlFor="name" className={labelClass}>
            Nombre
          </label>
          <input
            id="name"
            autoComplete="name"
            placeholder="Tu nombre"
            className={inputClass}
            {...register('name')}
          />
          {formState.errors.name?.message && (
            <p className={errorClass} role="alert">
              {formState.errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Correo electrónico{' '}
            <span className="ml-1 text-[10px] font-medium normal-case tracking-normal text-slate-400">
              (opcional)
            </span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            className={inputClass}
            {...register('email')}
          />
          {formState.errors.email?.message && (
            <p className={errorClass} role="alert">
              {formState.errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            WhatsApp (México)
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
            <p className={errorClass} role="alert">
              {formState.errors.phone.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Contraseña
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
          {formState.errors.password?.message && (
            <p className={errorClass} role="alert">
              {formState.errors.password.message}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
          />
          <span className="leading-snug">
            Acepto los{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              términos y condiciones
            </button>{' '}
            y el aviso de privacidad de CED·GYM.
          </span>
        </label>

        <button
          type="submit"
          disabled={mutation.isPending || !acceptedTerms}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          Continuar
        </button>
      </form>

      <div className="flex flex-col items-center gap-1 text-center text-sm text-slate-600">
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link
            href={
              redirect
                ? `/login?redirect=${encodeURIComponent(redirect)}`
                : '/login'
            }
            className="font-semibold text-blue-600 transition hover:text-blue-700"
          >
            Inicia sesión
          </Link>
        </p>
      </div>

      {/* Modal: teléfono/email ya tienen cuenta → ofrecer recuperación */}
      {existsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setExistsModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Ya tienes cuenta
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Ese teléfono o correo ya está registrado en CED·GYM. ¿Quieres
              recuperar tu contraseña? Te enviaremos un código por WhatsApp.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {existsModal.phone}
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleRecover}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 sm:flex-1"
              >
                Recuperar contraseña
              </button>
              <button
                type="button"
                onClick={() => setExistsModal(null)}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:flex-1"
              >
                Cancelar
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-500">
              ¿No eres tú?{' '}
              <Link
                href="/login"
                className="font-semibold text-blue-600 transition hover:text-blue-700"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Terms & Privacy panel — replaces the form inside the auth
 * card. The user closes it with the X to come back to the form
 * with their input intact (state is preserved at parent level).
 * ───────────────────────────────────────────────────────────── */
function TermsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Términos y aviso de privacidad
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Última actualización: abril 2026
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pr-1 text-sm leading-relaxed text-slate-700">
        <Section title="1. Datos que recopilamos">
          Al crear tu cuenta nos das tu nombre y número de WhatsApp (datos
          obligatorios). Si lo decides, también tu correo electrónico. Mientras
          uses la plataforma podemos guardar datos relacionados con tu
          entrenamiento (rutinas, mediciones, bioimpedancia), tu actividad en el
          gym (check-ins, asistencia a clases) y tu historial de pagos.
        </Section>

        <Section title="2. Cómo los protegemos">
          Tus datos se guardan en servidores con acceso restringido al equipo
          autorizado de CED·GYM. Las contraseñas se almacenan cifradas y la
          comunicación con la plataforma viaja siempre por HTTPS. <strong>Nunca
          vendemos ni alquilamos tu información a terceros.</strong>
        </Section>

        <Section title="3. Para qué los usamos (uso necesario)">
          Para administrar tu membresía, generar tus rutinas, controlar el
          acceso al gym vía QR, procesar pagos, emitir comprobantes y darte
          soporte por WhatsApp. Sin estos datos la plataforma no puede
          funcionar.
        </Section>

        <Section title="4. Marketing y comunicación (uso adicional)">
          Podremos enviarte por WhatsApp o correo:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Promociones y descuentos del gym y la tienda.</li>
            <li>Recordatorios de renovación de tu membresía.</li>
            <li>Contenido del coach (tips, novedades, cursos nuevos).</li>
          </ul>
          <p className="mt-2">
            Si en cualquier momento no quieres recibir comunicación de marketing,
            escríbenos al WhatsApp <strong>614 197 0660</strong> y te damos de
            baja inmediatamente. Esto no afecta tu membresía.
          </p>
        </Section>

        <Section title="5. Tus derechos sobre tus datos">
          Tienes derecho a <strong>acceder</strong> a la información que
          tenemos sobre ti, <strong>rectificarla</strong> si es incorrecta,
          <strong> cancelarla</strong> cuando ya no quieras estar en la
          plataforma, y <strong>oponerte</strong> a usos específicos (como
          marketing). Para ejercer cualquiera de estos derechos contáctanos por
          WhatsApp o en el gym. Estos derechos están protegidos por la Ley
          Federal de Protección de Datos Personales en Posesión de los
          Particulares (LFPDPPP).
        </Section>

        <Section title="6. Cambios a este aviso">
          Si actualizamos esta política te notificamos por WhatsApp. La fecha
          de "última actualización" arriba siempre refleja la versión vigente.
        </Section>

        <Section title="7. Contacto">
          <strong>CED·GYM</strong> · Av. Tecnológico, Santo Niño, Deportiva,
          Chihuahua, México · WhatsApp 614 197 0660.
        </Section>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
      >
        Entendido, volver al registro
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-bold text-slate-900">{title}</h3>
      <div className="text-[13px] text-slate-700">{children}</div>
    </div>
  );
}
