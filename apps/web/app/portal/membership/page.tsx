'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Snowflake,
  RefreshCw,
  Calendar,
  Camera,
  AlertTriangle,
  Check,
  Lock,
  Sparkles,
} from 'lucide-react';
import { SelfieCapture } from '@/components/portal/selfie-capture';
import { PlansModal } from '@/components/portal/plans-modal';
import {
  planDisplayName,
  paymentStatusLabel,
  visiblePlanFeatures,
} from '@/lib/utils';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';

export default function PortalMembershipPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  // Plan to highlight inside the modal when it opens. Driven by the
  // ?plan=STARTER|PRO|ELITE query param the landing page sends after
  // a fresh registration ("Elegir Pro" → /register?redirect=...&plan=PRO),
  // and falls back to the user's current membership plan otherwise.
  const [highlightPlanFromUrl, setHighlightPlanFromUrl] = useState<
    'STARTER' | 'PRO' | 'ELITE' | null
  >(null);

  // Handle deep-link params on first paint:
  //   ?plan=STARTER|PRO|ELITE   → auto-open the plans modal with that highlight
  //   ?stripe=success&payment=X → confirmation toast after a 3DS-redirect return
  // We read window.location instead of useSearchParams() to avoid
  // forcing a Suspense boundary in the page (Next 14 build constraint).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    const planParam = (params.get('plan') || '').toUpperCase();
    if (planParam === 'STARTER' || planParam === 'PRO' || planParam === 'ELITE') {
      setHighlightPlanFromUrl(planParam);
      setPlansOpen(true);
    }

    const stripeStatus = params.get('stripe');
    if (stripeStatus === 'success') {
      toast.success('¡Pago confirmado! Activando tu membresía…');
      qc.invalidateQueries({ queryKey: ['memberships'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    }

    // Clean the query params so a refresh doesn't re-fire the toast or modal.
    ['plan', 'stripe', 'payment', 'payment_id', 'status'].forEach((k) =>
      params.delete(k),
    );
    const next = params.toString();
    router.replace(`/portal/membership${next ? `?${next}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const needsSelfie = !!me && !me?.user?.selfie_url;

  // GET /memberships/me returns `{ membership: {...} | null, days_remaining }`.
  // Unwrap so the rest of this page can read plan/status/expires_at directly.
  const { data: meResp, isLoading } = useQuery({
    queryKey: ['memberships', 'me'],
    queryFn: async () => (await api.get('/memberships/me')).data,
  });
  const membership = meResp?.membership
    ? {
        ...meResp.membership,
        days_remaining: meResp.days_remaining ?? 0,
        total_days: meResp.total_days ?? 30,
      }
    : null;

  const { data: history } = useQuery({
    queryKey: ['memberships', 'history'],
    queryFn: async () => (await api.get('/memberships/history')).data,
  });

  // Catálogo público de planes — lo usamos para mostrar la lista de
  // beneficios incluidos en el plan actual del socio (sección
  // "Beneficios de tu plan"). Cacheable: el catálogo cambia muy
  // pocas veces.
  const { data: plansResp } = useQuery({
    queryKey: ['memberships', 'plans'],
    queryFn: async () => (await api.get('/memberships/plans')).data,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;

  const days = membership?.days_remaining ?? 0;
  const totalDays = membership?.total_days ?? 30;
  const progressPct = Math.max(0, Math.min(100, 100 - (days / totalDays) * 100));
  const earlyDiscount = days <= 8 && days > 0;
  // STARTER no incluye congelamiento — la UI lo deshabilita y el
  // backend (POST /memberships/freeze) tira FREEZE_NOT_ALLOWED si
  // alguien lo intenta saltar.
  const canFreeze = membership?.plan === 'PRO' || membership?.plan === 'ELITE';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Mi membresía</h1>
          <p className="text-slate-500 mt-1">Gestiona tu plan y pagos.</p>
        </div>
      </div>

      {needsSelfie && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl ring-1 ring-amber-200 bg-amber-50 px-4 py-3">
          <Camera className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-amber-900">
              Sube tu selfie para activar tu plan
            </div>
            <div className="text-sm text-amber-800/80">
              La usamos para identificarte en la recepción. Es requisito antes
              de comprar o renovar.
            </div>
          </div>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => setSelfieOpen(true)}
          >
            <Camera className="w-4 h-4" /> Tomar selfie
          </button>
        </div>
      )}

      {!membership?.plan ? (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-8 text-center">
          <p className="text-slate-600 mb-4">No tienes una membresía activa.</p>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => setPlansOpen(true)}
            disabled={needsSelfie}
            title={needsSelfie ? 'Sube tu selfie primero' : undefined}
          >
            Ver planes
          </button>
          {needsSelfie && (
            <div className="text-xs text-slate-500 mt-2">
              Sube tu selfie antes de continuar.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-blue-500 to-sky-400 text-white rounded-3xl p-6 shadow-lg shadow-blue-500/20">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/80 font-semibold">Plan</div>
                <div className="font-display text-3xl font-bold">{planDisplayName(membership.plan)}</div>
                <div className="text-sm text-white/80 mt-1">
                  {membership.sport ?? 'General'} · Mensual
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-white/80 font-semibold">Vence en</div>
                <div className="font-display text-3xl font-bold tabular-nums">{days} días</div>
                <div className="text-xs text-white/70 mt-1">
                  {membership.expires_at?.slice(0, 10)}
                </div>
              </div>
            </div>
            <div className="mt-5 h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white/90"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {earlyDiscount && (
            <div className="bg-amber-50 ring-1 ring-amber-200 rounded-xl p-4 flex items-center gap-4">
              <div className="text-3xl">🎁</div>
              <div className="flex-1">
                <div className="font-semibold text-amber-900">¡Renueva ahora con 20% de descuento!</div>
                <div className="text-sm text-amber-800/80">
                  Tu membresía vence pronto. Renueva hoy y ahorra.
                </div>
              </div>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => setPlansOpen(true)}
                disabled={needsSelfie}
                title={needsSelfie ? 'Sube tu selfie primero' : undefined}
              >
                Renovar ahora
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <ActionCard
              icon={<RefreshCw className="w-5 h-5" />}
              title="Renovar"
              description={
                needsSelfie
                  ? 'Sube tu selfie primero'
                  : 'Extiende tu membresía'
              }
              onClick={() => setPlansOpen(true)}
              disabled={needsSelfie}
            />
            <ActionCard
              icon={
                canFreeze ? (
                  <Snowflake className="w-5 h-5" />
                ) : (
                  <Lock className="w-5 h-5" />
                )
              }
              title="Congelar"
              description={
                canFreeze
                  ? 'Pausa por viaje o lesión'
                  : 'Solo plan Pro y Élite — actualiza para activarlo'
              }
              onClick={() => {
                if (canFreeze) {
                  setFreezeOpen(true);
                } else {
                  // STARTER → mandamos al modal de planes para upsell.
                  toast.message('El congelamiento está disponible en Pro y Élite.', {
                    description: 'Actualiza tu plan para pausar tu membresía cuando viajes o te lesiones.',
                  });
                  setPlansOpen(true);
                }
              }}
              locked={!canFreeze}
            />
            <ActionCard
              icon={<Calendar className="w-5 h-5" />}
              title="Cambiar plan"
              description={
                needsSelfie ? 'Sube tu selfie primero' : 'Ver otros planes'
              }
              onClick={() => setPlansOpen(true)}
              disabled={needsSelfie}
            />
          </div>

          {/* Beneficios incluidos en el plan actual + CTA upgrade
              cuando aplica (STARTER → "ver Pro/Élite"). Las features
              vienen del catálogo público de /memberships/plans. */}
          <PlanBenefits
            currentPlan={membership.plan}
            plans={plansResp?.plans ?? []}
            onSeeOtherPlans={() => setPlansOpen(true)}
          />

          {membership.stripe_subscription_id && (
            <AutoRenewPanel
              autoRenew={!!membership.auto_renew}
              expiresAt={membership.expires_at}
            />
          )}

          <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-900">Historial de pagos</h3>
            {history?.items?.length ? (
              <div className="space-y-2">
                {history.items.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-slate-900 tabular-nums">${p.amount.toLocaleString('es-MX')} MXN</div>
                      <div className="text-xs text-slate-500">
                        {p.created_at?.slice(0, 10)} · {p.description ?? 'Membresía'}
                      </div>
                    </div>
                    <span
                      className={
                        p.status === 'APPROVED'
                          ? 'text-emerald-600 text-sm font-medium'
                          : p.status === 'PENDING'
                          ? 'text-amber-600 text-sm font-medium'
                          : 'text-slate-500 text-sm font-medium'
                      }
                    >
                      {paymentStatusLabel(p.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Sin pagos aún.</p>
            )}
          </div>
        </>
      )}

      {freezeOpen && <FreezeModal onClose={() => setFreezeOpen(false)} onDone={() => {
        setFreezeOpen(false);
        qc.invalidateQueries({ queryKey: ['memberships'] });
      }} />}

      {selfieOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setSelfieOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white ring-1 ring-slate-200 shadow-xl rounded-2xl p-6 w-full max-w-md"
          >
            <SelfieCapture
              onSuccess={() => {
                setSelfieOpen(false);
                qc.invalidateQueries({ queryKey: ['auth', 'me'] });
              }}
              onCancel={() => setSelfieOpen(false)}
            />
          </div>
        </div>
      )}

      <PlansModal
        open={plansOpen}
        onClose={() => {
          setPlansOpen(false);
          setHighlightPlanFromUrl(null);
          qc.invalidateQueries({ queryKey: ['memberships'] });
        }}
        highlightPlan={
          highlightPlanFromUrl ??
          (membership?.plan?.toUpperCase?.() as 'STARTER' | 'PRO' | 'ELITE') ??
          undefined
        }
      />
    </div>
  );
}

/**
 * PlanBenefits — muestra la lista de beneficios del plan actual del
 * socio + sugerencia de upgrade cuando está en un plan inferior.
 *
 * Las features vienen del catálogo público /memberships/plans
 * (mismo origen que el modal de planes), así que la lista es siempre
 * la misma copy oficial sin duplicarla en frontend.
 */
function PlanBenefits({
  currentPlan,
  plans,
  onSeeOtherPlans,
}: {
  currentPlan: string;
  plans: Array<{
    id: string;
    name: string;
    tagline?: string;
    monthly_price_mxn: number;
    features: string[];
  }>;
  onSeeOtherPlans: () => void;
}) {
  const me = plans.find((p) => p.id === currentPlan);
  if (!me) return null;
  // Determinamos si hay un plan superior al que se podría subir
  // (STARTER → Pro/Élite, PRO → Élite, ELITE → ya es el tope).
  const tierOrder: Record<string, number> = {
    STARTER: 1,
    PRO: 2,
    ELITE: 3,
  };
  const myTier = tierOrder[currentPlan] ?? 0;
  const canUpgrade = myTier > 0 && myTier < 3;

  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
            Beneficios de tu plan
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mt-0.5">
            {me.name}{' '}
            {me.tagline && (
              <span className="font-normal text-sm text-slate-500">
                · {me.tagline}
              </span>
            )}
          </h3>
        </div>
        {canUpgrade && (
          <button
            type="button"
            onClick={onSeeOtherPlans}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ver otros planes
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {visiblePlanFeatures(me.features).map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="w-3 h-3" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {currentPlan === 'STARTER' && (
        <p className="mt-4 text-xs text-slate-500">
          Beneficios como <strong>congelar tu membresía</strong>,{' '}
          <strong>rutinas IA ilimitadas</strong> y plan de comidas están
          incluidos en Pro. Mejora tu plan cuando lo necesites.
        </p>
      )}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
  disabled,
  locked,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * locked = la acción no está disponible para el plan actual (ej.
   * STARTER no puede congelar). Visualmente se ve "bloqueado" pero
   * sigue siendo clickable para abrir el modal de upgrade.
   */
  locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        locked
          ? 'text-left bg-slate-50 shadow-sm hover:shadow-md ring-1 ring-slate-200 hover:ring-amber-300 rounded-xl p-5 transition disabled:opacity-50'
          : 'text-left bg-white shadow-sm hover:shadow-md ring-1 ring-slate-200 hover:ring-blue-300 rounded-xl p-5 transition disabled:opacity-50'
      }
    >
      <div className={locked ? 'text-amber-600 mb-2' : 'text-blue-600 mb-2'}>
        {icon}
      </div>
      <div
        className={
          locked
            ? 'font-semibold text-slate-700 flex items-center gap-1.5'
            : 'font-semibold text-slate-900'
        }
      >
        {title}
        {locked && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200">
            Pro
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-1">{description}</div>
    </button>
  );
}

function AutoRenewPanel({
  autoRenew,
  expiresAt,
}: {
  autoRenew: boolean;
  expiresAt: string;
}) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: async (next: boolean) =>
      (await api.patch('/memberships/me/auto-renewal', { enabled: next })).data,
    onSuccess: (_, next) => {
      qc.invalidateQueries({ queryKey: ['memberships', 'me'] });
      toast.success(
        next
          ? 'Renovación automática reactivada.'
          : 'Renovación automática desactivada. Tu acceso sigue hasta la fecha de vencimiento.',
      );
    },
    onError: (e: any) => {
      toast.error(
        e?.response?.data?.error?.message ??
          'No pudimos actualizar la renovación. Intenta de nuevo.',
      );
    },
  });

  const dateStr = expiresAt?.slice(0, 10) ?? '—';

  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-base font-semibold text-slate-900">
            Configuración de pagos
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Renovación automática mensual
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={
                autoRenew
                  ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                  : 'inline-flex items-center gap-1 rounded-full bg-slate-100 ring-1 ring-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600'
              }
            >
              {autoRenew ? '● Activa' : '○ Desactivada'}
            </span>
            <span className="text-xs text-slate-500">
              {autoRenew
                ? `Próximo cobro: ${dateStr}`
                : `Acceso hasta: ${dateStr}`}
            </span>
          </div>

          <p className="text-xs text-slate-500 mt-2 max-w-prose">
            {autoRenew
              ? 'Te cobramos automáticamente cada mes con la tarjeta que usaste. Puedes desactivarlo cuando quieras.'
              : 'No se hará el próximo cobro. Tu acceso sigue activo hasta la fecha de vencimiento. Puedes reactivar la renovación en cualquier momento antes de esa fecha.'}
          </p>
        </div>

        <div className="shrink-0">
          {autoRenew ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none min-h-[40px]"
              onClick={() => setConfirmOpen(true)}
              disabled={toggle.isPending}
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none min-h-[40px]"
              onClick={() => toggle.mutate(true)}
              disabled={toggle.isPending}
            >
              {toggle.isPending ? 'Procesando…' : 'Reactivar'}
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !toggle.isPending && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white ring-1 ring-slate-200 shadow-xl rounded-2xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-50 p-2 ring-1 ring-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  ¿Desactivar renovación automática?
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  No se hará el próximo cobro. Tu acceso sigue activo hasta el{' '}
                  <span className="font-semibold text-slate-900">{dateStr}</span>
                  . Después tendrás que renovar manualmente para no perder el
                  servicio.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
                onClick={() => setConfirmOpen(false)}
                disabled={toggle.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-rose-600/25 hover:bg-rose-700 disabled:opacity-50 min-h-[40px]"
                onClick={() => {
                  toggle.mutate(false, {
                    onSuccess: () => setConfirmOpen(false),
                  });
                }}
                disabled={toggle.isPending}
              >
                {toggle.isPending ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FreezeModal({ onClose, onDone }: any) {
  const [reason, setReason] = useState('Viaje');
  const [days, setDays] = useState(14);

  const freeze = useMutation({
    mutationFn: async () => (await api.post('/memberships/freeze', { reason, days })).data,
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white ring-1 ring-slate-200 shadow-xl rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <h3 className="font-display text-xl font-bold text-slate-900">Congelar membresía</h3>
        <div>
          <label className="text-sm text-slate-700 font-medium">Razón</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
          >
            <option>Viaje</option>
            <option>Lesión</option>
            <option>Trabajo</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-700 font-medium">
            Días de congelamiento: <span className="text-blue-600 font-semibold tabular-nums">{days}</span>
          </label>
          <input
            type="range"
            min={7}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full mt-2 accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>7</span>
            <span>30</span>
          </div>
        </div>
        {freeze.error && (
          <p className="text-sm text-rose-600">
            {(freeze.error as any)?.response?.data?.error?.message ?? 'Error'}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" className={BTN_GHOST} onClick={onClose}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} onClick={() => freeze.mutate()} disabled={freeze.isPending}>
            {freeze.isPending ? 'Procesando…' : 'Confirmar congelamiento'}
          </button>
        </div>
      </div>
    </div>
  );
}
