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
import { Button } from '@/components/ui/button';

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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <UserPlus className="w-7 h-7 text-brand-orange" /> Inscribir socio
        </h1>
        <p className="text-zinc-400 mt-1">
          Alta en recepción — se crea cuenta, membresía y se envía WhatsApp de bienvenida.
        </p>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase text-zinc-500 block mb-1">
              Nombre completo *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5"
              placeholder="Diego López"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-zinc-500 block mb-1">
              Teléfono (+52) *
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5"
              placeholder="+52 55 1234 5678"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase text-zinc-500 block mb-1">
              Email (opcional)
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5"
              placeholder="diego@example.com"
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-zinc-500 block mb-2">Plan *</label>
          <div className="grid grid-cols-3 gap-2">
            {plans.map((p) => (
              <button
                key={p.code}
                onClick={() => setForm({ ...form, plan: p.code })}
                className={`border rounded-xl p-3 text-left transition ${
                  form.plan === p.code
                    ? 'border-brand-orange bg-orange-500/10'
                    : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-600'
                }`}
              >
                <div className="text-[10px] uppercase tracking-widest text-brand-orange">
                  {p.code}
                </div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-zinc-500">desde {mxn(p.monthly)}/mes</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-zinc-500 block mb-2">
            Ciclo de facturación *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CYCLES.map((c) => {
              const p = selectedPlan?.[c.key] ?? 0;
              return (
                <button
                  key={c.code}
                  onClick={() => setForm({ ...form, cycle: c.code })}
                  className={`border rounded-xl p-3 text-center transition ${
                    form.cycle === c.code
                      ? 'border-brand-orange bg-orange-500/10'
                      : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-orange-400 font-bold mt-1">{mxn(p)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-zinc-500 block mb-2">
            Método de pago *
          </label>
          <select
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5"
          >
            <option value="CASH">Efectivo</option>
            <option value="CARD_TERMINAL">Terminal (tarjeta)</option>
            <option value="MP_LINK">QR Mercado Pago</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
          <div>
            <div className="text-xs text-zinc-500">Total a cobrar</div>
            <div className="text-3xl font-bold text-orange-400">{mxn(price)}</div>
          </div>
          <Button
            disabled={!canSubmit}
            loading={register.isPending}
            onClick={() => register.mutate()}
          >
            Inscribir
          </Button>
        </div>
      </div>

      {/* Success modal */}
      {result && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setResult(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold mb-2">¡Socio inscrito!</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Cuenta creada para{' '}
              <span className="text-zinc-100">{form.name}</span>.
            </p>

            <div className="bg-zinc-800/70 rounded-lg p-4 mb-4 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Teléfono (login)
                </div>
                <div className="font-mono text-sm">{form.phone}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Contraseña temporal
                </div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-lg bg-zinc-950 rounded px-2 py-1">
                    {result.temp_password}
                  </code>
                  <button
                    onClick={copyPassword}
                    className="text-zinc-400 hover:text-white"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                El socio recibió estas credenciales por WhatsApp. Deberá cambiar la
                contraseña al iniciar sesión.
              </div>
            </div>

            {result.init_point && (
              <a
                href={result.init_point}
                target="_blank"
                className="block text-center bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg text-sm mb-3"
              >
                Abrir QR Mercado Pago
              </a>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={printCard}>
                <Printer className="w-4 h-4" /> Imprimir carnet
              </Button>
              <Button variant="secondary" onClick={sendQrWhatsapp}>
                <MessageCircle className="w-4 h-4" /> Enviar QR
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full mt-3"
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
            >
              Inscribir a otro socio
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
