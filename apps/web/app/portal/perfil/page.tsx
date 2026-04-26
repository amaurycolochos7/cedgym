'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Trash2,
  Download,
  CheckCircle2,
  Camera,
  User as UserIcon,
  Dumbbell,
  Pencil,
  Mail,
  Phone,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ApiError } from '@/lib/schemas';
import { FitnessProfileWizard } from '@/components/portal/fitness-profile-wizard';
import { ProfileRequirements } from '@/components/portal/profile-requirements';
import { SelfieCapture } from '@/components/portal/selfie-capture';
import { COUNTRIES, DEFAULT_COUNTRY, parseE164, toE164, type Country } from '@/lib/countries';
import { cn } from '@/lib/utils';

/* Light-theme primitives — local so we don't pull the dark shared <Button>/<Input>/<Field>. */
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';
const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const LABEL_CLS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';

function LightField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {label && (
        <label htmlFor={id} className={LABEL_CLS}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

function LightFormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      {children}
    </div>
  );
}

type Tab = 'cuenta' | 'fitness';

export default function PortalPerfilPage() {
  const qc = useQueryClient();
  const { user, refreshMe } = useAuth();

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const [tab, setTab] = useState<Tab>('cuenta');

  // Datos personales — collapsed-then-edit pattern. Name + email save
  // directly via PATCH /auth/me; phone changes go through the OTP modal.
  const [editingProfile, setEditingProfile] = useState(false);
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [profileApiError, setProfileApiError] = useState<string | null>(null);

  // Phone change modal (2-step OTP flow).
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);

  // Selfie — used by staff at check-in.
  const selfieUrl: string | null = me?.user?.selfie_url ?? null;
  const [selfieOpen, setSelfieOpen] = useState(false);

  // Keep local edit state in sync with server state, BUT only while we're
  // not actively editing — otherwise typing would get overwritten on every
  // /auth/me refetch.
  useEffect(() => {
    if (me?.user && !editingProfile) {
      setFullName(me.user.full_name ?? me.user.name ?? '');
      setEmailInput(me.user.email ?? '');
    }
  }, [me, editingProfile]);

  const hasFitnessProfile = !!me?.user?.fitness_profile;
  const currentName = me?.user?.full_name ?? me?.user?.name ?? '—';
  const currentEmail: string | null = me?.user?.email ?? null;
  const currentPhone: string | null = me?.user?.phone ?? null;

  const saveProfile = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      const trimmedName = fullName.trim();
      const trimmedEmail = emailInput.trim();

      if (trimmedName && trimmedName !== currentName) {
        payload.full_name = trimmedName;
      }
      // Treat "" as "clear email" so user can drop it. null ≡ cleared.
      if (trimmedEmail !== (currentEmail ?? '')) {
        payload.email = trimmedEmail === '' ? null : trimmedEmail;
      }
      // Always send the patch — even with no field changes — so the
      // backend can mark profile_completed=true and silence the
      // "Completa tu perfil" banner.
      const res = await api.patch('/auth/me', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Datos guardados.');
      setEditingProfile(false);
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      refreshMe();
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setProfileApiError(norm.message);
    },
  });

  const onSaveProfile = () => {
    setProfileApiError(null);
    setNameError(null);
    setEmailError(null);
    const trimmedName = fullName.trim();
    const trimmedEmail = emailInput.trim();

    if (trimmedName.length < 2) {
      setNameError('Nombre demasiado corto');
      return;
    }
    // Email is optional, but if provided it must look like an email.
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Correo inválido');
      return;
    }
    saveProfile.mutate();
  };

  const onCancelEdit = () => {
    setEditingProfile(false);
    setNameError(null);
    setEmailError(null);
    setProfileApiError(null);
    setFullName(currentName === '—' ? '' : currentName);
    setEmailInput(currentEmail ?? '');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Mi perfil
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Tus datos, identificación y preferencias de entrenamiento.
        </p>
      </div>

      {/* Tabs — separan claramente el perfil básico (para comprar membresía)
          del perfil fitness (para rutinas y plan alimenticio). */}
      <div className="sticky top-14 z-20 -mx-4 sm:mx-0 bg-slate-50/95 backdrop-blur px-4 sm:px-0 pt-2 pb-3 sm:py-0 sm:static sm:bg-transparent sm:backdrop-blur-none">
        <div className="inline-flex w-full rounded-xl bg-white border border-slate-200 p-1 sm:w-auto">
          <TabButton
            active={tab === 'cuenta'}
            onClick={() => setTab('cuenta')}
            icon={<UserIcon className="h-4 w-4" />}
            label="Mi cuenta"
            hint="Datos y selfie"
          />
          <TabButton
            active={tab === 'fitness'}
            onClick={() => setTab('fitness')}
            icon={<Dumbbell className="h-4 w-4" />}
            label="Perfil fitness"
            hint="Rutinas y plan alim."
            badge={hasFitnessProfile}
          />
        </div>
      </div>

      {/* ── Tab: Mi cuenta ───────────────────────────────────── */}
      {tab === 'cuenta' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Checklist de requisitos para comprar membresía. */}
          <ProfileRequirements />

          {/* Datos personales — collapsed summary by default, form on edit.
              Name+email save inline via PATCH /auth/me. Phone change opens
              a modal because it's OTP-verified. */}
          <section
            id="datos-personales"
            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 scroll-mt-28"
          >
            {!editingProfile ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <UserIcon size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Datos personales
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {currentName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Phone size={11} /> {currentPhone ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Mail size={11} /> {currentEmail ?? 'sin correo'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  aria-label="Editar datos personales"
                >
                  <Pencil size={12} /> Editar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <SectionHeader
                  icon={<UserIcon size={18} />}
                  title="Datos personales"
                  description="El teléfono se verifica con un código de WhatsApp al nuevo número."
                />
                <LightFormError>{profileApiError}</LightFormError>

                <div className="grid gap-4 sm:grid-cols-2">
                  <LightField
                    id="full_name"
                    label="Nombre completo"
                    error={nameError ?? undefined}
                  >
                    <input
                      id="full_name"
                      className={INPUT_CLS}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Como aparece en tu INE"
                      autoComplete="name"
                    />
                  </LightField>

                  <LightField
                    id="email"
                    label="Correo (opcional)"
                    error={emailError ?? undefined}
                  >
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className={INPUT_CLS}
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                    />
                  </LightField>

                  <LightField label="WhatsApp">
                    <div className="flex h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm">
                      <span className="text-slate-700 tabular-nums">
                        {currentPhone ?? '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhoneModalOpen(true)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Cambiar
                      </button>
                    </div>
                  </LightField>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    onClick={onSaveProfile}
                    disabled={saveProfile.isPending}
                  >
                    {saveProfile.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={onCancelEdit}
                    disabled={saveProfile.isPending}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Selfie */}
          <section
            id="selfie"
            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 scroll-mt-28"
          >
            <SectionHeader
              icon={<Camera size={18} />}
              title="Selfie de identificación"
              description="El staff la usa para reconocerte en recepción. Obligatoria antes de comprar membresía."
              badge={selfieUrl ? 'Guardada' : undefined}
            />

            <div className="flex flex-wrap items-center gap-4">
              {selfieUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selfieUrl}
                  alt="Tu selfie"
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover ring-2 ring-blue-500/30"
                />
              ) : (
                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-slate-100 ring-2 ring-dashed ring-slate-300 flex items-center justify-center text-slate-400">
                  <Camera size={24} />
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelfieOpen(true)}
                className={BTN_PRIMARY}
              >
                <Camera className="w-4 h-4" />
                {selfieUrl ? 'Cambiar selfie' : 'Subir selfie'}
              </button>
            </div>
          </section>


          {/* Privacidad */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-3">
            <SectionHeader
              title="Privacidad"
              description="Exporta o elimina tu información personal."
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN_GHOST}
                onClick={() => (window.location.href = `${api.defaults.baseURL}/users/me/export`)}
              >
                <Download className="w-4 h-4" /> Exportar mis datos
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-rose-300 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 min-h-[44px]"
              >
                <Trash2 className="w-4 h-4" /> Eliminar cuenta
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Perfil fitness ──────────────────────────────── */}
      {tab === 'fitness' && (
        <div>
          <FitnessProfileWizard
            initial={
              (me?.user?.fitness_profile as Record<string, unknown> | undefined) ?? null
            }
          />
        </div>
      )}

      {selfieOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setSelfieOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white ring-1 ring-slate-200 shadow-xl rounded-2xl p-6 w-full max-w-md"
          >
            <SelfieCapture
              onSuccess={() => {
                setSelfieOpen(false);
                qc.invalidateQueries({ queryKey: ['auth', 'me'] });
                refreshMe();
              }}
              onCancel={() => setSelfieOpen(false)}
            />
          </div>
        </div>
      )}

      {phoneModalOpen && (
        <PhoneChangeModal
          currentPhone={currentPhone}
          onClose={() => setPhoneModalOpen(false)}
          onSuccess={() => {
            setPhoneModalOpen(false);
            qc.invalidateQueries({ queryKey: ['auth', 'me'] });
            refreshMe();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-50',
      )}
    >
      <span className={cn(active ? 'text-white' : 'text-blue-600')}>{icon}</span>
      <span className="flex flex-col leading-tight items-start">
        <span>{label}</span>
        {hint && (
          <span
            className={cn(
              'text-[10px] font-normal',
              active ? 'text-blue-100' : 'text-slate-400',
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {badge && (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
            active ? 'bg-white text-blue-600' : 'bg-emerald-500 text-white',
          )}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  badge,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 size={10} /> {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{description}</p>}
      </div>
    </div>
  );
}

/* ─── Phone change modal ─────────────────────────────────────────
   Two-step OTP flow: (1) ask for the new phone → POST /auth/phone/change/start
   sends a WhatsApp code to that number; (2) ask for the 6-digit code
   → /auth/phone/change/confirm updates user.phone. The modal picks up
   the current country from the existing phone for better UX defaults. */
function PhoneChangeModal({
  currentPhone,
  onClose,
  onSuccess,
}: {
  currentPhone: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const parsedCurrent = parseE164(currentPhone ?? '');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<Country>(
    parsedCurrent.country ?? DEFAULT_COUNTRY,
  );
  const [nationalDigits, setNationalDigits] = useState('');
  const [code, setCode] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submittedPhone, setSubmittedPhone] = useState('');

  const e164 = toE164(country, nationalDigits);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/phone/change/start', { new_phone: e164 });
      return res.data;
    },
    onSuccess: () => {
      setSubmittedPhone(e164);
      setStep('code');
      toast.success('Código enviado por WhatsApp al nuevo número.');
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/phone/change/confirm', {
        new_phone: submittedPhone,
        code,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Teléfono actualizado.');
      onSuccess();
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const onSendCode = () => {
    setApiError(null);
    setFieldError(null);
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      setFieldError('Teléfono inválido');
      return;
    }
    if (e164 === currentPhone) {
      setFieldError('Es el mismo número que ya tienes registrado');
      return;
    }
    startMutation.mutate();
  };

  const onConfirmCode = () => {
    setApiError(null);
    setFieldError(null);
    if (!/^\d{6}$/.test(code)) {
      setFieldError('El código debe ser de 6 dígitos');
      return;
    }
    confirmMutation.mutate();
  };

  const busy = startMutation.isPending || confirmMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white ring-1 ring-slate-200 shadow-xl rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {step === 'phone' ? 'Cambiar teléfono' : 'Verifica el nuevo número'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === 'phone'
                ? 'Te enviaremos un código por WhatsApp al nuevo número.'
                : `Código enviado a ${submittedPhone}. Revisa tu WhatsApp.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <LightFormError>{apiError}</LightFormError>

        {step === 'phone' ? (
          <div className="space-y-3">
            <LightField
              label="Nuevo teléfono"
              error={fieldError ?? undefined}
              hint={
                currentPhone
                  ? `Actual: ${currentPhone}`
                  : 'Selecciona país y escribe el número.'
              }
            >
              <div className="flex h-12 w-full items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <select
                  aria-label="Código de país"
                  value={country.code}
                  onChange={(e) => {
                    const next =
                      COUNTRIES.find((c) => c.code === e.target.value) ??
                      DEFAULT_COUNTRY;
                    setCountry(next);
                  }}
                  className="h-full border-r border-slate-200 bg-slate-50 px-2 text-sm text-slate-700 focus:outline-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={`${c.code}-${c.dial}`} value={c.code}>
                      {c.flag} {c.dial}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder={country.code === 'MX' ? '55 1234 5678' : 'Número'}
                  value={nationalDigits}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
                    setNationalDigits(digits);
                  }}
                  className="flex-1 bg-transparent px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                  autoFocus
                />
              </div>
            </LightField>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50 min-h-[44px] flex-1"
                onClick={onSendCode}
                disabled={busy || !nationalDigits}
              >
                {startMutation.isPending ? 'Enviando…' : 'Enviar código'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <LightField
              label="Código de 6 dígitos"
              error={fieldError ?? undefined}
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg font-mono tracking-[0.4em] text-slate-900 placeholder-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
                autoFocus
              />
            </LightField>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setApiError(null);
                  setFieldError(null);
                }}
                disabled={busy}
              >
                Atrás
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50 min-h-[44px] flex-1"
                onClick={onConfirmCode}
                disabled={busy || code.length !== 6}
              >
                {confirmMutation.isPending ? 'Verificando…' : 'Verificar y guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
