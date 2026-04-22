'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const SPECIALTIES = [
  'Football',
  'Boxing',
  'MMA',
  'Powerlifting',
  'Crossfit',
  'Weightlifting',
  'General fitness',
  'Running',
  'Nutrición',
  'Otro',
];

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';

export default function TrainerProfilePage() {
  const { user, refreshMe } = useAuth();

  // Basic info
  const [name, setName] = React.useState(user?.name ?? '');
  const [bio, setBio] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatar_url ?? '');

  // Banking (stubbed into user.metadata — backend may ignore until payout
  // model lands; we still send it so nothing is lost in the UI).
  const [rfc, setRfc] = React.useState('');
  const [clabe, setClabe] = React.useState('');
  const [bank, setBank] = React.useState('');

  // Specialties (tags).
  const [tags, setTags] = React.useState<string[]>([]);
  const [customTag, setCustomTag] = React.useState('');

  // Password
  const [pwCurrent, setPwCurrent] = React.useState('');
  const [pwNext, setPwNext] = React.useState('');
  const [pwConfirm, setPwConfirm] = React.useState('');

  React.useEffect(() => {
    if (user) {
      setName(user.name);
      if (user.avatar_url) setAvatarUrl(user.avatar_url);
    }
  }, [user]);

  const saveProfile = useMutation({
    mutationFn: () =>
      portalApi.updateProfile({
        name,
        avatar_url: avatarUrl || null,
        metadata: {
          bio,
          specialties: tags,
          banking: {
            rfc: rfc || null,
            clabe: clabe || null,
            bank: bank || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success('Perfil actualizado');
      await refreshMe();
    },
    onError: () => toast.error('No se pudo guardar el perfil'),
  });

  const changePw = useMutation({
    mutationFn: () =>
      portalApi.changePassword({ current: pwCurrent, next: pwNext }),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setPwCurrent('');
      setPwNext('');
      setPwConfirm('');
    },
    onError: () => toast.error('No se pudo cambiar la contraseña'),
  });

  const toggleTag = (t: string) =>
    setTags((tt) => (tt.includes(t) ? tt.filter((x) => x !== t) : [...tt, t]));

  const addCustom = () => {
    const t = customTag.trim();
    if (!t || tags.includes(t)) return;
    setTags((tt) => [...tt, t]);
    setCustomTag('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Perfil</h1>
        <p className="text-sm text-slate-600">
          Actualiza tus datos públicos, pago de payouts y credenciales.
        </p>
      </div>

      {/* ─── Basic info ──────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Datos básicos
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nombre">
            <input
              className={INPUT_CLS}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Foto (URL)">
            <input
              className={INPUT_CLS}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…/foto.jpg"
            />
          </Field>
          <Field label="Bio" className="md:col-span-2">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Breve descripción visible en tu perfil público."
              className="flex w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </Field>
        </div>
      </section>

      {/* ─── Banking ─────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Datos bancarios
          </h2>
          <p className="text-[11px] text-slate-500">
            Usados para liquidar tus payouts. Tu información se guarda cifrada.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="RFC">
            <input
              className={INPUT_CLS}
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              placeholder="XAXX010101000"
            />
          </Field>
          <Field label="Banco">
            <input
              className={INPUT_CLS}
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="BBVA"
            />
          </Field>
          <Field label="CLABE (18 dígitos)">
            <input
              className={INPUT_CLS}
              value={clabe}
              onChange={(e) => setClabe(e.target.value.replace(/\D/g, ''))}
              placeholder="012345678901234567"
              maxLength={18}
            />
          </Field>
        </div>
      </section>

      {/* ─── Specialties ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Especialidades
        </h2>
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={
                  on
                    ? 'rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700'
                    : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }
              >
                {on && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            className={`${INPUT_CLS} max-w-xs`}
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Agregar especialidad custom…"
          />
          <button
            type="button"
            onClick={addCustom}
            className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3 w-3" />
            Agregar
          </button>
        </div>
        {tags.filter((t) => !SPECIALTIES.includes(t)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags
              .filter((t) => !SPECIALTIES.includes(t))
              .map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-700"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="ml-1 opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saveProfile.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {/* ─── Password ────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Cambiar contraseña
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Actual">
            <input
              type="password"
              className={INPUT_CLS}
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
            />
          </Field>
          <Field label="Nueva">
            <input
              type="password"
              className={INPUT_CLS}
              value={pwNext}
              onChange={(e) => setPwNext(e.target.value)}
            />
          </Field>
          <Field label="Confirmar">
            <input
              type="password"
              className={INPUT_CLS}
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              if (pwNext.length < 8)
                return toast.error('La nueva contraseña debe tener 8+ caracteres');
              if (pwNext !== pwConfirm)
                return toast.error('Las contraseñas no coinciden');
              changePw.mutate();
            }}
            disabled={!pwCurrent || !pwNext || changePw.isPending}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {changePw.isPending ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
