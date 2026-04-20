'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AdminSettingsPage() {
  const { data } = useQuery({
    queryKey: ['workspace', 'settings'],
    queryFn: async () => (await api.get('/admin/workspace')).data.catch?.(() => ({})) ?? {},
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ajustes</h1>
        <p className="text-zinc-400 mt-1">Configuración del gym e integraciones.</p>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold">Gym</h3>
        <div className="text-sm text-zinc-400">
          Nombre: <span className="text-zinc-100">{data?.name ?? 'CED·GYM'}</span>
        </div>
        <div className="text-sm text-zinc-400">
          Slug: <code className="text-orange-400">{data?.slug ?? 'ced-gym'}</code>
        </div>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold">Integraciones</h3>
        <StatusRow label="Mercado Pago" status={data?.mp_ok ? 'ok' : 'pending'} />
        <StatusRow label="WhatsApp Bot" status={data?.whatsapp_connected ? 'ok' : 'pending'} />
        <StatusRow label="MinIO Storage" status={data?.minio_ok ? 'ok' : 'pending'} />
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold">Planes y precios</h3>
        <p className="text-sm text-zinc-400">
          Configura desde <a href="/admin/memberships" className="text-orange-400">Membresías</a>.
        </p>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold">Automaciones y plantillas</h3>
        <p className="text-sm text-zinc-400">
          Gestiona en <a href="/admin/automations" className="text-orange-400">Automaciones</a> y <a href="/admin/templates" className="text-orange-400">Templates</a>.
        </p>
      </div>
    </div>
  );
}

function StatusRow({ label, status }: any) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className={status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
        {status === 'ok' ? '✓ Conectado' : '⚠ Requiere configuración'}
      </span>
    </div>
  );
}
