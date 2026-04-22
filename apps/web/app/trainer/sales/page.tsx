'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, DollarSign, Wallet, CheckCircle2 } from 'lucide-react';
import { KpiCard } from '@/components/admin/kpi-card';
import { trainerApi, type TrainerSale } from '@/lib/trainer-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: TrainerSale[]): string {
  const header = [
    'fecha',
    'producto',
    'comprador',
    'email',
    'bruto_mxn',
    'payout_mxn',
    'status',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.purchased_at).toISOString(),
        r.product.title,
        r.user.full_name || r.user.name,
        r.user.email,
        r.price_paid_mxn,
        r.author_payout_mxn,
        r.status ?? 'PAID',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n');
}

const INPUT_CLS =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';

const LABEL_CLS =
  'text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';

export default function TrainerSalesPage() {
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');
  const [productId, setProductId] = React.useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['trainer', 'sales', from, to, productId],
    queryFn: () =>
      trainerApi.sales({
        from: from || undefined,
        to: to || undefined,
        product_id: productId || undefined,
      }),
  });

  const handleExport = () => {
    if (!data?.sales?.length) return;
    const csv = toCsv(data.sales);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trainer-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totals = data?.totals;
  const rows = data?.sales ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Ventas y payouts</h1>
        <p className="text-sm text-slate-600">
          Detalle de compras a tus rutinas y el payout que te corresponde.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Total bruto"
          value={totals?.gross_mxn != null ? MXN.format(totals.gross_mxn) : '—'}
          hint="Con los filtros actuales"
        />
        <KpiCard
          icon={Wallet}
          label="Payout pendiente"
          value={
            totals?.pending_payout_mxn != null
              ? MXN.format(totals.pending_payout_mxn)
              : '—'
          }
          hint="Aún no liquidado"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Payout pagado"
          value={
            totals?.paid_payout_mxn != null
              ? MXN.format(totals.paid_payout_mxn)
              : '—'
          }
          hint="Histórico"
        />
        <KpiCard
          icon={DollarSign}
          label="Transacciones"
          value={rows.length}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLS}>Desde</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLS}>Hasta</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT_CLS}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className={LABEL_CLS}>Producto</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Todos</option>
              {(data?.products_summary ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3 w-3" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold">Comprador</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Tu payout (70%)
                </th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    Sin ventas para estos filtros.
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.purchase_id}>
                  <td className="px-4 py-3">
                    {new Date(s.purchased_at).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {s.product.title}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900">
                      {s.user.full_name || s.user.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {s.user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {MXN.format(s.price_paid_mxn)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">
                    {MXN.format(s.author_payout_mxn)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      {s.status ?? 'Pagada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
