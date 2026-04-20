'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, DollarSign, Wallet, CheckCircle2 } from 'lucide-react';
import { KpiCard } from '@/components/admin/kpi-card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
        <h1 className="text-2xl font-bold uppercase tracking-widest text-white">
          Ventas y payouts
        </h1>
        <p className="text-sm text-white/50">
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

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Desde
            </span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Hasta
            </span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Producto
            </span>
            <Select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Todos</option>
              {(data?.products_summary ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download className="h-3 w-3" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Tu payout (70%)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-white/40">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-white/40">
                  Sin ventas para estos filtros.
                </TableCell>
              </TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.purchase_id}>
                <TableCell>
                  {new Date(s.purchased_at).toLocaleDateString('es-MX')}
                </TableCell>
                <TableCell className="font-medium text-white">
                  {s.product.title}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {s.user.full_name || s.user.name}
                  </div>
                  <div className="text-[11px] text-white/50">{s.user.email}</div>
                </TableCell>
                <TableCell className="text-right">
                  {MXN.format(s.price_paid_mxn)}
                </TableCell>
                <TableCell className="text-right text-brand-orange">
                  {MXN.format(s.author_payout_mxn)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
                    {s.status ?? 'Pagada'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
