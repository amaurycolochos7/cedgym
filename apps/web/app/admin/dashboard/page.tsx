'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  DollarSign,
  ScanLine,
  UserPlus,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { KpiCard } from '@/components/admin/kpi-card';
import { ChartLine } from '@/components/admin/chart-line';
import { ChartBar } from '@/components/admin/chart-bar';
import { Heatmap } from '@/components/admin/heatmap';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/admin-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export default function AdminDashboardPage() {
  const [range, setRange] = React.useState<'day' | 'week' | 'month'>('week');

  const kpis = useQuery({ queryKey: ['admin', 'kpis'], queryFn: adminApi.kpis });
  const revenue = useQuery({
    queryKey: ['admin', 'revenue', range],
    queryFn: () => adminApi.revenueSeries(range),
  });
  const retention = useQuery({
    queryKey: ['admin', 'retention'],
    queryFn: adminApi.retentionSeries,
  });
  const heat = useQuery({
    queryKey: ['admin', 'heatmap'],
    queryFn: adminApi.checkinHeatmap,
  });
  const topSports = useQuery({
    queryKey: ['admin', 'top-sports'],
    queryFn: adminApi.topSports,
  });
  const topCoaches = useQuery({
    queryKey: ['admin', 'top-coaches'],
    queryFn: adminApi.topCoaches,
  });
  const churn = useQuery({
    queryKey: ['admin', 'churn'],
    queryFn: adminApi.churnRisk,
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Users}
          label="Socios activos"
          value={kpis.data?.active_members ?? '—'}
          delta={kpis.data?.active_members_delta}
          href="/admin/miembros?status=ACTIVE"
        />
        <KpiCard
          icon={DollarSign}
          label="Ingresos MTD"
          value={
            kpis.data?.revenue_mtd != null
              ? MXN.format(kpis.data.revenue_mtd)
              : '—'
          }
          delta={kpis.data?.revenue_mtd_delta}
          href="/admin/payments"
        />
        <KpiCard
          icon={ScanLine}
          label="Check-ins hoy"
          value={kpis.data?.checkins_today ?? '—'}
          delta={kpis.data?.checkins_today_delta}
          href="/admin/reports?kind=checkins-today"
        />
        <KpiCard
          icon={UserPlus}
          label="Altas MTD"
          value={kpis.data?.signups_mtd ?? '—'}
          delta={kpis.data?.signups_mtd_delta}
          href="/admin/miembros?sort=created_desc"
        />
        <KpiCard
          icon={CalendarClock}
          label="Vencen en 7d"
          value={kpis.data?.expiring_7d ?? '—'}
          hint="Requiere follow-up"
          href="/admin/memberships?expiring=7d"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Vencen en 30d"
          value={kpis.data?.expiring_30d ?? '—'}
          hint="Para campañas"
          href="/admin/memberships/expired"
        />
      </div>

      {/* Revenue + retention */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Ingresos
              </h3>
              <p className="text-xs text-white/50">
                Ingresos cobrados por día/semana/mes
              </p>
            </div>
            <div className="inline-flex rounded-full border border-white/10 p-1">
              {(['day', 'week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                    range === r
                      ? 'bg-brand-orange text-black'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {r === 'day' ? 'Día' : r === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
          </div>
          <ChartLine
            data={revenue.data ?? []}
            xKey="bucket"
            yKey="amount_mxn"
            formatter={(v) => MXN.format(typeof v === 'number' && !Number.isNaN(v) ? v : 0)}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Retención
            </h3>
            <p className="text-xs text-white/50">
              % de renovaciones por mes
            </p>
          </div>
          <ChartBar
            data={retention.data ?? []}
            xKey="month"
            yKey="renewals_pct"
            formatter={(v) => `${typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(0) : '0'}%`}
          />
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Check-ins por día y hora
          </h3>
          <p className="text-xs text-white/50">
            Entradas al gym en los últimos 30 días
          </p>
        </div>
        <Heatmap cells={heat.data ?? []} />
      </div>

      {/* Tops + churn */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopList
          title="Top 5 deportes"
          subtitle="Check-ins últimos 30 días"
          items={topSports.data ?? []}
        />
        <TopList
          title="Top 5 coaches"
          subtitle="Clases impartidas"
          items={topCoaches.data ?? []}
        />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Riesgo de churn
              </h3>
              <p className="text-xs text-white/50">
                Atletas con &lt;60% asistencia esperada
              </p>
            </div>
            <Link
              href="/admin/miembros"
              className="text-xs font-semibold text-brand-orange hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <ul className="space-y-2">
            {(churn.data ?? []).slice(0, 6).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] p-3"
              >
                <Link
                  href={`/admin/miembros/${c.id}`}
                  className="flex-1 truncate text-sm font-semibold text-white hover:text-brand-orange"
                >
                  {c.name}
                </Link>
                <span className="ml-2 shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                  {Math.round(c.attendance_pct)}%
                </span>
              </li>
            ))}
            {churn.data && churn.data.length === 0 && (
              <li className="rounded-lg bg-white/[0.02] p-3 text-xs text-white/50">
                Sin riesgos detectados.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TopList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: { name: string; value: number; subtitle?: string }[];
}) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">
          {title}
        </h3>
        <p className="text-xs text-white/50">{subtitle}</p>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 5).map((it) => (
          <li key={it.name}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{it.name}</span>
              <span className="text-white/60">{it.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-orange-2"
                style={{ width: `${(it.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs text-white/40">Sin datos todavía.</li>
        )}
      </ul>
    </div>
  );
}
