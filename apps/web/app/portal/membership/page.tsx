'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Snowflake, RefreshCw, Calendar, Camera } from 'lucide-react';
import { SelfieCapture } from '@/components/portal/selfie-capture';

export default function PortalMembershipPage() {
  const qc = useQueryClient();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const needsSelfie = !!me && !me?.user?.selfie_url;

  const { data: membership, isLoading } = useQuery({
    queryKey: ['memberships', 'me'],
    queryFn: async () => (await api.get('/memberships/me')).data,
  });

  const { data: history } = useQuery({
    queryKey: ['memberships', 'history'],
    queryFn: async () => (await api.get('/memberships/history')).data,
  });

  const renew = useMutation({
    mutationFn: async () => {
      const res = await api.post('/memberships/renew', {});
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.init_point) window.location.href = data.init_point;
    },
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
          <h1 className="font-display text-3xl font-bold text-slate-900">Mi membresía</h1>
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
          <Button
            onClick={() => setSelfieOpen(true)}
            className="!bg-blue-600 hover:!bg-blue-700 !text-white !normal-case !tracking-normal !font-semibold"
          >
            <Camera className="w-4 h-4 mr-2" /> Tomar selfie
          </Button>
        </div>
      )}

      {!membership?.plan ? (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-8 text-center">
          <p className="text-slate-600 mb-4">No tienes una membresía activa.</p>
          <Button
            onClick={() => (window.location.href = '/#planes')}
            disabled={needsSelfie}
            title={needsSelfie ? 'Sube tu selfie primero' : undefined}
          >
            Ver planes
          </Button>
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
                <div className="font-display text-3xl font-bold">{membership.plan}</div>
                <div className="text-sm text-white/80 mt-1">
                  {membership.sport ?? 'General'} · {membership.billing_cycle}
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
              <Button
                onClick={() => renew.mutate()}
                disabled={renew.isPending || needsSelfie}
                title={needsSelfie ? 'Sube tu selfie primero' : undefined}
              >
                {renew.isPending ? 'Procesando…' : 'Renovar ahora'}
              </Button>
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
              onClick={() => renew.mutate()}
              disabled={renew.isPending || needsSelfie}
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
              onClick={() => (window.location.href = '/#planes')}
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
                      {p.status}
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
          <p className="text-sm text-red-600">
            {(freeze.error as any)?.response?.data?.error?.message ?? 'Error'}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => freeze.mutate()} disabled={freeze.isPending}>
            {freeze.isPending ? 'Procesando…' : 'Confirmar congelamiento'}
          </Button>
        </div>
      </div>
    </div>
  );
}
