'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AdminReferralsPage() {
  const { data } = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: async () => (await api.get('/admin/referrals')).data,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Referidos</h1>
        <p className="text-zinc-400 mt-1">Programa de invitaciones y recompensas.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Kpi label="Total referidos" value={items.length} />
        <Kpi label="Confirmados" value={items.filter((r: any) => r.status === 'CONFIRMED' || r.status === 'REWARDED').length} />
        <Kpi
          label="Crédito pagado"
          value={`$${items.reduce((s: number, r: any) => s + (r.reward_referrer_mxn ?? 0), 0).toLocaleString('es-MX')}`}
        />
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50">
            <tr className="text-left">
              <th className="px-4 py-3">Referrer</th>
              <th className="px-4 py-3">Referido</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Primer pago</th>
              <th className="px-4 py-3">Premio</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Sin referidos aún.</td></tr>
            ) : items.map((r: any) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">{r.referrer?.name}</td>
                <td className="px-4 py-3">{r.referred?.name}</td>
                <td className="px-4 py-3 font-mono text-blue-400">{r.code_used}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3 text-zinc-400">{r.first_payment_at?.slice(0, 10) ?? '—'}</td>
                <td className="px-4 py-3">${r.reward_referrer_mxn?.toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: any) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
