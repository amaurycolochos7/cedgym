'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Calendar, ChevronRight, Activity, Dumbbell, Apple } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function PortalDashboardPage() {
  const { user } = useAuth();

  const { data: membership } = useQuery({
    queryKey: ['memberships', 'me'],
    queryFn: async () => (await api.get('/memberships/me')).data,
  });

  const { data: checkins } = useQuery({
    queryKey: ['checkins', 'me', 'history'],
    queryFn: async () => (await api.get('/checkins/me/history?limit=30')).data,
  });

  const now = new Date();
  const thisMonthCount = Array.isArray(checkins?.check_ins)
    ? checkins.check_ins.filter((c: any) => {
        const d = new Date(c.scanned_at ?? c.created_at ?? 0);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length
    : 0;

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Hola, {user?.name?.split(' ')[0] ?? 'Atleta'}
        </h1>
        <p className="text-slate-500 mt-1.5 text-sm sm:text-base">
          Tu membresía, tu QR y tus rutinas, todo en un solo lugar.
        </p>
      </div>

      {/* Mi QR de acceso — top, prominent hero card */}
      <Link
        href="/portal/qr"
        className="group block overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white p-5 sm:p-6 shadow-lg shadow-blue-600/25 transition hover:shadow-xl hover:shadow-blue-600/35"
      >
        <div className="flex items-center gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 text-white backdrop-blur-sm transition group-hover:bg-white/25">
            <QrCode className="h-7 w-7" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="inline-block rounded-full bg-white/15 ring-1 ring-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              Entrada al gym
            </div>
            <div className="font-display mt-1.5 text-xl sm:text-2xl font-bold text-white truncate">
              Mi QR de acceso
            </div>
            <div className="mt-0.5 text-xs sm:text-sm text-white/90 truncate">
              Muéstralo al staff en la entrada.
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-1" />
        </div>
      </Link>

      {/* Two-column: membership + quick actions */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900">Tu membresía</h3>
          {membership?.plan ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">{membership.plan}</span>
                <span className="text-sm text-slate-500">{membership.status}</span>
              </div>
              <div className="text-sm text-slate-600">
                Vence en <span className="text-blue-600 font-semibold">
                  {membership.days_remaining ?? '—'} días
                </span>
              </div>
              <Link
                href="/portal/membership"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Gestionar <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="text-slate-500">
              No tienes una membresía activa.
              <Link href="/#planes" className="text-blue-600 hover:text-blue-700 font-medium ml-1">Ver planes →</Link>
            </div>
          )}
        </div>

        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900">Accesos rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickTile href="/portal/qr" icon={<QrCode className="w-5 h-5" />} label="Mi QR" />
            <QuickTile href="/portal/clases" icon={<Calendar className="w-5 h-5" />} label="Reservar" />
            <QuickTile href="/portal/rutinas" icon={<Dumbbell className="w-5 h-5" />} label="Rutinas" />
            <QuickTile href="/portal/plan-alimenticio" icon={<Apple className="w-5 h-5" />} label="Plan alim." />
          </div>
        </div>
      </div>

      {/* Este mes — single operational metric */}
      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6 flex items-center gap-4">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Activity className="w-6 h-6" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Este mes</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{thisMonthCount} visitas</div>
        </div>
      </div>
    </div>
  );
}

function QuickTile({ href, icon, label }: any) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2.5 py-5 px-3 rounded-2xl bg-slate-50 hover:bg-blue-50 ring-1 ring-slate-200 hover:ring-blue-300 transition"
    >
      <span className="text-blue-600">{icon}</span>
      <span className="text-sm text-slate-700 font-medium">{label}</span>
    </Link>
  );
}
