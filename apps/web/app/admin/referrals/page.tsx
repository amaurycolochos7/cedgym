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
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Referidos
        </h1>
        <p className="text-slate-600 mt-1">
          Programa de invitaciones y recompensas.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Kpi label="Total referidos" value={items.length} />
        <Kpi
          label="Confirmados"
          value={
            items.filter(
              (r: any) =>
                r.status === 'CONFIRMED' || r.status === 'REWARDED',
            ).length
          }
        />
        <Kpi
          label="Crédito pagado"
          value={`$${items
            .reduce(
              (s: number, r: any) => s + (r.reward_referrer_mxn ?? 0),
              0,
            )
            .toLocaleString('es-MX')}`}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Referrer
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Referido
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Código
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Primer pago
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Premio
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Sin referidos aún.
                  </td>
                </tr>
              ) : (
                items.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3.5 text-slate-900">
                      {r.referrer?.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-900">
                      {r.referred?.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-blue-600">
                      {r.code_used}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{r.status}</td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {r.first_payment_at?.slice(0, 10) ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-900 font-semibold">
                      ${r.reward_referrer_mxn?.toLocaleString('es-MX')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="inline-flex rounded-lg bg-blue-50 p-2.5 text-blue-700 mb-3">
        <span className="block h-5 w-5" />
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="font-display text-3xl font-bold mt-1 text-slate-900">
        {value}
      </div>
    </div>
  );
}
