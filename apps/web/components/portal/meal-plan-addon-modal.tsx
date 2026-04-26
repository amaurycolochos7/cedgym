'use client';

/**
 * MealPlanAddonModal — in-portal one-shot purchase of the "Plan Alimenticio"
 * add-on ($499 MXN) for users whose membership doesn't include the feature
 * (STARTER) or who already used their period quota and want another plan
 * before renewal.
 *
 * Flow (2 internal steps — no plan picker):
 *   1) 'pay'     — mount MP <CardPayment /> brick, POST /addons/meal-plan/purchase-card.
 *   2) 'welcome' — confirmation copy + CTAs to generate the plan / close.
 *
 * Backend contract:
 *   GET  /addons/meal-plan/price       → { price_mxn: 499, currency: 'MXN' }
 *   POST /addons/meal-plan/purchase-card → { success, payment, addon, welcome }
 *   POST /promocodes/validate (applies_to: 'MEAL_PLAN_ADDON')
 *
 * Logic mostly mirrored from plans-modal.tsx (the membership checkout) so
 * the visual + interaction behavior stays consistent. Helpers
 * (friendlyApiError, friendlyMpError, reasonLabel, MpFallback) are
 * re-declared locally on purpose — keeping the scope contained instead
 * of factoring out a shared module right now.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X,
  Check,
  CheckCircle,
  ArrowLeft,
  ShieldCheck,
  Tag,
  Utensils,
  PartyPopper,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ─── Local helpers (mirrored from plans-modal) ──────────────────────── */

function friendlyApiError(err: unknown, fallback: string): string {
  const raw =
    (err as any)?.message ??
    (err as any)?.response?.data?.error?.message ??
    (err as any)?.response?.data?.message ??
    '';
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (s.startsWith('[') && /"code"|"path"/.test(s)) return fallback;
  return s;
}

function friendlyMpError(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : ((input as any)?.message || (input as any)?.status_detail || '');
  const code = String(raw).toLowerCase();

  if (code.includes('no_payment_method_for_provided_bin'))
    return 'Esa tarjeta no está habilitada para esta cuenta. Si estás probando, pide al admin un código 100 % OFF.';
  if (code.includes('invalid_card_number') || code.includes('card_number'))
    return 'Revisa el número de tarjeta.';
  if (code.includes('invalid_expiration_date') || code.includes('expiration'))
    return 'La fecha de vencimiento no es válida.';
  if (code.includes('invalid_security_code') || code.includes('security_code'))
    return 'El código de seguridad (CVV) no es válido.';
  if (code.includes('invalid_cardholder_name') || code.includes('cardholder'))
    return 'Escribe el nombre tal como aparece en la tarjeta.';

  if (code.includes('cc_rejected_insufficient_amount')) return 'Fondos insuficientes.';
  if (code.includes('cc_rejected_bad_filled_card_number'))
    return 'El número de tarjeta está mal. Revísalo.';
  if (code.includes('cc_rejected_bad_filled_date')) return 'Fecha de vencimiento mal escrita.';
  if (code.includes('cc_rejected_bad_filled_security_code')) return 'CVV incorrecto.';
  if (code.includes('cc_rejected_call_for_authorize'))
    return 'Tu banco pide autorizar el pago. Llámale y vuelve a intentar.';
  if (code.includes('cc_rejected_card_disabled'))
    return 'Tu tarjeta está desactivada. Contacta a tu banco.';
  if (code.includes('cc_rejected_high_risk'))
    return 'El pago fue rechazado por seguridad. Intenta con otra tarjeta.';
  if (code.includes('cc_rejected_max_attempts'))
    return 'Muchos intentos fallidos. Espera unos minutos o usa otra tarjeta.';
  if (code.includes('cc_rejected_other_reason') || code.includes('cc_rejected'))
    return 'Tu banco rechazó el pago. Prueba con otra tarjeta.';

  return 'Hubo un problema con el pago. Revisa los datos y vuelve a intentar.';
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
      return 'Ese código no aplica para este plan extra.';
    case 'ERROR':
      return 'No pudimos validar el código. Intenta de nuevo.';
    default:
      return 'Código inválido.';
  }
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface PriceResponse {
  price_mxn: number;
  currency: string;
}

interface WelcomePayload {
  title?: string;
  benefits?: string[];
}

/* ─── Public API ─────────────────────────────────────────────────────── */

export interface MealPlanAddonModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DEFAULT_PRICE = 499;

const ADDON_BENEFITS = [
  '7 días de comidas mexicanas balanceadas',
  'Hasta 6 opciones por día (desayuno, snacks, comida, cena)',
  'Macros calibrados a tu perfil y objetivo',
  'Lista de compras descargable',
];

export function MealPlanAddonModal({ open, onClose, onSuccess }: MealPlanAddonModalProps) {
  const [step, setStep] = useState<'pay' | 'welcome'>('pay');
  const [promoCode, setPromoCode] = useState('');
  const [welcomePayload, setWelcomePayload] = useState<WelcomePayload | null>(null);

  // Reset on (re-)open.
  useEffect(() => {
    if (!open) return;
    setStep('pay');
    setPromoCode('');
    setWelcomePayload(null);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  // Pre-warm MP SDK so the brick mount feels instant.
  useEffect(() => {
    if (!open) return;
    import('@mercadopago/sdk-react').catch(() => {});
  }, [open]);

  // Esc to close — but never mid-payment.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'pay') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  const { data: priceData } = useQuery<PriceResponse>({
    queryKey: ['addons', 'meal-plan', 'price'],
    queryFn: async () => (await api.get('/addons/meal-plan/price')).data,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: me } = useQuery<{ user: any }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    enabled: open,
  });

  const price = priceData?.price_mxn ?? DEFAULT_PRICE;
  const user = me?.user;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-plan-addon-modal-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => {
          if (step === 'pay') return;
          onClose();
        }}
        className="absolute inset-0 bg-slate-900/75 backdrop-blur-md"
      />

      <div
        className={cn(
          'absolute inset-0 z-10 flex flex-col overflow-hidden bg-white shadow-2xl',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-2xl sm:rounded-3xl',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 sm:px-7">
          <h3
            id="meal-plan-addon-modal-title"
            className="font-display flex-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
          >
            {step === 'pay' && 'Comprar plan alimenticio'}
            {step === 'welcome' && '¡Listo!'}
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
          {step === 'pay' && (
            <StepPay
              price={price}
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              payerEmail={user?.email}
              onSuccess={(welcome) => {
                setWelcomePayload(welcome);
                setStep('welcome');
              }}
              onCancel={onClose}
            />
          )}

          {step === 'welcome' && (
            <StepWelcome
              title={welcomePayload?.title}
              benefits={welcomePayload?.benefits ?? []}
              onPrimary={() => {
                onClose();
                onSuccess?.();
              }}
              onSecondary={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * STEP — Pay (MP Card Brick)
 * ════════════════════════════════════════════════════════════════════*/

function StepPay({
  price,
  promoCode,
  setPromoCode,
  payerEmail,
  onSuccess,
  onCancel,
}: {
  price: number;
  promoCode: string;
  setPromoCode: (v: string) => void;
  payerEmail?: string;
  onSuccess: (welcome: WelcomePayload) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

  const [brickReady, setBrickReady] = useState(false);
  const [sdkAvailable, setSdkAvailable] = useState<boolean | null>(null);
  const [mpModules, setMpModules] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const [promoDraft, setPromoDraft] = useState(promoCode);
  const [promoPreview, setPromoPreview] = useState<{
    valid: boolean;
    reason?: string | null;
    discount_mxn: number;
    final_amount: number;
  } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

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
          /* idempotent re-init ok */
        }
        setMpModules(mod);
        setSdkAvailable(true);
      } catch (e) {
        console.warn('[meal-plan-addon-modal] @mercadopago/sdk-react not available:', e);
        setSdkAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const effectiveAmount = promoPreview?.valid ? promoPreview.final_amount : price;
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
        amount_mxn: price,
        applies_to: 'MEAL_PLAN_ADDON',
      });
      setPromoPreview({
        valid: !!data.valid,
        reason: data.reason,
        discount_mxn: data.discount_mxn ?? 0,
        final_amount: data.final_amount_mxn_preview ?? data.final_amount ?? price,
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
      setPromoPreview({ valid: false, reason: 'ERROR', discount_mxn: 0, final_amount: price });
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

  const handlePurchaseError = (err: any) => {
    const status = err?.status ?? err?.response?.status;
    const code = err?.code ?? err?.response?.data?.error?.code;
    const message =
      err?.message ?? err?.response?.data?.error?.message ?? 'No pudimos procesar el pago.';

    if (code === 'MEMBERSHIP_REQUIRED') {
      toast.error('Necesitas una membresía activa para comprar este plan extra.');
      router.push('/portal/membership');
      setLastError(message);
      return;
    }
    if (code === 'ADDON_ALREADY_ACTIVE') {
      toast('Ya tienes un plan extra activo — úsalo antes de comprar otro.', { icon: 'ℹ️' });
      qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
      qc.invalidateQueries({ queryKey: ['addons', 'meal-plan', 'me'] });
      onCancel();
      return;
    }
    if (status === 402 || code === 'PAYMENT_DECLINED') {
      const friendly = friendlyMpError(message);
      toast.error(friendly);
      setLastError(`${friendly} Puedes intentar con otra tarjeta.`);
      return;
    }
    const friendly = friendlyApiError(err, friendlyMpError(message));
    toast.error(friendly);
    setLastError(friendly);
  };

  const submitFree = async () => {
    setSubmitting(true);
    setLastError(null);
    try {
      const body: Record<string, unknown> = {
        token: 'courtesy',
        payment_method_id: 'courtesy',
        installments: 1,
      };
      if (payerEmail) body.payer_email = payerEmail;
      if (promoCode) body.promo_code = promoCode;

      const { data } = await api.post('/addons/meal-plan/purchase-card', body);
      if (data?.success) {
        toast.success('¡Plan extra activado!');
        qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
        qc.invalidateQueries({ queryKey: ['addons', 'meal-plan', 'me'] });
        onSuccess(data.welcome ?? {});
      } else {
        setLastError('No pudimos activar el plan extra. Intenta de nuevo.');
      }
    } catch (err: any) {
      handlePurchaseError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    setLastError(null);
    try {
      const body: Record<string, unknown> = {
        token: formData.token,
        payment_method_id: formData.payment_method_id,
        installments: formData.installments ?? 1,
      };
      const emailFromBrick = formData.payer?.email;
      if (emailFromBrick || payerEmail) {
        body.payer_email = emailFromBrick || payerEmail;
      }
      if (promoCode) body.promo_code = promoCode;

      const { data } = await api.post('/addons/meal-plan/purchase-card', body);
      if (data?.success) {
        toast.success('¡Pago aprobado! Activando tu plan extra…');
        qc.invalidateQueries({ queryKey: ['ai', 'quota', 'me'] });
        qc.invalidateQueries({ queryKey: ['addons', 'meal-plan', 'me'] });
        onSuccess(data.welcome ?? {});
      } else {
        setLastError('Respuesta inesperada del servidor.');
      }
    } catch (err: any) {
      handlePurchaseError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Compact hero — single-row layout, no awkward title wrap */}
      <div className="rounded-2xl bg-blue-600 p-4 text-white sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Utensils className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-tight sm:text-xl">
                Plan alimenticio
              </div>
              <div className="mt-0.5 text-[12px] text-white/80">
                Pago único · 7 días personalizados
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right leading-none">
            {promoPreview?.valid && promoPreview.discount_mxn > 0 && (
              <div className="mb-0.5 text-[11px] text-white/70 line-through tabular-nums">
                ${price.toLocaleString('es-MX')}
              </div>
            )}
            <div className="font-display text-[26px] font-bold tabular-nums">
              ${effectiveAmount.toLocaleString('es-MX')}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
              MXN
            </div>
          </div>
        </div>
        {promoPreview?.valid && (
          <div className="mt-3 flex items-center gap-2 border-t border-white/15 pt-3 text-[12px] text-white/90">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Código <span className="font-semibold">{promoCode}</span> · ahorras $
              {promoPreview.discount_mxn.toLocaleString('es-MX')}
            </span>
          </div>
        )}
      </div>

      {/* Benefits — flat list, no boxed card */}
      <ul className="space-y-2 px-1">
        {ADDON_BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-[14px] text-slate-700">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
              strokeWidth={2.75}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Promo code — collapsed trigger → expands on demand */}
      {!promoOpen && !promoPreview ? (
        <button
          type="button"
          onClick={() => setPromoOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 transition hover:text-blue-800"
        >
          <Tag className="h-3.5 w-3.5" />
          ¿Tienes un código de descuento?
        </button>
      ) : (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <Tag className="h-3.5 w-3.5" />
            Código de descuento
          </label>
          <div className="flex items-center gap-2">
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
              placeholder="CÓDIGO"
              autoFocus
              disabled={promoChecking || is100Off}
              className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {promoPreview?.valid ? (
              <button
                type="button"
                onClick={clearPromo}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Quitar
              </button>
            ) : (
              <button
                type="button"
                onClick={applyPromo}
                disabled={promoChecking || !promoDraft.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {promoChecking ? '…' : 'Aplicar'}
              </button>
            )}
          </div>
          {promoPreview?.valid === false && (
            <p className="text-xs text-rose-600">{reasonLabel(promoPreview.reason)}</p>
          )}
          {promoPreview?.valid && !is100Off && (
            <p className="text-xs text-emerald-700">
              Descuento aplicado: -${promoPreview.discount_mxn.toLocaleString('es-MX')} MXN
            </p>
          )}
          {promoPreview?.valid && is100Off && (
            <p className="text-xs text-emerald-700">
              100% de descuento — puedes activar tu plan sin pago.
            </p>
          )}
        </div>
      )}

      {lastError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {lastError}
        </div>
      )}

      {is100Off ? (
        <button
          type="button"
          onClick={submitFree}
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? 'Activando…' : 'Activar mi plan sin costo'}
        </button>
      ) : sdkAvailable === false || !publicKey ? (
        <MpFallback publicKeyMissing={!publicKey} />
      ) : sdkAvailable === null ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="rounded-2xl border border-slate-200 p-3 sm:p-4">
          {!brickReady && <div className="mb-2 h-64 animate-pulse rounded-xl bg-slate-100" />}
          {(() => {
            const CardPayment: any = mpModules?.CardPayment;
            if (!CardPayment) return null;
            return (
              <CardPayment
                key={`brick-${effectiveAmount}`}
                initialization={{
                  amount: effectiveAmount,
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
                  const formData = data?.formData ?? data;
                  await handleSubmit(formData);
                }}
                onError={(error: any) => {
                  console.error('[CardPayment onError]', error);
                  setLastError(friendlyMpError(error));
                }}
              />
            );
          })()}
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900 disabled:opacity-50"
        >
          Cancelar
        </button>
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
                <code className="font-mono">apps/web/.env.local</code>. Contacta al
                administrador.
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
 * STEP — Welcome
 * ════════════════════════════════════════════════════════════════════*/

function StepWelcome({
  title,
  benefits,
  onPrimary,
  onSecondary,
}: {
  title?: string;
  benefits: string[];
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const list = benefits.length
    ? benefits
    : ['1 plan alimenticio personalizado con IA disponible', 'Lista de compras incluida'];

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-600/30">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h3 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {title ?? '¡Plan extra activado!'}
      </h3>
      <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">
        Plan alimenticio listo para generar
      </p>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Tu pago fue aprobado. Genera tu plan ahora y empieza a comer mejor sin pensarlo.
      </p>

      <ul className="mt-5 w-full max-w-md space-y-2 rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-200">
        {list.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPrimary}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
        >
          <Sparkles className="h-4 w-4" />
          Generar mi plan ahora
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
