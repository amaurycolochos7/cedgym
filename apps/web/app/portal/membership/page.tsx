'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Snowflake, RefreshCw, Calendar } from 'lucide-react';

export default function PortalMembershipPage() {
  const qc = useQueryClient();
  const [freezeOpen, setFreezeOpen] = useState(false);

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

  if (isLoading) return <div className="text-zinc-400">Cargando…</div>;

  const days = membership?.days_remaining ?? 0;
  const totalDays = membership?.total_days ?? 30;
  const progressPct = Math.max(0, Math.min(100, 100 - (days / totalDays) * 100));
  const earlyDiscount = days <= 8 && days > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mi membresía</h1>
          <p className="text-zinc-400 mt-1">Gestiona tu plan y pagos.</p>
        </div>
      </div>

      {!membership?.plan ? (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-400 mb-4">No tienes una membresía activa.</p>
          <Button onClick={() => (window.location.href = '/#planes')}>
            Ver planes
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/30 rounded-3xl p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-blue-400">Plan</div>
                <div className="text-3xl font-bold">{membership.plan}</div>
                <div className="text-sm text-zinc-400 mt-1">
                  {membership.sport ?? 'General'} · {membership.billing_cycle}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-blue-400">Vence en</div>
                <div className="text-3xl font-bold">{days} días</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {membership.expires_at?.slice(0, 10)}
                </div>
              </div>
            </div>
            <div className="mt-5 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-yellow-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {earlyDiscount && (
            <div className="bg-gradient-to-r from-amber-500/20 to-blue-500/20 border border-amber-400/40 rounded-xl p-4 flex items-center gap-4">
              <div className="text-3xl">🎁</div>
              <div className="flex-1">
                <div className="font-semibold">¡Renueva ahora con 20% de descuento!</div>
                <div className="text-sm text-zinc-400">
                  Tu membresía vence pronto. Renueva hoy y ahorra.
                </div>
              </div>
              <Button onClick={() => renew.mutate()} disabled={renew.isPending}>
                {renew.isPending ? 'Procesando…' : 'Renovar ahora'}
              </Button>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <ActionCard
              icon={<RefreshCw className="w-5 h-5" />}
              title="Renovar"
              description="Extiende tu membresía"
              onClick={() => renew.mutate()}
              disabled={renew.isPending}
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
              description="Ver otros planes"
              onClick={() => (window.location.href = '/#planes')}
            />
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Historial de pagos</h3>
            {history?.items?.length ? (
              <div className="space-y-2">
                {history.items.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div>
                      <div className="font-medium">${p.amount.toLocaleString('es-MX')} MXN</div>
                      <div className="text-xs text-zinc-500">
                        {p.created_at?.slice(0, 10)} · {p.description ?? 'Membresía'}
                      </div>
                    </div>
                    <span
                      className={
                        p.status === 'APPROVED'
                          ? 'text-emerald-400 text-sm'
                          : p.status === 'PENDING'
                          ? 'text-amber-400 text-sm'
                          : 'text-zinc-500 text-sm'
                      }
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Sin pagos aún.</p>
            )}
          </div>
        </>
      )}

      {freezeOpen && <FreezeModal onClose={() => setFreezeOpen(false)} onDone={() => {
        setFreezeOpen(false);
        qc.invalidateQueries({ queryKey: ['memberships'] });
      }} />}
    </div>
  );
}

function ActionCard({ icon, title, description, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 rounded-xl p-5 transition disabled:opacity-50"
    >
      <div className="text-blue-400 mb-2">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="text-xs text-zinc-500 mt-1">{description}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <h3 className="text-xl font-bold">Congelar membresía</h3>
        <div>
          <label className="text-sm text-zinc-400">Razón</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
          >
            <option>Viaje</option>
            <option>Lesión</option>
            <option>Trabajo</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-zinc-400">
            Días de congelamiento: <span className="text-blue-400 font-semibold">{days}</span>
          </label>
          <input
            type="range"
            min={7}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full mt-2 accent-blue-500"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>7</span>
            <span>30</span>
          </div>
        </div>
        {freeze.error && (
          <p className="text-sm text-red-400">
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
