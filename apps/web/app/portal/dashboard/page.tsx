'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Calendar, ChevronRight, Activity, Dumbbell, Apple } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MembershipPaywallModal } from '@/components/portal/membership-paywall-modal';
import { PlansModal } from '@/components/portal/plans-modal';

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

  const hasActiveMembership =
    !!membership?.plan && (membership?.status?.toUpperCase?.() === 'ACTIVE' || membership?.days_remaining > 0);

  // Paywall state — when blocked, we surface a modal with the feature name
  // instead of routing to a "no plan" page.
  const [paywall, setPaywall] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
          Hola, {user?.name?.split(' ')[0] ?? ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          Tu membresía, tu QR y tus rutinas, todo en un solo lugar.
        </p>
      </div>

      {/* Mi QR de acceso — top, prominent hero card */}
      <ProtectedTile
        href="/portal/qr"
        featureName="el QR de acceso"
        unlocked={hasActiveMembership}
        onLocked={() => setPaywall('el QR de acceso')}
        className="group block overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-4 text-white shadow-lg shadow-blue-600/25 transition hover:shadow-xl hover:shadow-blue-600/35 sm:p-6"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-sm transition group-hover:bg-white/25 sm:h-14 sm:w-14">
            <QrCode className="h-6 w-6 sm:h-7 sm:w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white ring-1 ring-white/25">
              Entrada al gym
            </div>
            <div className="font-display mt-1 truncate text-lg font-bold text-white sm:text-2xl">
              Mi QR de acceso
            </div>
            <div className="mt-0.5 truncate text-xs text-white/90 sm:text-sm">
              Muéstralo al staff en la entrada.
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-1" />
        </div>
      </ProtectedTile>

      {/* Two-column: membership + quick actions */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Tu membresía</h3>
          {membership?.plan ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold text-slate-900 sm:text-2xl">{membership.plan}</span>
                <span className="text-xs text-slate-500 sm:text-sm">{membership.status}</span>
              </div>
              <div className="text-sm text-slate-600">
                Vence en{' '}
                <span className="font-semibold text-blue-600">
                  {membership.days_remaining ?? '—'} días
                </span>
              </div>
              <Link
                href="/portal/membership"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Gestionar <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No tienes una membresía activa.{' '}
              <button
                type="button"
                onClick={() => setPlansOpen(true)}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Ver planes →
              </button>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Accesos rápidos</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <QuickTile
              href="/portal/clases"
              icon={<Calendar className="h-5 w-5" />}
              label="Reservar"
              requiresPlan
              hasPlan={hasActiveMembership}
              onLocked={() => setPaywall('reservar clases')}
            />
            <QuickTile
              href="/portal/rutinas"
              icon={<Dumbbell className="h-5 w-5" />}
              label="Rutinas"
              requiresPlan
              hasPlan={hasActiveMembership}
              onLocked={() => setPaywall('tus rutinas')}
            />
            <QuickTile
              href="/portal/plan-alimenticio"
              icon={<Apple className="h-5 w-5" />}
              label="Plan alim."
              requiresPlan
              hasPlan={hasActiveMembership}
              onLocked={() => setPaywall('tu plan alimenticio')}
            />
          </div>
        </div>
      </div>

      {/* Este mes — single operational metric */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Activity className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
            Este mes
          </div>
          <div className="text-xl font-bold leading-tight tabular-nums text-slate-900 sm:text-2xl">
            {thisMonthCount} visitas
          </div>
        </div>
      </div>

      <MembershipPaywallModal
        open={paywall !== null}
        onClose={() => setPaywall(null)}
        featureName={paywall ?? undefined}
        onSeePlans={() => {
          setPaywall(null);
          setPlansOpen(true);
        }}
      />

      <PlansModal open={plansOpen} onClose={() => setPlansOpen(false)} />
    </div>
  );
}

function QuickTile({
  href,
  icon,
  label,
  requiresPlan,
  hasPlan,
  onLocked,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  requiresPlan?: boolean;
  hasPlan?: boolean;
  onLocked?: () => void;
}) {
  const blocked = requiresPlan && !hasPlan;
  const cls =
    'flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3.5 transition hover:border-blue-300 hover:bg-blue-50';
  const inner = (
    <>
      <span className="text-blue-600">{icon}</span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </>
  );
  if (blocked) {
    return (
      <button type="button" onClick={onLocked} className={cls + ' text-left'}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

function ProtectedTile({
  href,
  unlocked,
  onLocked,
  className,
  children,
}: {
  href: string;
  featureName: string;
  unlocked: boolean;
  onLocked: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (unlocked) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onLocked} className={className + ' text-left'}>
      {children}
    </button>
  );
}
