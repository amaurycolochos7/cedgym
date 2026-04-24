'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Dumbbell,
  DollarSign,
  Wallet,
  Users,
  Plus,
} from 'lucide-react';
import { KpiCard } from '@/components/admin/kpi-card';
import { ChartBar } from '@/components/admin/chart-bar';
import { trainerApi } from '@/lib/trainer-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export default function TrainerDashboardPage() {
  const dash = useQuery({
    queryKey: ['trainer', 'dashboard'],
    queryFn: trainerApi.dashboard,
  });

  const chartData = React.useMemo(() => {
    const raw = dash.data?.sales_last_30_days ?? [];
    return raw.map((d) => ({
      label: DAY_FMT.format(new Date(d.day)),
      amount_mxn: d.amount_mxn,
    }));
  }, [dash.data]);

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mi dashboard</h1>
          <p className="text-sm text-slate-600">
            Resumen de tus rutinas y ventas.
          </p>
        </div>
        <Link
          href="/trainer/products/new"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Publicar rutina
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          icon={Dumbbell}
          label="Rutinas publicadas"
          value={d?.published_products ?? '—'}
          hint="Incluye todas las aprobadas"
        />
        <KpiCard
          icon={DollarSign}
          label="Ventas este mes"
          value={d?.sales_mtd ?? '—'}
          hint={
            d?.sales_mtd_mxn != null
              ? `${MXN.format(d.sales_mtd_mxn)} bruto`
              : ''
          }
        />
        <KpiCard
          icon={Wallet}
          label="Payout pendiente"
          value={
            d?.pending_payout_mxn != null
              ? MXN.format(d.pending_payout_mxn)
              : '—'
          }
          hint="70% al creador"
        />
        <KpiCard
          icon={Users}
          label="Mis atletas"
          value={d?.athletes_count ?? '—'}
          hint="Con mis rutinas"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Ventas últimos 30 días
          </h3>
          <p className="text-xs text-slate-500">
            Monto bruto cobrado por día (MXN)
          </p>
        </div>
        <ChartBar
          data={chartData}
          xKey="label"
          yKey="amount_mxn"
          formatter={(v) => MXN.format(v)}
        />
      </div>
    </div>
  );
}
