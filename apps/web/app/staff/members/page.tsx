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
import { Button } from '@/components/ui/button';
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
      <span className="text-[10px] uppercase tracking-widest bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
        Sin plan
      </span>
    );
  }
  const days = daysBetween(expiresAt);
  if (days === null) return null;
  if (days <= 0 || status === 'EXPIRED') {
    return (
      <span className="text-[10px] uppercase tracking-widest bg-red-900/40 text-red-300 border border-red-700/40 px-2 py-0.5 rounded flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Vencida
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="text-[10px] uppercase tracking-widest bg-amber-900/40 text-amber-300 border border-amber-700/40 px-2 py-0.5 rounded">
        Vence en {days}d
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-widest bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 px-2 py-0.5 rounded flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3" /> {days}d
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Socios</h1>
        <p className="text-zinc-400 mt-1">
          Búsqueda, check-in manual, cobros y renovaciones.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, teléfono o email…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5"
        />
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {items.length === 0 ? (
          <div className="p-6 text-center text-zinc-500">Sin resultados.</div>
        ) : (
          items.map((m) => (
            <div
              key={m.id}
              className="p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{m.full_name || m.name}</span>
                  <MembershipBadge
                    expiresAt={m.membership?.expires_at}
                    status={m.membership?.status}
                  />
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {m.phone} · {m.membership?.plan ?? 'Sin plan'}
                  {m.membership?.status ? ` · ${m.membership.status}` : ''}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => manual.mutate(m.id)}
                  disabled={manual.isPending}
                >
                  Check-in
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/staff/pos?user_id=${m.id}`}>
                    <ShoppingCart className="w-4 h-4" /> Cobrar
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRenewFor(m)}
                >
                  <RefreshCw className="w-4 h-4" /> Renovar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEnrollFor(m)}
                >
                  <GraduationCap className="w-4 h-4" /> Curso
                </Button>
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
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold mb-1">Renovar membresía</h3>
        <p className="text-sm text-zinc-400 mb-4">
          {member.full_name || member.name}
        </p>

        {initPoint ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Escanea el QR de Mercado Pago para completar el cobro:
            </p>
            <a
              href={initPoint}
              target="_blank"
              className="block text-center bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg"
            >
              Abrir Mercado Pago
            </a>
            <Button variant="ghost" className="w-full" onClick={onDone}>
              Listo
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase text-zinc-500 block mb-1">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanCode)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
                >
                  <option value="STARTER">Starter</option>
                  <option value="PRO">Pro</option>
                  <option value="ELITE">Élite</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase text-zinc-500 block mb-1">Ciclo</label>
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value as BillingCycle)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
                >
                  <option value="MONTHLY">Mensual</option>
                  <option value="QUARTERLY">Trimestral</option>
                  <option value="ANNUAL">Anual</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase text-zinc-500 block mb-1">Pago</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD_TERMINAL">Terminal</option>
                  <option value="MP_LINK">QR Mercado Pago</option>
                </select>
              </div>
            </div>
            <Button
              className="w-full mt-5"
              loading={run.isPending}
              onClick={() => run.mutate()}
            >
              Cobrar renovación
            </Button>
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
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold mb-1">Inscribir a curso</h3>
        <p className="text-sm text-zinc-400 mb-4">{member.full_name || member.name}</p>

        {initPoint ? (
          <div className="space-y-3">
            <a
              href={initPoint}
              target="_blank"
              className="block text-center bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg"
            >
              Abrir Mercado Pago
            </a>
            <Button variant="ghost" className="w-full" onClick={onDone}>
              Listo
            </Button>
          </div>
        ) : (
          <>
            {courses.length === 0 ? (
              <p className="text-sm text-zinc-500">No hay cursos disponibles.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {courses.map((c) => (
                  <label
                    key={c.id}
                    className={`block border rounded-lg p-3 cursor-pointer transition ${
                      courseId === c.id
                        ? 'border-brand-orange bg-orange-500/10'
                        : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="course"
                      className="sr-only"
                      checked={courseId === c.id}
                      onChange={() => setCourseId(c.id)}
                    />
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-zinc-500">
                          {c.seats_left} cupos · {c.sport ?? 'Curso'}
                        </div>
                      </div>
                      <div className="text-orange-400 font-bold">
                        ${c.price_mxn.toLocaleString('es-MX')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs uppercase text-zinc-500 block mb-1">Pago</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
              >
                <option value="CASH">Efectivo</option>
                <option value="CARD_TERMINAL">Terminal</option>
                <option value="MP_LINK">QR Mercado Pago</option>
              </select>
            </div>

            <Button
              className="w-full mt-5"
              disabled={!courseId}
              loading={run.isPending}
              onClick={() => run.mutate()}
            >
              Inscribir y cobrar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
