'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Snowflake, RefreshCw, Calendar, Camera } from 'lucide-react';
import { SelfieCapture } from '@/components/portal/selfie-capture';
import { PlansModal } from '@/components/portal/plans-modal';
import { planDisplayName, paymentStatusLabel } from '@/lib/utils';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';

export default function PortalMembershipPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const mpStatus = searchParams.get('mp');

  // Handle return from Mercado Pago Checkout Pro. The webhook usually
  // beats this redirect, so by the time we re-fetch the membership it
  // should already be active for `success`. If the webhook is still in
  // flight (rare) the user can refresh in a few seconds.
  useEffect(() => {
    if (!mpStatus) return;
    if (mpStatus === 'success') {
      toast.success('¡Pago aprobado! Activando tu membresía…');
      qc.invalidateQueries({ queryKey: ['memberships'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } else if (mpStatus === 'failed') {
      toast.error('El pago no pudo completarse. Intenta de nuevo.');
    } else if (mpStatus === 'pending') {
      toast.message('Tu pago está pendiente de confirmación.');
    }
    // Clean the query params so a refresh doesn't re-fire the toast.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('mp');
    params.delete('payment');
    params.delete('payment_id');
    params.delete('status');
    params.delete('preference_id');
    const next = params.toString();
    router.replace(`/portal/membership${next ? `?${next}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpStatus]);

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

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;

  const days = membership?.days_remaining ?? 0;
  const totalDays = membership?.total_days ?? 30;
  const progressPct = Math.max(0, Math.min(100, 100 - (days / totalDays) * 100));
  const earlyDiscount = days <= 8 && days > 0;

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
                  {membership.sport ?? 'General'} ·{' '}
                  {membership.billing_cycle === 'MONTHLY'
                    ? 'Mensual'
                    : membership.billing_cycle === 'QUARTERLY'
                    ? 'Trimestral'
                    : membership.billing_cycle === 'ANNUAL'
                    ? 'Anual'
                    : membership.billing_cycle}
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
              icon={<Snowflake className="w-5 h-5" />}
              title="Congelar"
              description="Pausa por viaje o lesión"
              onClick={() => setFreezeOpen(true)}
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
          qc.invalidateQueries({ queryKey: ['memberships'] });
        }}
        highlightPlan={
          (membership?.plan?.toUpperCase?.() as 'STARTER' | 'PRO' | 'ELITE') ??
          undefined
        }
      />
    </div>
  );
}

function ActionCard({ icon, title, description, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left bg-white shadow-sm hover:shadow-md ring-1 ring-slate-200 hover:ring-blue-300 rounded-xl p-5 transition disabled:opacity-50"
    >
      <div className="text-blue-600 mb-2">{icon}</div>
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-1">{description}</div>
    </button>
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
