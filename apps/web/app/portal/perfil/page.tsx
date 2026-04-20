'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Copy, Share2, Trash2, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function PortalPerfilPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: referrals } = useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: async () => (await api.get('/referrals/me')).data,
  });

  const [fullName, setFullName] = useState(me?.user?.full_name ?? '');
  const [emContactName, setEmContactName] = useState('');
  const [emContactPhone, setEmContactPhone] = useState('');
  const [emContactRel, setEmContactRel] = useState('Familiar');

  const updateProfile = useMutation({
    mutationFn: async () =>
      (await api.patch('/auth/complete-profile', {
        full_name: fullName || undefined,
        emergency_contact:
          emContactName && emContactPhone
            ? { name: emContactName, phone: emContactPhone, relationship: emContactRel }
            : undefined,
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const code = referrals?.code;
  const shareUrl = code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${code}` : '';

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(shareUrl);
    alert('Link copiado');
  };

  const shareWhatsapp = () => {
    if (!code) return;
    const msg = encodeURIComponent(
      `Entrena conmigo en CED·GYM. Usa mi código ${code} y obtén descuento en tu primer pago: ${shareUrl}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mi perfil</h1>
        <p className="text-zinc-400 mt-1">Datos personales y seguridad.</p>
      </div>

      {/* Datos */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Datos personales</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nombre">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={me?.user?.name}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Email"><div className="py-2 text-zinc-400">{me?.user?.email}</div></Field>
          <Field label="Teléfono"><div className="py-2 text-zinc-400">{me?.user?.phone}</div></Field>
          <Field label="Rol"><div className="py-2 text-zinc-400">{me?.user?.role}</div></Field>
        </div>
      </div>

      {/* Contacto de emergencia */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Contacto de emergencia</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Nombre">
            <input
              value={emContactName}
              onChange={(e) => setEmContactName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Parentesco">
            <select
              value={emContactRel}
              onChange={(e) => setEmContactRel(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            >
              <option>Familiar</option><option>Madre</option><option>Padre</option>
              <option>Pareja</option><option>Hermano/a</option><option>Amigo/a</option>
            </select>
          </Field>
          <Field label="Teléfono">
            <input
              value={emContactPhone}
              onChange={(e) => setEmContactPhone(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
          </Field>
        </div>
        <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Referidos */}
      <div className="bg-gradient-to-br from-orange-500/20 to-orange-700/10 border border-orange-500/30 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Mi código de referidos</h3>
        <p className="text-sm text-zinc-300">
          Comparte y gana $200 MXN de crédito por cada referido que se registre y pague.
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-zinc-500">Tu código</div>
            <div className="text-2xl font-mono text-orange-400 mt-1">{code ?? '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-zinc-500">Crédito acumulado</div>
            <div className="text-2xl font-bold mt-1">
              ${(referrals?.credit_mxn ?? 0).toLocaleString('es-MX')}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={copyCode}>
            <Copy className="w-4 h-4 mr-2" /> Copiar link
          </Button>
          <Button variant="ghost" onClick={shareWhatsapp}>
            <Share2 className="w-4 h-4 mr-2" /> WhatsApp
          </Button>
        </div>
      </div>

      {/* Datos & privacidad */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="text-lg font-semibold">Privacidad</h3>
        <Button variant="ghost" onClick={() => (window.location.href = `${api.defaults.baseURL}/users/me/export`)}>
          <Download className="w-4 h-4 mr-2" /> Exportar mis datos
        </Button>
        <Button variant="ghost" className="text-red-400 hover:text-red-300">
          <Trash2 className="w-4 h-4 mr-2" /> Eliminar cuenta
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-zinc-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
