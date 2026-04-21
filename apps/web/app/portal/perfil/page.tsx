'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Copy,
  Share2,
  Trash2,
  Download,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Field, FormError } from '@/components/ui/form';
import type { ApiError, Relationship } from '@/lib/schemas';
import { FitnessProfileWizard } from '@/components/portal/fitness-profile-wizard';

const RELATIONSHIP_OPTIONS: { value: Relationship; label: string }[] = [
  { value: 'padre', label: 'Padre' },
  { value: 'madre', label: 'Madre' },
  { value: 'hermano', label: 'Hermano/a' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'amigo', label: 'Amigo/a' },
  { value: 'tutor', label: 'Tutor/a' },
  { value: 'otro', label: 'Otro' },
];

export default function PortalPerfilPage() {
  const qc = useQueryClient();
  const { user, refreshMe } = useAuth();

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: referrals } = useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: async () => (await api.get('/referrals/me')).data,
    retry: false,
  });

  // Datos personales
  const [fullName, setFullName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [profileApiError, setProfileApiError] = useState<string | null>(null);

  // Fitness wizard: collapsed by default if the user already has a saved
  // fitness_profile, expanded otherwise (nudge to fill it in).
  const hasFitnessProfile = !!me?.user?.fitness_profile;
  const [fitnessOpen, setFitnessOpen] = useState(false);
  useEffect(() => {
    // Once /auth/me resolves, auto-expand for users who haven't set it up.
    if (me && !hasFitnessProfile) setFitnessOpen(true);
  }, [me, hasFitnessProfile]);

  // Contacto de emergencia (10 dígitos, sin prefijo +52)
  const [ecName, setEcName] = useState('');
  const [ecRel, setEcRel] = useState<Relationship>('padre');
  const [ecPhone, setEcPhone] = useState('');
  const [ecNotes, setEcNotes] = useState('');
  const [ecError, setEcError] = useState<string | null>(null);
  const [ecApiError, setEcApiError] = useState<string | null>(null);

  // Hydrate form once /auth/me resolves.
  useEffect(() => {
    if (me?.user) {
      setFullName(me.user.full_name ?? me.user.name ?? '');
      const ec = me.user.emergency_contact;
      if (ec) {
        setEcName(ec.name ?? '');
        setEcRel((ec.relationship as Relationship) ?? 'padre');
        const digits = (ec.phone ?? '').replace(/\D/g, '').slice(-10);
        setEcPhone(digits);
        setEcNotes(ec.medical_notes ?? '');
      }
    }
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (fullName.trim()) payload.full_name = fullName.trim();
      const res = await api.patch('/auth/complete-profile', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Datos guardados.');
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      refreshMe();
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setProfileApiError(norm.message);
    },
  });

  const saveEc = useMutation({
    mutationFn: async () => {
      // NOTE: the current backend zod schema (completeProfileSchema in
      // apps/api/src/routes/auth.js) strips unknown keys, so `medical_notes`
      // is silently ignored server-side until the API adds the column.
      // We still send it so the day the API is extended it "just works".
      const res = await api.patch('/auth/complete-profile', {
        emergency_contact: {
          name: ecName.trim(),
          relationship: ecRel,
          phone: ecPhone, // ya viene en E.164 desde PhoneInput
          ...(ecNotes.trim() ? { medical_notes: ecNotes.trim() } : {}),
        },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Contacto de emergencia guardado.');
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      refreshMe();
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setEcApiError(norm.message);
    },
  });

  const onSaveProfile = () => {
    setProfileApiError(null);
    setNameError(null);
    if (fullName.trim().length < 2) {
      setNameError('Nombre demasiado corto');
      return;
    }
    saveProfile.mutate();
  };

  const onSaveEc = () => {
    setEcApiError(null);
    setEcError(null);
    if (ecName.trim().length < 2) {
      setEcError('Ingresa el nombre del contacto');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(ecPhone)) {
      setEcError('Elige país y escribe un teléfono válido');
      return;
    }
    saveEc.mutate();
  };

  const code = referrals?.code;
  const shareUrl = code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${code}`
    : '';

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copiado');
  };

  const shareWhatsapp = () => {
    if (!code) return;
    const msg = encodeURIComponent(
      `Entrena conmigo en CED·GYM. Usa mi código ${code} y obtén descuento en tu primer pago: ${shareUrl}`,
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const hasEc = !!me?.user?.emergency_contact;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Datos personales, contacto de emergencia y privacidad.
        </p>
      </div>

      {/* Perfil fitness — wizard para IA de rutinas y meal plans */}
      {fitnessOpen ? (
        <FitnessProfileWizard
          initial={
            (me?.user?.fitness_profile as Record<string, unknown> | undefined) ??
            null
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => setFitnessOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl ring-1 ring-slate-200 bg-white shadow-sm p-5 text-left transition-colors hover:ring-blue-300 hover:bg-slate-50"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Sparkles size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Perfil fitness</h2>
              {hasFitnessProfile && (
                <span className="inline-flex items-center gap-1 rounded-full ring-1 ring-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                  <CheckCircle2 size={10} /> Guardado
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {hasFitnessProfile
                ? 'Edita tus datos para regenerar rutinas y planes de comida.'
                : 'Completa 5 pasos rápidos para desbloquear rutinas con IA.'}
            </p>
          </div>
          <ChevronDown
            size={18}
            className="shrink-0 text-slate-400 transition-transform group-hover:text-slate-700"
          />
        </button>
      )}

      {/* Datos personales */}
      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Datos personales</h2>

        <FormError>{profileApiError}</FormError>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="full_name" label="Nombre completo" error={nameError ?? undefined}>
            <Input variant="light"
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={me?.user?.name ?? 'Como aparece en tu INE'}
            />
          </Field>
          <Field label="Correo">
            <div className="flex h-11 items-center rounded-xl ring-1 ring-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
              {me?.user?.email ?? '—'}
            </div>
          </Field>
          <Field label="WhatsApp">
            <div className="flex h-11 items-center rounded-xl ring-1 ring-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
              {me?.user?.phone ?? '—'}
            </div>
          </Field>
          <Field label="Rol">
            <div className="flex h-11 items-center rounded-xl ring-1 ring-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
              {me?.user?.role ?? user?.role ?? 'ATHLETE'}
            </div>
          </Field>
        </div>

        <div className="pt-1">
          <Button onClick={onSaveProfile} loading={saveProfile.isPending}>
            Guardar datos
          </Button>
        </div>
      </section>

      {/* Contacto de emergencia — single compact card */}
      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <ShieldAlert size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Contacto de emergencia</h2>
              {hasEc && (
                <span className="inline-flex items-center gap-1 rounded-full ring-1 ring-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                  <CheckCircle2 size={10} /> Guardado
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Opcional, pero muy útil en caso de una emergencia en el gym. Lo
              usamos únicamente si necesitamos contactarte en tu nombre.
            </p>
          </div>
        </div>

        <FormError>{ecError ?? ecApiError ?? undefined}</FormError>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ec_name" label="Nombre">
            <Input variant="light"
              id="ec_name"
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
              placeholder="Nombre completo"
            />
          </Field>

          <Field id="ec_rel" label="Parentesco">
            <select
              id="ec_rel"
              value={ecRel}
              onChange={(e) => setEcRel(e.target.value as Relationship)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="ec_phone" label="Teléfono">
            <PhoneInput
              id="ec_phone"
              value={ecPhone}
              onChange={setEcPhone}
            />
          </Field>

          <Field
            id="ec_notes"
            label="Notas médicas"
            hint="Alergias, padecimientos, medicamentos… (opcional)"
          >
            <textarea
              id="ec_notes"
              value={ecNotes}
              onChange={(e) => setEcNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej. alergia a la penicilina"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </Field>
        </div>

        <div className="pt-1">
          <Button onClick={onSaveEc} loading={saveEc.isPending}>
            Guardar contacto
          </Button>
        </div>
      </section>

      {/* Referidos */}
      <section className="bg-gradient-to-br from-blue-50 to-sky-50 ring-1 ring-blue-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Mi código de referidos</h2>
        <p className="text-sm text-slate-700">
          Comparte y gana $200 MXN de crédito por cada referido que se registre
          y pague.
        </p>
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-slate-500 font-semibold">Tu código</div>
            <div className="text-2xl font-mono text-blue-600 mt-1 break-all font-bold tabular-nums">
              {code ?? '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500 font-semibold">Crédito</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 tabular-nums">
              ${(referrals?.credit_mxn ?? 0).toLocaleString('es-MX')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={copyCode} disabled={!code}>
            <Copy className="w-4 h-4 mr-2" /> Copiar link
          </Button>
          <Button variant="ghost" onClick={shareWhatsapp} disabled={!code}>
            <Share2 className="w-4 h-4 mr-2" /> WhatsApp
          </Button>
        </div>
      </section>

      {/* Privacidad */}
      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Privacidad</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              (window.location.href = `${api.defaults.baseURL}/users/me/export`)
            }
          >
            <Download className="w-4 h-4 mr-2" /> Exportar mis datos
          </Button>
          <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" /> Eliminar cuenta
          </Button>
        </div>
      </section>
    </div>
  );
}
