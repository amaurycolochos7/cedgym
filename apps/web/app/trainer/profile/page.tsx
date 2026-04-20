'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
        <h1 className="text-2xl font-bold uppercase tracking-widest text-white">
          Perfil
        </h1>
        <p className="text-sm text-white/50">
          Actualiza tus datos públicos, pago de payouts y credenciales.
        </p>
      </div>

      {/* ─── Basic info ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">
          Datos básicos
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Foto (URL)">
            <Input
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
              className="flex w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
            />
          </Field>
        </div>
      </section>

      {/* ─── Banking ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Datos bancarios
          </h2>
          <p className="text-[11px] text-white/50">
            Usados para liquidar tus payouts. Tu información se guarda cifrada.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="RFC">
            <Input
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              placeholder="XAXX010101000"
            />
          </Field>
          <Field label="Banco">
            <Input
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="BBVA"
            />
          </Field>
          <Field label="CLABE (18 dígitos)">
            <Input
              value={clabe}
              onChange={(e) => setClabe(e.target.value.replace(/\D/g, ''))}
              placeholder="012345678901234567"
              maxLength={18}
            />
          </Field>
        </div>
      </section>

      {/* ─── Specialties ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">
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
                    ? 'rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-brand-orange'
                    : 'rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-white/60 hover:border-white/20 hover:text-white'
                }
              >
                {on && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Agregar especialidad custom…"
            className="max-w-xs"
          />
          <Button size="sm" variant="secondary" onClick={addCustom}>
            <Plus className="h-3 w-3" />
            Agregar
          </Button>
        </div>
        {tags.filter((t) => !SPECIALTIES.includes(t)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags
              .filter((t) => !SPECIALTIES.includes(t))
              .map((t) => (
                <Badge key={t} variant="brand">
                  {t}
                  <button
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="ml-1 opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end">
        <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
          Guardar cambios
        </Button>
      </div>

      {/* ─── Password ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">
          Cambiar contraseña
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Actual">
            <Input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
            />
          </Field>
          <Field label="Nueva">
            <Input
              type="password"
              value={pwNext}
              onChange={(e) => setPwNext(e.target.value)}
            />
          </Field>
          <Field label="Confirmar">
            <Input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (pwNext.length < 8)
                return toast.error('La nueva contraseña debe tener 8+ caracteres');
              if (pwNext !== pwConfirm) return toast.error('Las contraseñas no coinciden');
              changePw.mutate();
            }}
            loading={changePw.isPending}
            disabled={!pwCurrent || !pwNext}
          >
            Actualizar contraseña
          </Button>
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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </span>
      {children}
    </label>
  );
}
