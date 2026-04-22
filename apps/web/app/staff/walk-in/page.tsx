'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { UserPlus, Copy, Printer, MessageCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import {
  staffPosApi,
  type PaymentMethod,
  type PlanCode,
  type BillingCycle,
  type RegisterMemberResponse,
} from '@/lib/staff-api';

interface Plan {
  code: PlanCode;
  name: string;
  monthly: number;
  quarterly: number;
  annual: number;
}

function mxn(n: number) {
  return `$${n.toLocaleString('es-MX')}`;
}

const CYCLES: { code: BillingCycle; label: string; key: 'monthly' | 'quarterly' | 'annual' }[] = [
  { code: 'MONTHLY', label: 'Mensual', key: 'monthly' },
  { code: 'QUARTERLY', label: 'Trimestral', key: 'quarterly' },
  { code: 'ANNUAL', label: 'Anual', key: 'annual' },
];

export default function StaffWalkInPage() {
  // Plan catalog from public endpoint — keeps pricing single-sourced.
  const { data: plansData } = useQuery({
    queryKey: ['memberships', 'plans'],
    queryFn: async () => (await api.get('/memberships/plans')).data as { plans: Plan[] },
  });
  const plans = plansData?.plans ?? [];

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    plan: 'PRO' as PlanCode,
    cycle: 'MONTHLY' as BillingCycle,
    method: 'CASH' as PaymentMethod,
  });

  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === form.plan),
    [plans, form.plan],
  );
  const price = useMemo(() => {
    if (!selectedPlan) return 0;
    const cycle = CYCLES.find((c) => c.code === form.cycle);
    if (!cycle) return 0;
    return selectedPlan[cycle.key];
  }, [selectedPlan, form.cycle]);

  const [result, setResult] = useState<RegisterMemberResponse | null>(null);

  const register = useMutation({
    mutationFn: () =>
      staffPosApi.registerMember({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        plan: form.plan,
        billing_cycle: form.cycle,
        payment_method: form.method,
      }),
    onSuccess: (r) => {
      setResult(r);
    },
    onError: (e: any) => {
      alert(e?.response?.data?.error?.message ?? 'Error al inscribir');
    },
  });

  const canSubmit =
    form.name.trim().length >= 2 &&
    /^\+?\d{10,15}$/.test(form.phone.trim().replace(/\s/g, '')) &&
    !register.isPending;

  // Best-effort WhatsApp QR — uses the generic manual send endpoint; if
  // it 404s we fall back to opening the portal URL in a new tab so the
  // receptionist can at least share it manually.
  async function sendQrWhatsapp() {
    if (!result) return;
    try {
      await api.post(`/admin/members/${result.user_id}/whatsapp`, {
        body: `Hola! Este es tu acceso a CED-GYM. Entra aquí: ${window.location.origin}/portal/qr`,
      });
      alert('Mensaje enviado por WhatsApp.');
    } catch {
      window.open(`${window.location.origin}/portal/qr`, '_blank');
    }
  }

  function printCard() {
    if (!result) return;
    // Backend PDF endpoint is not guaranteed yet — use window.print for
    // the on-screen card as a reliable fallback.
    window.print();
  }

  async function copyPassword() {
    if (!result?.temp_password) return;
    try {
      await navigator.clipboard.writeText(result.temp_password);
      alert('Contraseña copiada');
    } catch {
      /* noop */
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';
  const labelCls =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
          <UserPlus className="h-7 w-7 text-blue-600" /> Inscribir socio
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Alta en recepción — se crea cuenta, membresía y se envía WhatsApp de bienvenida.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre completo *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder="Diego López"
            />
          </div>
          <div>
            <label className={labelCls}>Teléfono (+52) *</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls}
              placeholder="+52 55 1234 5678"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Email (opcional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
              placeholder="diego@example.com"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Plan *</label>
          <div className="grid grid-cols-3 gap-2">
            {plans.map((p) => (
              <button
                key={p.code}
                onClick={() => setForm({ ...form, plan: p.code })}
                className={`rounded-xl border p-3 text-left transition ${
                  form.plan === p.code
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">
                  {p.code}
                </div>
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  desde {mxn(p.monthly)}/mes
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Ciclo de facturación *</label>
          <div className="grid grid-cols-3 gap-2">
            {CYCLES.map((c) => {
              const p = selectedPlan?.[c.key] ?? 0;
              return (
                <button
                  key={c.code}
                  onClick={() => setForm({ ...form, cycle: c.code })}
                  className={`rounded-xl border p-3 text-center transition ${
                    form.cycle === c.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">
                    {c.label}
                  </div>
                  <div className="mt-1 font-bold text-blue-600">{mxn(p)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>Método de pago *</label>
          <select
            value={form.method}
            onChange={(e) =>
              setForm({ ...form, method: e.target.value as PaymentMethod })
            }
            className={inputCls}
          >
            <option value="CASH">Efectivo</option>
            <option value="CARD_TERMINAL">Terminal (tarjeta)</option>
            <option value="MP_LINK">QR Mercado Pago</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div>
            <div className="text-xs text-slate-500">Total a cobrar</div>
            <div className="text-3xl font-bold text-blue-600">{mxn(price)}</div>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => register.mutate()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {register.isPending ? 'Inscribiendo…' : 'Inscribir'}
          </button>
        </div>
      </div>

      {/* Success modal */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button
              onClick={() => setResult(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="mb-2 text-xl font-bold text-slate-900">
              ¡Socio inscrito!
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              Cuenta creada para{' '}
              <span className="text-slate-900">{form.name}</span>.
            </p>

            <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                  Teléfono (login)
                </div>
                <div className="font-mono text-sm text-slate-900">
                  {form.phone}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                  Contraseña temporal
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 font-mono text-lg text-slate-900 border border-slate-200">
                    {result.temp_password}
                  </code>
                  <button
                    onClick={copyPassword}
                    className="text-slate-400 hover:text-slate-700"
                    title="Copiar"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-500">
                El socio recibió estas credenciales por WhatsApp. Deberá cambiar la
                contraseña al iniciar sesión.
              </div>
            </div>

            {result.init_point && (
              <a
                href={result.init_point}
                target="_blank"
                className="mb-3 block rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-700"
              >
                Abrir QR Mercado Pago
              </a>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={printCard}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" /> Imprimir carnet
              </button>
              <button
                type="button"
                onClick={sendQrWhatsapp}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle className="h-4 w-4" /> Enviar QR
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setForm({
                  name: '',
                  phone: '',
                  email: '',
                  plan: 'PRO',
                  cycle: 'MONTHLY',
                  method: 'CASH',
                });
              }}
              className="mt-3 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Inscribir a otro socio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
