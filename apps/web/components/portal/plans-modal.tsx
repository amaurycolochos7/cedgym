'use client';

/**
 * PlansModal — in-portal plan picker + Mercado Pago Checkout Pro redirect.
 *
 * Flow:
 *   1) 'plans'   — list plans from GET /memberships/plans, pick cycle.
 *   2) 'pay'     — POST /memberships/subscribe → window.location to MP's
 *                  hosted checkout page. After payment MP redirects back
 *                  to /portal/membership?mp=success|failed|pending.
 *   3) 'welcome' — only used for the 100% off bypass (no MP redirect).
 *
 * Gates:
 *   - Requires `me.user.selfie_url` and `me.user.full_name` before "Continuar".
 *     If missing, surfaces a link to /portal/perfil.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Camera,
  UserCircle2,
  PartyPopper,
  QrCode,
  LayoutDashboard,
  Tag,
} from 'lucide-react';

/**
 * Extracts a human-readable message from an API error, stripping raw
 * zod validation JSON (`[{"code":"invalid_type"...}]`) that our backend
 * sometimes passes through unformatted. Always returns prose, never JSON.
 */
function friendlyApiError(err: unknown, fallback: string): string {
  const raw =
    (err as any)?.message ??
    (err as any)?.response?.data?.error?.message ??
    (err as any)?.response?.data?.message ??
    '';
  const s = String(raw || '').trim();
  if (!s) return fallback;
  // Raw zod error (starts with "[" + has code/path). Don't expose it.
  if (s.startsWith('[') && /"code"|"path"/.test(s)) return fallback;
  return s;
}

function reasonLabel(reason?: string | null) {
  switch (reason) {
    case 'NOT_FOUND':
      return 'Ese código no existe.';
    case 'DISABLED':
      return 'Ese código está pausado.';
    case 'EXPIRED':
      return 'Ese código ya expiró.';
    case 'EXHAUSTED':
      return 'Ese código llegó a su límite de usos.';
    case 'MIN_AMOUNT':
      return 'El monto de compra no alcanza para este código.';
    case 'NOT_APPLICABLE':
      return 'Ese código no aplica para membresías.';
    case 'ERROR':
      return 'No pudimos validar el código. Intenta de nuevo.';
    default:
      return 'Código inválido.';
  }
}
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ─── Types matching GET /memberships/plans ────────────────────────── */

type PlanId = 'STARTER' | 'PRO' | 'ELITE';
type Cycle = 'monthly';

interface PlanDTO {
  id: PlanId;
  name: string;
  tagline?: string;
  monthly_price_mxn: number;
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

  // Close on Escape, except on the pay step (don't interrupt redirect).
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

  const selectedAmount = useMemo(
    () => selectedPlanDTO?.monthly_price_mxn ?? 0,
    [selectedPlanDTO],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90]"
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
        className="absolute inset-0 bg-slate-900/75 backdrop-blur-md"
      />

      {/* Mobile: pin to all four sides (true full-screen, no stray top gap).
          Desktop: center a card with max width / height. */}
      <div
        className={cn(
          'absolute inset-0 z-10 flex flex-col overflow-hidden bg-white shadow-2xl',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-3xl sm:rounded-3xl',
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
              onContinue={(planId) => {
                if (!planId) {
                  toast.error('Elige un plan para continuar');
                  return;
                }
                if (!profileReady) {
                  toast.error('Completa tu perfil antes de continuar');
                  return;
                }
                // Keep state in sync in case the caller didn't pre-set it.
                setSelectedPlan(planId);
                setStep('pay');
              }}
            />
          )}

          {step === 'pay' && selectedPlanDTO && (
            <StepPay
              plan={selectedPlanDTO}
              cycle={cycle}
              amount={selectedAmount}
              promoCode={promoCode}
              setPromoCode={setPromoCode}
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
  onContinue: (planId: PlanId) => void;
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

      {/* Plan cards — mensual only */}
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
              onSelect={() => {
                onSelect(p.id);
                // Auto-advance to the pay step on click — no separate
                // "Continuar" button. Pass planId explicitly because
                // the React state update from onSelect hasn't landed
                // yet when onContinue runs in the same tick.
                onContinue(p.id);
              }}
            />
          ))}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        Pagos seguros · Mercado Pago
      </p>
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

  // Monthly-only product: there's no cycle toggle, the card just
  // shows the monthly price.
  const priceMain = plan.monthly_price_mxn;
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
            MXN <em className="not-italic">/mes</em>
          </span>
        </div>
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
  setPromoCode,
  payerEmail,
  onSuccess,
  onBack,
}: {
  plan: PlanDTO;
  cycle: Cycle;
  amount: number;
  promoCode: string;
  setPromoCode: (v: string) => void;
  payerEmail?: string;
  onSuccess: (
    welcome: { title?: string; benefits?: string[] },
    planName: string,
  ) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Promo-code preview state. We call /promocodes/validate every time
  // the user taps "Aplicar" and render the discount/total. On 100% off
  // the modal shows the courtesy bypass button instead of the MP redirect.
  const [promoDraft, setPromoDraft] = useState(promoCode);
  const [promoPreview, setPromoPreview] = useState<{
    valid: boolean;
    reason?: string | null;
    discount_mxn: number;
    final_amount: number;
  } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  const effectiveAmount = promoPreview?.valid
    ? promoPreview.final_amount
    : amount;
  const is100Off = promoPreview?.valid && promoPreview.final_amount === 0;

  const applyPromo = async () => {
    const code = promoDraft.trim().toUpperCase();
    if (!code) {
      setPromoPreview(null);
      setPromoCode('');
      return;
    }
    setPromoChecking(true);
    try {
      const { data } = await api.post('/promocodes/validate', {
        code,
        amount_mxn: amount,
        applies_to: 'MEMBERSHIP',
      });
      setPromoPreview({
        valid: !!data.valid,
        reason: data.reason,
        discount_mxn: data.discount_mxn ?? 0,
        final_amount: data.final_amount_mxn_preview ?? data.final_amount ?? amount,
      });
      if (data.valid) {
        setPromoCode(code);
        toast.success(
          data.final_amount === 0
            ? 'Código 100% aplicado. Puedes activar sin pago.'
            : `Descuento aplicado: -$${(data.discount_mxn ?? 0).toLocaleString('es-MX')} MXN`,
        );
      } else {
        setPromoCode('');
        toast.error(reasonLabel(data.reason));
      }
    } catch (e: any) {
      toast.error(e?.message || 'No pudimos validar el código.');
      setPromoPreview({ valid: false, reason: 'ERROR', discount_mxn: 0, final_amount: amount });
      setPromoCode('');
    } finally {
      setPromoChecking(false);
    }
  };

  const clearPromo = () => {
    setPromoDraft('');
    setPromoCode('');
    setPromoPreview(null);
  };

  const submitFree = async () => {
    // 100%-off bypass: no card token. Backend detects amount === 0
    // and activates the membership directly via the promo_100 branch.
    setSubmitting(true);
    setLastError(null);
    try {
      // Backend schema marks payer_email as .optional() (accepts
      // undefined) but NOT .nullable() — explicitly omit the key when
      // the user has no email on file instead of sending null.
      const body: Record<string, unknown> = {
        plan: plan.id,
        cycle,
        token: 'courtesy',
        payment_method_id: 'courtesy',
        installments: 1,
      };
      if (payerEmail) body.payer_email = payerEmail;
      if (promoCode) body.promo_code = promoCode;

      const { data } = await api.post('/memberships/subscribe-card', body);
      if (data?.success) {
        toast.success('¡Membresía activada!');
        // Bust caches so the dashboard / membership tile re-fetch the
        // freshly activated membership instead of serving the stale
        // "no active membership" snapshot.
        qc.invalidateQueries({ queryKey: ['memberships'] });
        qc.invalidateQueries({ queryKey: ['auth', 'me'] });
        onSuccess(data.welcome ?? {}, plan.name);
      } else {
        setLastError('No pudimos activar la membresía. Intenta de nuevo.');
      }
    } catch (err: any) {
      setLastError(friendlyApiError(err, 'No pudimos activar la membresía.'));
      toast.error(friendlyApiError(err, 'No pudimos activar la membresía.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Checkout Pro flow: create a preference on the backend and redirect
  // the user to Mercado Pago's hosted checkout page. After payment, MP
  // sends them back to /portal/membership?mp=success|failed|pending and
  // the webhook activates the membership.
  const startCheckoutPro = async () => {
    setSubmitting(true);
    setLastError(null);
    try {
      const body: Record<string, unknown> = {
        plan: plan.id,
        billing_cycle: 'MONTHLY',
      };
      if (promoCode) body.promo_code = promoCode;

      const { data } = await api.post('/memberships/subscribe', body);
      const url = data?.init_point;
      if (!url) {
        setLastError('No pudimos iniciar el pago. Intenta de nuevo.');
        setSubmitting(false);
        return;
      }
      // Hand off to Mercado Pago. We don't reset `submitting` so the
      // button stays disabled until the page actually navigates.
      window.location.href = url;
    } catch (err: any) {
      const code = err?.code ?? err?.response?.data?.error?.code;
      const message =
        err?.message ??
        err?.response?.data?.error?.message ??
        'No pudimos iniciar el pago.';

      if (code === 'SELFIE_REQUIRED') {
        toast.error(message);
        router.push('/portal/perfil');
      }
      const friendly = friendlyApiError(err, message);
      toast.error(friendly);
      setLastError(friendly);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary pill — shows total with discount applied if any */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 p-4 text-white">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Mensual
          </div>
          <div className="font-display text-xl font-bold">{plan.name}</div>
          {promoPreview?.valid && (
            <div className="mt-0.5 text-[11px] text-white/90">
              Código <span className="font-semibold">{promoCode}</span> · ahorras ${promoPreview.discount_mxn.toLocaleString('es-MX')}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Total</div>
          {promoPreview?.valid && promoPreview.discount_mxn > 0 && (
            <div className="text-xs text-white/70 line-through tabular-nums">
              ${amount.toLocaleString('es-MX')}
            </div>
          )}
          <div className="font-display text-2xl font-bold tabular-nums">
            ${effectiveAmount.toLocaleString('es-MX')} <span className="text-xs">MXN</span>
          </div>
        </div>
      </div>

      {/* Promo code input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-600">
          <Tag className="h-4 w-4 text-blue-600" />
          Código de descuento
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={promoDraft}
            onChange={(e) => setPromoDraft(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyPromo();
              }
            }}
            placeholder="CÓDIGO (opcional)"
            disabled={promoChecking || is100Off}
            className="flex-1 min-w-[140px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-50 disabled:text-slate-500"
          />
          {promoPreview?.valid ? (
            <button
              type="button"
              onClick={clearPromo}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Quitar
            </button>
          ) : (
            <button
              type="button"
              onClick={applyPromo}
              disabled={promoChecking || !promoDraft.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {promoChecking ? 'Validando…' : 'Aplicar'}
            </button>
          )}
        </div>
        {promoPreview?.valid === false && (
          <p className="mt-1.5 text-xs text-rose-600">
            {reasonLabel(promoPreview.reason)}
          </p>
        )}
        {promoPreview?.valid && (
          <p className="mt-1.5 text-xs text-emerald-700">
            {is100Off
              ? '100% de descuento. Puedes activar tu membresía sin pago.'
              : `Descuento aplicado: -$${promoPreview.discount_mxn.toLocaleString('es-MX')} MXN`}
          </p>
        )}
      </div>

      {lastError && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {lastError}
        </div>
      )}

      {/* 100%-off: skip MP, activate directly */}
      {is100Off ? (
        <button
          type="button"
          onClick={submitFree}
          disabled={submitting}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 py-4 font-display text-lg font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60"
        >
          {submitting ? 'Activando…' : '✓ Activar membresía sin costo'}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={startCheckoutPro}
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 py-4 font-display text-lg font-bold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-700 hover:to-sky-600 disabled:opacity-60"
          >
            {submitting ? 'Redirigiendo a Mercado Pago…' : `Pagar $${effectiveAmount.toLocaleString('es-MX')} con Mercado Pago`}
          </button>
          <p className="text-center text-[11px] text-slate-500">
            Te llevamos a Mercado Pago para completar el cobro de forma segura.
            <br />
            Aceptamos tarjetas, OXXO, transferencia y wallet de MP.
          </p>
        </>
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
