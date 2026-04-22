'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AdminSettingsPage() {
  const { data } = useQuery({
    queryKey: ['workspace', 'settings'],
    queryFn: async () =>
      (await api.get('/admin/workspace')).data.catch?.(() => ({})) ?? {},
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Ajustes
        </h1>
        <p className="text-slate-600 mt-1">
          Configuración del gym e integraciones.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="font-semibold text-slate-900">Gym</h3>
        <div className="text-sm text-slate-600">
          Nombre:{' '}
          <span className="text-slate-900 font-medium">
            {data?.name ?? 'CED·GYM'}
          </span>
        </div>
        <div className="text-sm text-slate-600">
          Slug:{' '}
          <code className="text-blue-600 font-semibold">
            {data?.slug ?? 'ced-gym'}
          </code>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="font-semibold text-slate-900">Integraciones</h3>
        <StatusRow
          label="Mercado Pago"
          status={data?.mp_ok ? 'ok' : 'pending'}
        />
        <StatusRow
          label="WhatsApp Bot"
          status={data?.whatsapp_connected ? 'ok' : 'pending'}
        />
        <StatusRow
          label="MinIO Storage"
          status={data?.minio_ok ? 'ok' : 'pending'}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="font-semibold text-slate-900">Planes y precios</h3>
        <p className="text-sm text-slate-600">
          Configura desde{' '}
          <a
            href="/admin/memberships"
            className="text-blue-600 hover:underline font-semibold"
          >
            Membresías
          </a>
          .
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="font-semibold text-slate-900">Automaciones</h3>
        <p className="text-sm text-slate-600">
          Gestiona en{' '}
          <a
            href="/admin/automations"
            className="text-blue-600 hover:underline font-semibold"
          >
            Automaciones
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function StatusRow({ label, status }: any) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-700">{label}</span>
      <span
        className={
          status === 'ok'
            ? 'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700'
            : 'inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700'
        }
      >
        {status === 'ok' ? '✓ Conectado' : '⚠ Requiere configuración'}
      </span>
    </div>
  );
}
