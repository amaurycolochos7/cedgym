'use client';

/**
 * PlansModal — in-portal plan picker + embedded MP Card Brick checkout.
 *
 * Flow (3 internal steps):
 *   1) 'plans'   — list plans from GET /memberships/plans, pick cycle.
 *   2) 'pay'     — mount MP <CardPayment /> brick, POST /memberships/subscribe-card.
 *   3) 'welcome' — show welcome copy + CTAs to QR / dashboard.
 *
 * Gates:
 *   - Requires `me.user.selfie_url` and `me.user.full_name` before "Continuar".
 *     If missing, surfaces a link to /portal/perfil.
 *
 * ENV:
 *   - NEXT_PUBLIC_MP_PUBLIC_KEY is required to mount the Card Brick.
 *     If missing (or the @mercadopago/sdk-react package isn't installed yet),
 *     we show a friendly fallback.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X,
  Check,
  Dumbbell,
  Flame,
  Trophy,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Camera,
  UserCircle2,
  PartyPopper,
  QrCode,
  LayoutDashboard,
  Tag,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ─── Types matching GET /memberships/plans ────────────────────────── */

type PlanId = 'STARTER' | 'PRO' | 'ELITE';
type Cycle = 'monthly' | 'quarterly' | 'annual';

interface PlanDTO {
  id: PlanId;
  name: string;
  tagline?: string;
  monthly_price_mxn: number;
  quarterly_price_mxn: number;
  annual_price_mxn: number;
  duration_days_monthly?: number;
  features: string[];
  popular?: boolean;
}

interface PlansResponse {
  plans: PlanDTO[];
  currency: string;
}

/* ─── Public API ───────────────────────────────────────────────────── */

export interface PlansModalProps {
  open: boolean;
  onClose: () => void;
  highlightPlan?: PlanId;
}

export function PlansModal({ open, onClose, highlightPlan }: PlansModalProps) {
  const [step, setStep] = useState<'plans' | 'pay' | 'welcome'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [welcomePayload, setWelcomePayload] = useState<{
    title?: string;
    benefits?: string[];
    planName?: string;
  } | null>(null);

  // Reset to step 1 whenever the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setStep('plans');
    setSelectedPlan(highlightPlan ?? null);
    setCycle('monthly');
    setPromoCode('');
    setPromoOpen(false);
    setWelcomePayload(null);
  }, [open, highlightPlan]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  // Close on Escape, except on the pay step (don't interrupt the brick).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'pay') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  const { data: plansData, isLoading: plansLoading } = useQuery<PlansResponse>({
    queryKey: ['memberships', 'plans'],
    queryFn: async () => (await api.get('/memberships/plans')).data,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: me } = useQuery<{ user: any }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    enabled: open,
  });

  const user = me?.user;
  const hasSelfie = !!user?.selfie_url;
  const hasFullName = !!(user?.full_name || user?.name);
  const profileReady = hasSelfie && hasFullName;

  const selectedPlanDTO = useMemo(
    () => plansData?.plans.find((p) => p.id === selectedPlan) ?? null,
    [plansData, selectedPlan],
  );

  const selectedAmount = useMemo(() => {
    if (!selectedPlanDTO) return 0;
    if (cycle === 'monthly') return selectedPlanDTO.monthly_price_mxn;
    if (cycle === 'quarterly') return selectedPlanDTO.quarterly_price_mxn;
    return selectedPlanDTO.annual_price_mxn;
  }, [selectedPlanDTO, cycle]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plans-modal-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => {
          if (step === 'pay') return; // don't close mid-payment
          onClose();
        }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      <div
        className={cn(
          'relative z-10 flex w-full max-h-[92vh] flex-col overflow-hidden bg-white shadow-2xl',
          'rounded-t-3xl sm:max-w-3xl sm:rounded-3xl',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 sm:px-7">
          {step !== 'plans' && step !== 'welcome' && (
            <button
              type="button"
              onClick={() => setStep('plans')}
              aria-label="Volver"
              className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h3
            id="plans-modal-title"
            className="font-display flex-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
          >
            {step === 'plans' && 'Elige tu plan'}
            {step === 'pay' && 'Paga con tarjeta'}
            {step === 'welcome' && '¡Bienvenido!'}
          </h3>
          {step !== 'pay' && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          {step === 'plans' && (
            <StepPlans
              loading={plansLoading}
              plans={plansData?.plans ?? []}
              cycle={cycle}
              onCycle={setCycle}
              selectedPlan={selectedPlan}
              onSelect={setSelectedPlan}
              profileReady={profileReady}
              hasSelfie={hasSelfie}
              hasFullName={hasFullName}
              promoOpen={promoOpen}
              setPromoOpen={setPromoOpen}
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              onContinue={() => {
                if (!selectedPlan) {
                  toast.error('Elige un plan para continuar');
                  return;
                }
                if (!profileReady) {
                  toast.error('Completa tu perfil antes de continuar');
                  return;
                }
                setStep('pay');
              }}
            />
          )}

          {step === 'pay' && selectedPlanDTO && (
            <StepPay
              plan={selectedPlanDTO}
              cycle={cycle}
              amount={selectedAmount}
              promoCode={promoCode.trim() || undefined}
              payerEmail={user?.email}
              onSuccess={(welcome, planName) => {
                setWelcomePayload({ ...welcome, planName });
                setStep('welcome');
              }}
              onBack={() => setStep('plans')}
            />
          )}

          {step === 'welcome' && (
            <StepWelcome
              planName={welcomePayload?.planName ?? selectedPlanDTO?.name}
              title={welcomePayload?.title}
              benefits={welcomePayload?.benefits ?? []}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * STEP 1 — Plan picker
 * ════════════════════════════════════════════════════════════════════*/

function StepPlans({
  loading,
  plans,
  cycle,
  onCycle,
  selectedPlan,
  onSelect,
  profileReady,
  hasSelfie,
  hasFullName,
  promoOpen,
  setPromoOpen,
  promoCode,
  setPromoCode,
  onContinue,
}: {
  loading: boolean;
  plans: PlanDTO[];
  cycle: Cycle;
  onCycle: (c: Cycle) => void;
  selectedPlan: PlanId | null;
  onSelect: (p: PlanId) => void;
  profileReady: boolean;
  hasSelfie: boolean;
  hasFullName: boolean;
  promoOpen: boolean;
  setPromoOpen: (v: boolean) => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      {!profileReady && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            {!hasSelfie ? <Camera className="h-5 w-5" /> : <UserCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-amber-900">
              {!hasSelfie && !hasFullName
                ? 'Completa tu perfil antes de comprar'
                : !hasSelfie
                ? 'Falta tu selfie'
                : 'Falta tu nombre completo'}
            </div>
            <div className="mt-0.5 text-sm text-amber-800/80">
              La usamos para identificarte en recepción.{' '}
              <Link
                href="/portal/perfil"
                className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
              >
                Ir a mi perfil →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Cycle toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          {(['monthly', 'quarterly', 'annual'] as Cycle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCycle(c)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition',
                cycle === c
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {c === 'monthly' && 'Mensual'}
              {c === 'quarterly' && 'Trimestral'}
              {c === 'annual' && 'Anual'}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <PlanCardModal
              key={p.id}
              plan={p}
              cycle={cycle}
              selected={selectedPlan === p.id}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </div>
      )}

      {/* Promo code (toggleable) */}
      <div className="rounded-2xl border border-dashed border-slate-300 p-3">
        {!promoOpen ? (
          <button
            type="button"
            onClick={() => setPromoOpen(true)}
            className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <Tag className="h-4 w-4" />
            Tengo un código de descuento
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              className="flex-1 min-w-[120px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setPromoCode('');
                setPromoOpen(false);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          Pagos seguros · Mercado Pago
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedPlan || !profileReady}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PlanCardModal({
  plan,
  cycle,
  selected,
  onSelect,
}: {
  plan: PlanDTO;
  cycle: Cycle;
  selected: boolean;
  onSelect: () => void;
}) {
  const icon =
    plan.id === 'STARTER' ? (
      <Dumbbell className="h-5 w-5" strokeWidth={2.25} />
    ) : plan.id === 'PRO' ? (
      <Flame className="h-5 w-5" strokeWidth={2.25} />
    ) : (
      <Trophy className="h-5 w-5" strokeWidth={2.25} />
    );

  // Calculate monthly equivalent for the current cycle to expose savings.
  const monthlyEquivalent =
    cycle === 'monthly'
      ? plan.monthly_price_mxn
      : cycle === 'quarterly'
      ? Math.round(plan.quarterly_price_mxn / 3)
      : Math.round(plan.annual_price_mxn / 12);

  const savingsPerMonth =
    cycle === 'monthly' ? 0 : Math.max(0, plan.monthly_price_mxn - monthlyEquivalent);

  const priceMain =
    cycle === 'monthly'
      ? plan.monthly_price_mxn
      : cycle === 'quarterly'
      ? plan.quarterly_price_mxn
      : plan.annual_price_mxn;

  const cycleLabel =
    cycle === 'monthly' ? '/mes' : cycle === 'quarterly' ? '/3 meses' : '/año';

  const popular = !!plan.popular;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex h-full flex-col rounded-2xl p-4 text-left ring-1 transition sm:p-5',
        selected
          ? popular
            ? 'bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white ring-2 ring-blue-600 shadow-lg shadow-blue-600/30'
            : 'bg-blue-50 text-slate-900 ring-2 ring-blue-600 shadow-md'
          : popular
          ? 'bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white ring-blue-600/60 shadow-md shadow-blue-600/20 hover:shadow-lg'
          : 'bg-white text-slate-900 ring-slate-200 hover:ring-blue-300 hover:shadow-sm',
      )}
    >
      {popular && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 ring-1 ring-slate-900/5 shadow-sm">
          Más elegido
        </span>
      )}

      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1',
            popular
              ? 'bg-white/15 text-white ring-white/30'
              : 'bg-blue-50 text-blue-700 ring-blue-200/60',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-display text-lg font-bold leading-tight">{plan.name}</div>
          {plan.tagline && (
            <div
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.14em]',
                popular ? 'text-white/80' : 'text-slate-500',
              )}
            >
              {plan.tagline}
            </div>
          )}
        </div>
      </div>

      <div className={cn('mb-3 border-b pb-3', popular ? 'border-white/15' : 'border-slate-100')}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black leading-none tabular-nums">
            ${priceMain.toLocaleString('es-MX')}
          </span>
          <span className={cn('text-xs', popular ? 'text-white/80' : 'text-slate-500')}>
            MXN <em className="not-italic">{cycleLabel}</em>
          </span>
        </div>
        {savingsPerMonth > 0 && (
          <div
            className={cn(
              'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
              popular
                ? 'bg-white/15 text-white ring-1 ring-white/20'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
            )}
          >
            <Sparkles className="h-3 w-3" />
            Ahorras ${savingsPerMonth.toLocaleString('es-MX')} al mes
          </div>
        )}
      </div>

      <ul className="mb-2 space-y-1.5 text-xs">
        {plan.features.slice(0, 5).map((f) => (
          <li
            key={f}
            className={cn(
              'flex items-start gap-1.5',
              popular ? 'text-white/90' : 'text-slate-700',
            )}
          >
            <Check
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                popular ? 'text-sky-200' : 'text-blue-600',
              )}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          'mt-auto pt-3 text-center text-[11px] font-bold uppercase tracking-[0.14em]',
          selected
            ? popular
              ? 'text-white'
              : 'text-blue-700'
            : popular
            ? 'text-white/80'
            : 'text-slate-500',
        )}
      >
        {selected ? '✓ Seleccionado' : 'Elegir este plan'}
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * STEP 2 — Embedded MP Card Brick
 * ════════════════════════════════════════════════════════════════════*/

function StepPay({
  plan,
  cycle,
  amount,
  promoCode,
  payerEmail,
  onSuccess,
  onBack,
}: {
  plan: PlanDTO;
  cycle: Cycle;
  amount: number;
  promoCode?: string;
  payerEmail?: string;
  onSuccess: (
    welcome: { title?: string; benefits?: string[] },
    planName: string,
  ) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

  const [brickReady, setBrickReady] = useState(false);
  const [sdkAvailable, setSdkAvailable] = useState<boolean | null>(null);
  const [mpModules, setMpModules] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Lazy-load the MP SDK so it's code-split into its own chunk (the SDK is
  // heavy and only needed at the pay step). Client-only — we depend on
  // window in initMercadoPago, and the modal is a 'use client' boundary.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey) {
        setSdkAvailable(false);
        return;
      }
      try {
        const mod = await import('@mercadopago/sdk-react');
        if (cancelled) return;
        try {
          mod.initMercadoPago(publicKey, { locale: 'es-MX' });
        } catch {
          /* initMercadoPago is idempotent but some versions throw on re-init */
        }
        setMpModules(mod);
        setSdkAvailable(true);
      } catch (e) {
        console.warn('[plans-modal] @mercadopago/sdk-react not available:', e);
        setSdkAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    setLastError(null);
    try {
      const res = await api.post('/memberships/subscribe-card', {
        plan: plan.id,
        cycle,
        token: formData.token,
        payment_method_id: formData.payment_method_id,
        installments: formData.installments ?? 1,
        payer_email: formData.payer?.email || payerEmail,
        promo_code: promoCode,
      });
      const data = res.data;
      if (data?.success) {
        toast.success('¡Pago aprobado! Activando tu membresía…');
        onSuccess(data.welcome ?? {}, plan.name);
      } else {
        setLastError('Respuesta inesperada del servidor.');
      }
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const code = err?.code ?? err?.response?.data?.error?.code;
      const message =
        err?.message ??
        err?.response?.data?.error?.message ??
        'No pudimos procesar el pago.';

      if (code === 'SELFIE_REQUIRED' || status === 400) {
        toast.error(message);
        if (code === 'SELFIE_REQUIRED') {
          router.push('/portal/perfil');
        }
        setLastError(message);
      } else if (status === 402 || code === 'PAYMENT_DECLINED') {
        toast.error(`Pago rechazado: ${message}`);
        setLastError(`${message} — puedes intentar de nuevo con otra tarjeta.`);
      } else {
        toast.error(message);
        setLastError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 p-4 text-white">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            {cycle === 'monthly' ? 'Mensual' : cycle === 'quarterly' ? 'Trimestral' : 'Anual'}
          </div>
          <div className="font-display text-xl font-bold">{plan.name}</div>
          {promoCode && (
            <div className="mt-0.5 text-[11px] text-white/80">
              Cupón aplicado: <span className="font-semibold">{promoCode}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Total</div>
          <div className="font-display text-2xl font-bold tabular-nums">
            ${amount.toLocaleString('es-MX')} <span className="text-xs">MXN</span>
          </div>
        </div>
      </div>

      {lastError && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {lastError}
        </div>
      )}

      {/* Brick / fallbacks */}
      {sdkAvailable === false || !publicKey ? (
        <MpFallback publicKeyMissing={!publicKey} />
      ) : sdkAvailable === null ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="rounded-2xl border border-slate-200 p-3 sm:p-4">
          {!brickReady && (
            <div className="mb-2 h-64 animate-pulse rounded-xl bg-slate-100" />
          )}
          {(() => {
            const CardPayment: any = mpModules?.CardPayment;
            if (!CardPayment) return null;
            return (
              <CardPayment
                initialization={{
                  amount,
                  payer: payerEmail ? { email: payerEmail } : undefined,
                }}
                customization={{
                  paymentMethods: {
                    minInstallments: 1,
                    maxInstallments: 12,
                  },
                  visual: { style: { theme: 'default' } },
                }}
                onReady={() => setBrickReady(true)}
                onSubmit={async (data: any) => {
                  // data shape from MP SDK: { formData: {...} }
                  const formData = data?.formData ?? data;
                  await handleSubmit(formData);
                }}
                onError={(error: any) => {
                  console.error('[CardPayment onError]', error);
                  setLastError(
                    error?.message ??
                      'Revisa los datos de tu tarjeta e intenta de nuevo.',
                  );
                }}
              />
            );
          })()}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Cambiar plan
        </button>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          Protegido · MP
        </p>
      </div>
    </div>
  );
}

function MpFallback({ publicKeyMissing }: { publicKeyMissing: boolean }) {
  return (
    <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-amber-900">
            Pagos con tarjeta no están habilitados todavía
          </div>
          <div className="mt-1 text-sm text-amber-800/90">
            {publicKeyMissing ? (
              <>
                Falta configurar <code className="font-mono">NEXT_PUBLIC_MP_PUBLIC_KEY</code> en{' '}
                <code className="font-mono">apps/web/.env.local</code>. Contacta al administrador.
              </>
            ) : (
              <>
                El paquete <code className="font-mono">@mercadopago/sdk-react</code> aún no está
                instalado en el portal. Pídele al equipo que ejecute{' '}
                <code className="font-mono">npm install @mercadopago/sdk-react</code>.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * STEP 3 — Welcome
 * ════════════════════════════════════════════════════════════════════*/

function StepWelcome({
  planName,
  title,
  benefits,
  onClose,
}: {
  planName?: string;
  title?: string;
  benefits: string[];
  onClose: () => void;
}) {
  const router = useRouter();

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-600/30">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h3 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {title ?? '¡Bienvenido a CED·GYM!'}
      </h3>
      {planName && (
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">
          Plan {planName} activado
        </p>
      )}
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Tu membresía está activa. Ya puedes entrar al gym y empezar a entrenar.
      </p>

      {benefits.length > 0 && (
        <ul className="mt-5 w-full max-w-md space-y-2 rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-200">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => go('/portal/qr')}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
        >
          <QrCode className="h-4 w-4" />
          Mostrar mi QR
        </button>
        <button
          type="button"
          onClick={() => go('/portal/dashboard')}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <LayoutDashboard className="h-4 w-4" />
          Ver dashboard
        </button>
      </div>
    </div>
  );
}
