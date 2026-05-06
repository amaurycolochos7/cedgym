'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  UserPlus,
  Wallet,
  CreditCard,
  CheckCircle2,
  X,
  MessageCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  staffPosApi,
  type PaymentMethod,
  type PlanCode,
  type RegisterMemberResponse,
} from '@/lib/staff-api';

// Matches the public /memberships/plans contract — getPublicPlanCatalog
// projects `id` (not `code`), and exposes `monthly_price_mxn` as the
// canonical price field. `monthly` was a stale alias from an older
// shape; we keep it optional to avoid breaking older code paths.
interface Plan {
  id: PlanCode;
  name: string;
  monthly_price_mxn: number;
  monthly?: number;
  features?: string[];
}

function mxn(n: number) {
  return `$${n.toLocaleString('es-MX')}`;
}

function promoReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'NOT_FOUND':
      return 'Código no existe.';
    case 'DISABLED':
      return 'Código deshabilitado.';
    case 'EXPIRED':
      return 'Código expirado.';
    case 'EXHAUSTED':
      return 'Código agotado.';
    case 'MIN_AMOUNT':
      return 'No alcanza el monto mínimo.';
    case 'NOT_APPLICABLE':
      return 'No aplica para membresías.';
    default:
      return 'Código inválido.';
  }
}

const PAYMENT_METHODS: {
  code: 'CASH' | 'CARD_TERMINAL';
  label: string;
  hint: string;
  Icon: typeof Wallet;
}[] = [
  {
    code: 'CASH',
    label: 'Efectivo',
    hint: 'El socio paga en caja',
    Icon: Wallet,
  },
  {
    code: 'CARD_TERMINAL',
    label: 'Terminal',
    hint: 'Pasaste su tarjeta en el TPV',
    Icon: CreditCard,
  },
];

export default function StaffWalkInPage() {
  // Plan catalog from public endpoint — keeps pricing single-sourced.
  const { data: plansData } = useQuery({
    queryKey: ['memberships', 'plans'],
    queryFn: async () =>
      (await api.get('/memberships/plans')).data as { plans: Plan[] },
  });
  const plans = plansData?.plans ?? [];

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    birthDate: '', // YYYY-MM-DD — recepción lo captura verbal
    plan: 'PRO' as PlanCode,
    method: 'CASH' as PaymentMethod,
    promoCode: '',
  });

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === form.plan),
    [plans, form.plan],
  );
  const planPrice = selectedPlan?.monthly_price_mxn ?? selectedPlan?.monthly ?? 0;
  // Inscripción única ($100) — política 2026-05: ahora SOLO se cobra
  // en STARTER al socio nuevo. PRO/ELITE ya la traen incluida en el
  // precio. Walk-in siempre es socio nuevo, así que la sumamos
  // directo cuando el plan elegido es Básico. Sync con
  // INSCRIPTION_PRICE_MXN en apps/api/src/lib/memberships.js.
  const INSCRIPTION_MXN = 100;
  const inscriptionPreview =
    form.plan === 'STARTER' ? INSCRIPTION_MXN : 0;

  // Promo validation, debounced. We hit /promocodes/validate after the
  // receptionist stops typing for 400 ms so each keystroke isn't a round
  // trip. The result drives both the live discount preview and the
  // total. The actual charge happens server-side at /staff/register-member,
  // so this is purely UX — even if validation is stale, the backend
  // re-validates before accepting the promo.
  const trimmedCode = form.promoCode.trim();
  const [debouncedCode, setDebouncedCode] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCode(trimmedCode), 400);
    return () => clearTimeout(t);
  }, [trimmedCode]);

  const promoQ = useQuery({
    queryKey: ['promo-validate', debouncedCode, planPrice],
    queryFn: () =>
      staffPosApi.validatePromo({
        code: debouncedCode,
        amount_mxn: planPrice,
        applies_to: 'MEMBERSHIP',
      }),
    enabled: debouncedCode.length >= 1 && planPrice > 0,
    staleTime: 30_000,
    retry: false,
  });

  const promoChecking =
    trimmedCode.length > 0 &&
    (debouncedCode !== trimmedCode || promoQ.isFetching);
  const promoValid = !!promoQ.data?.valid && trimmedCode === debouncedCode;
  const promoDiscount = promoValid ? promoQ.data?.discount_mxn ?? 0 : 0;
  const promoReason = !promoValid && promoQ.data ? promoQ.data.reason : null;

  const totalPreview = Math.max(0, planPrice - promoDiscount) + inscriptionPreview;

  const [result, setResult] = useState<RegisterMemberResponse | null>(null);

  const register = useMutation({
    mutationFn: () =>
      staffPosApi.registerMember({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        birth_date: form.birthDate, // YYYY-MM-DD del input
        plan: form.plan,
        billing_cycle: 'MONTHLY',
        payment_method: form.method,
        promo_code: form.promoCode.trim() || undefined,
      }),
    onSuccess: (r) => setResult(r),
    onError: (e: any) => {
      alert(e?.message ?? e?.response?.data?.error?.message ?? 'Error al inscribir');
    },
  });

  const canSubmit =
    form.name.trim().length >= 2 &&
    /^\+?\d{10,15}$/.test(form.phone.trim().replace(/\s/g, '')) &&
    !!form.birthDate &&
    !register.isPending;

  async function sendWhatsappLink() {
    if (!result) return;
    try {
      await api.post(`/admin/members/${result.user_id}/whatsapp`, {
        body:
          `Hola ${form.name.split(' ')[0]} 👋\n\n` +
          `Configura tu acceso a CED·GYM:\n👉 ${result.welcome_link}\n\n` +
          `Crea tu contraseña, sube tu selfie y recibe tu QR de entrada.`,
      });
      alert('Mensaje enviado por WhatsApp.');
    } catch {
      window.open(result.welcome_link, '_blank');
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100';
  const labelCls =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600';

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header compacto: solo título + tagline corto, sin descripción larga.
          El layout queda 2-col en lg+ para que TODO quepa en una pantalla
          de 1080p sin scroll. En mobile sigue siendo single-column. */}
      <header className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25">
          <UserPlus className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Inscribir socio
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            Llena los datos, cobra y listo — recibe un WhatsApp con el link.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* ─── Columna izquierda: datos + plan ────────────── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Datos del socio
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Nombre completo *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls}
                  placeholder="Diego López"
                />
              </div>
              <div>
                <label className={labelCls}>WhatsApp *</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputCls}
                  placeholder="+52 614 123 4567"
                  inputMode="tel"
                />
              </div>
              <div>
                <label className={labelCls}>Fecha de nacimiento *</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm({ ...form, birthDate: e.target.value })
                  }
                  className={inputCls}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Plan
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {plans.map((p) => {
                const active = form.plan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm({ ...form, plan: p.id })}
                    className={`rounded-xl border-2 p-2.5 text-left transition sm:p-3 ${
                      active
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-display text-sm font-bold text-slate-900 sm:text-base">
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-base font-bold tabular-nums text-blue-600 sm:text-lg">
                      {mxn(p.monthly_price_mxn ?? p.monthly ?? 0)}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 sm:text-[10px]">
                      Mensual
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ─── Columna derecha: pago + cupón + total/CTA ────── */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              ¿Cómo pagó?
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const active = form.method === m.code;
                const Icon = m.Icon;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, method: m.code as PaymentMethod })
                    }
                    className={`flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left transition sm:p-3 ${
                      active
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900">
                        {m.label}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {m.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Cupón (opcional)
            </h2>
            <div className="relative">
              <input
                type="text"
                value={form.promoCode}
                onChange={(e) =>
                  setForm({ ...form, promoCode: e.target.value.toUpperCase() })
                }
                placeholder="Ej. AMIGOS50"
                className={`${inputCls} pr-10 ${
                  trimmedCode.length === 0
                    ? ''
                    : promoChecking
                      ? 'border-slate-300'
                      : promoValid
                        ? 'border-emerald-400 ring-emerald-100'
                        : 'border-rose-400 ring-rose-100'
                }`}
                autoCapitalize="characters"
              />
              {trimmedCode.length > 0 && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  {promoChecking ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : promoValid ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                  )}
                </span>
              )}
            </div>
            {trimmedCode.length > 0 &&
              (promoChecking ? (
                <p className="text-[11px] text-slate-500">Validando…</p>
              ) : promoValid ? (
                <p className="text-[11px] font-semibold text-emerald-700">
                  ✓ Cupón válido — descuenta {mxn(promoDiscount)} del plan
                </p>
              ) : (
                <p className="text-[11px] font-semibold text-rose-600">
                  ✗ {promoReasonLabel(promoReason)}
                </p>
              ))}
          </section>

          <section className="border-t border-slate-200 pt-3">
            <div className="mb-2 space-y-0.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Plan {selectedPlan?.name ?? '—'}</span>
                <span className="tabular-nums">{mxn(planPrice)}</span>
              </div>
              {promoValid && promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cupón {trimmedCode}</span>
                  <span className="tabular-nums">−{mxn(promoDiscount)}</span>
                </div>
              )}
              {inscriptionPreview > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Inscripción única</span>
                  <span className="tabular-nums">{mxn(inscriptionPreview)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Total a cobrar
                </div>
                <div className="font-display text-2xl font-bold tabular-nums text-blue-600 sm:text-3xl">
                  {mxn(totalPreview)}
                </div>
              </div>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => register.mutate()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:from-blue-700 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:text-base"
              >
                {register.isPending ? 'Inscribiendo…' : 'Cobrar e inscribir'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ─── Success modal ──────────────────────────────────── */}
      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => setResult(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <h3 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              ¡Socio inscrito!
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{form.name}</span>{' '}
              ya tiene membresía activa.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Cobrado</span>
                <span className="font-bold tabular-nums text-slate-900">
                  {mxn(result.amount_mxn)}
                </span>
              </div>
              {(result.inscription_amount_mxn ?? 0) > 0 && (
                <div className="mt-1 flex justify-between text-[12px] text-slate-500">
                  <span>Incluye inscripción única</span>
                  <span className="tabular-nums">
                    {mxn(result.inscription_amount_mxn ?? 0)}
                  </span>
                </div>
              )}
              {(result.discount_mxn ?? 0) > 0 && (
                <div className="mt-1 flex justify-between text-[12px] text-emerald-700">
                  <span>Descuento aplicado</span>
                  <span className="tabular-nums">
                    −{mxn(result.discount_mxn ?? 0)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100">
              <div className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="text-sm text-slate-700">
                  Le mandamos un WhatsApp a{' '}
                  <span className="font-mono text-slate-900">{form.phone}</span>{' '}
                  con el link para que <strong>cree su contraseña</strong> y{' '}
                  <strong>suba su selfie</strong>. La selfie es necesaria
                  para que pueda entrar al gym escaneando su QR.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={sendWhatsappLink}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reenviar link por WhatsApp
            </button>

            <button
              type="button"
              onClick={() => {
                setResult(null);
                setForm({
                  name: '',
                  phone: '',
                  email: '',
                  birthDate: '',
                  plan: 'PRO',
                  method: 'CASH',
                  promoCode: '',
                });
              }}
              className="mt-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Inscribir a otro socio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
