'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ShoppingCart,
  RefreshCw,
  GraduationCap,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { planDisplayName, membershipStatusLabel } from '@/lib/utils';
import {
  staffPosApi,
  type PaymentMethod,
  type PlanCode,
  type BillingCycle,
  type PosCourseItem,
} from '@/lib/staff-api';

type MemberRow = {
  id: string;
  name: string;
  full_name?: string;
  phone: string;
  email?: string;
  status?: string;
  membership?: {
    plan?: PlanCode;
    status?: string;
    sport?: string;
    expires_at?: string;
  } | null;
};

function daysBetween(target?: string) {
  if (!target) return null;
  const diffMs = new Date(target).getTime() - Date.now();
  return Math.ceil(diffMs / 86_400_000);
}

function MembershipBadge({ expiresAt, status }: { expiresAt?: string; status?: string }) {
  if (!expiresAt) {
    return (
      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-500">
        Sin plan
      </span>
    );
  }
  const days = daysBetween(expiresAt);
  if (days === null) return null;
  if (days <= 0 || status === 'EXPIRED') {
    return (
      <span className="flex items-center gap-1 rounded border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-rose-700">
        <AlertTriangle className="h-3 w-3" /> Vencida
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-700">
        Vence en {days}d
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> {days}d
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
export default function StaffMembersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  const { data } = useQuery({
    queryKey: ['staff', 'members', q],
    queryFn: async () =>
      (await api.get(`/admin/miembros?search=${encodeURIComponent(q)}&limit=30`)).data,
  });

  const manual = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post('/checkins/manual', { user_id: userId, method: 'MANUAL' })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', 'members'] });
      alert('Check-in registrado');
    },
    onError: (e: any) => {
      alert(e?.response?.data?.error?.message ?? 'Error');
    },
  });

  const items: MemberRow[] = data?.items ?? [];

  // Modal state
  const [renewFor, setRenewFor] = useState<MemberRow | null>(null);
  const [enrollFor, setEnrollFor] = useState<MemberRow | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Socios</h1>
        <p className="mt-1 text-sm text-slate-600">
          Búsqueda, check-in manual, cobros y renovaciones.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, teléfono o email…"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
        />
      </div>

      <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Sin resultados.
          </div>
        ) : (
          items.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900">
                    {m.full_name || m.name}
                  </span>
                  <MembershipBadge
                    expiresAt={m.membership?.expires_at}
                    status={m.membership?.status}
                  />
                </div>
                <div className="truncate text-xs text-slate-500">
                  {m.phone} · {m.membership?.plan ? planDisplayName(m.membership.plan) : 'Sin plan'}
                  {m.membership?.status ? ` · ${membershipStatusLabel(m.membership.status)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => manual.mutate(m.id)}
                  disabled={manual.isPending}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Check-in
                </button>
                <Link
                  href={`/staff/pos?user_id=${m.id}`}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ShoppingCart className="h-4 w-4" /> Cobrar
                </Link>
                <button
                  type="button"
                  onClick={() => setRenewFor(m)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" /> Renovar
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollFor(m)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <GraduationCap className="h-4 w-4" /> Curso
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {renewFor && (
        <RenewModal
          member={renewFor}
          onClose={() => setRenewFor(null)}
          onDone={() => {
            setRenewFor(null);
            qc.invalidateQueries({ queryKey: ['staff', 'members'] });
          }}
        />
      )}
      {enrollFor && (
        <EnrollCourseModal
          member={enrollFor}
          onClose={() => setEnrollFor(null)}
          onDone={() => {
            setEnrollFor(null);
            qc.invalidateQueries({ queryKey: ['staff', 'members'] });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────
function RenewModal({
  member,
  onClose,
  onDone,
}: {
  member: MemberRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<PlanCode>(member.membership?.plan || 'PRO');
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [initPoint, setInitPoint] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () =>
      staffPosApi.extendMembership({
        user_id: member.id,
        plan,
        billing_cycle: cycle,
        payment_method: method,
      }),
    onSuccess: (r) => {
      if (r.init_point) {
        setInitPoint(r.init_point);
      } else {
        alert('Renovación registrada');
        onDone();
      }
    },
    onError: (e: any) => {
      alert(e?.response?.data?.error?.message ?? 'Error');
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="mb-1 text-lg font-bold text-slate-900">
          Renovar membresía
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          {member.full_name || member.name}
        </p>

        {initPoint ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Escanea el QR de Mercado Pago para completar el cobro:
            </p>
            <a
              href={initPoint}
              target="_blank"
              className="block rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-700"
            >
              Abrir Mercado Pago
            </a>
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                  Plan
                </label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanCode)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="STARTER">Básico</option>
                  <option value="PRO">Pro</option>
                  <option value="ELITE">Élite</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                  Ciclo
                </label>
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value as BillingCycle)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="MONTHLY">Mensual</option>
                  <option value="QUARTERLY">Trimestral</option>
                  <option value="ANNUAL">Anual</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                  Pago
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD_TERMINAL">Terminal</option>
                  <option value="MP_LINK">QR Mercado Pago</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? 'Procesando…' : 'Cobrar renovación'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EnrollCourseModal({
  member,
  onClose,
  onDone,
}: {
  member: MemberRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: menu } = useQuery({
    queryKey: ['pos', 'menu', 'courses'],
    queryFn: () => staffPosApi.productsMenu(),
  });
  const courses: PosCourseItem[] = menu?.courses ?? [];

  const [courseId, setCourseId] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [initPoint, setInitPoint] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () =>
      staffPosApi.enrollCourse({
        user_id: member.id,
        course_id: courseId,
        payment_method: method,
      }),
    onSuccess: (r) => {
      if (r.init_point) setInitPoint(r.init_point);
      else {
        alert('Inscripción registrada');
        onDone();
      }
    },
    onError: (e: any) => {
      alert(e?.response?.data?.error?.message ?? 'Error');
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="mb-1 text-lg font-bold text-slate-900">
          Inscribir a curso
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          {member.full_name || member.name}
        </p>

        {initPoint ? (
          <div className="space-y-3">
            <a
              href={initPoint}
              target="_blank"
              className="block rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-700"
            >
              Abrir Mercado Pago
            </a>
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            {courses.length === 0 ? (
              <p className="text-sm text-slate-500">No hay cursos disponibles.</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {courses.map((c) => (
                  <label
                    key={c.id}
                    className={`block cursor-pointer rounded-xl border p-3 transition ${
                      courseId === c.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="course"
                      className="sr-only"
                      checked={courseId === c.id}
                      onChange={() => setCourseId(c.id)}
                    />
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {c.seats_left} cupos · {c.sport ?? 'Curso'}
                        </div>
                      </div>
                      <div className="font-bold text-blue-600">
                        ${c.price_mxn.toLocaleString('es-MX')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Pago
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="CASH">Efectivo</option>
                <option value="CARD_TERMINAL">Terminal</option>
                <option value="MP_LINK">QR Mercado Pago</option>
              </select>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              disabled={!courseId || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? 'Procesando…' : 'Inscribir y cobrar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
