'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Smartphone, RefreshCw, CheckCircle2, Bell, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminWhatsAppPage() {
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: async () => (await api.get('/admin/whatsapp/status')).data,
    refetchInterval: 2000,
  });

  const { data: qrData } = useQuery({
    queryKey: ['whatsapp', 'qr'],
    queryFn: async () => (await api.get('/admin/whatsapp/qr')).data,
    enabled: !status?.is_connected,
    refetchInterval: 2000,
  });

  const start = useMutation({
    mutationFn: async () => (await api.post('/admin/whatsapp/start')).data,
    onSuccess: async () => {
      qc.setQueryData(['whatsapp', 'qr'], { qr: null });
      await qc.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });

  const logout = useMutation({
    mutationFn: async () => (await api.post('/admin/whatsapp/logout')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp'] }),
  });

  // Enable the out-of-the-box welcome/payment-approved automations for
  // this workspace. Idempotent — re-running is safe. The backend
  // returns `{ created, skipped, missing_templates }` so we can tell
  // the admin exactly what happened.
  const ensureDefaults = useMutation({
    mutationFn: async () =>
      (await api.post('/admin/automations/ensure-defaults')).data,
    onSuccess: (data: { created: any[]; skipped: any[]; missing_templates: string[] }) => {
      const created = data?.created?.length ?? 0;
      const skipped = data?.skipped?.length ?? 0;
      const missing = data?.missing_templates?.length ?? 0;
      if (created > 0) {
        toast.success(
          `Listas ${created} automatizaciones. ${skipped > 0 ? `(${skipped} ya existían)` : ''}`,
        );
      } else if (skipped > 0 && missing === 0) {
        toast.success('Todas las automatizaciones ya estaban activas.');
      }
      if (missing > 0) {
        toast.error(
          `Faltan plantillas: ${data.missing_templates.join(', ')}. Corre el seed completo.`,
        );
      }
    },
    onError: (e: any) => {
      toast.error(
        e?.response?.data?.error?.message ||
          'No pudimos activar las automatizaciones.',
      );
    },
  });

  const autoStartedRef = useRef(false);
  const lastAutoStartRef = useRef(0);

  useEffect(() => {
    if (!status) return;
    if (status.is_connected) return;
    if (status.initializing) return;
    if (qrData?.qr) return;
    if (start.isPending) return;

    const now = Date.now();
    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      lastAutoStartRef.current = now;
      start.mutate();
      return;
    }
    if (now - lastAutoStartRef.current > 30_000) {
      lastAutoStartRef.current = now;
      start.mutate();
    }
  }, [status, qrData?.qr, start]);

  useEffect(() => {
    if (status?.is_connected) autoStartedRef.current = false;
  }, [status?.is_connected]);

  const connected = !!status?.is_connected;
  const initializing = !!status?.initializing || start.isPending;
  const hasQR = !!qrData?.qr;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          WhatsApp Bot
        </h1>
        <p className="text-slate-600 mt-1">
          Conecta el número oficial del gym. Desde aquí se enviarán todos los
          códigos de verificación, recordatorios de membresía y promociones
          automáticas a tus socios.
        </p>
      </div>

      {/* === CONECTADO === */}
      {connected && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-700">
                  Conectado
                </div>
                <div className="text-sm text-slate-600">
                  {status?.phone_number && (
                    <span className="font-mono">+{status.phone_number}</span>
                  )}
                  {status?.pushname && (
                    <span className="ml-2">· {status.pushname}</span>
                  )}
                </div>
                {status?.last_heartbeat && (
                  <div className="text-xs text-slate-500 mt-1">
                    Última actividad:{' '}
                    {new Date(status.last_heartbeat).toLocaleString('es-MX')}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    '¿Cerrar la sesión del bot? Tendrás que escanear el QR de nuevo para reconectar.',
                  )
                ) {
                  logout.mutate();
                }
              }}
              disabled={logout.isPending}
              className={BTN_DANGER}
            >
              <LogOut className="w-4 h-4" />
              {logout.isPending ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-200 text-sm text-emerald-800">
            El bot está listo para enviar OTPs de registro, recordatorios de
            membresía, promociones y todas las notificaciones automáticas a tus
            socios.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 pt-4 border-t border-emerald-200">
            <button
              type="button"
              onClick={() => ensureDefaults.mutate()}
              disabled={ensureDefaults.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Bell className="h-4 w-4" />
              {ensureDefaults.isPending
                ? 'Activando…'
                : 'Activar mensajes de bienvenida'}
            </button>
            <p className="text-xs text-emerald-900/70">
              Crea las automatizaciones "Pago confirmado" y "Bienvenida al
              activar membresía". Es seguro ejecutarlo varias veces.
            </p>
          </div>
        </div>
      )}

      {/* === NO CONECTADO === */}
      {!connected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            <div className="font-semibold text-slate-900">
              {initializing && !hasQR
                ? 'Preparando conexión…'
                : hasQR
                ? 'Escanea el QR desde tu WhatsApp'
                : 'Iniciando…'}
            </div>
          </div>

          <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
            {/* QR */}
            <div className="bg-white rounded-xl overflow-hidden min-w-[304px] min-h-[304px] flex items-center justify-center p-4 shadow-sm border border-slate-200">
              {hasQR ? (
                <img
                  src={qrData.qr}
                  alt="QR WhatsApp"
                  width={272}
                  height={272}
                  className="block"
                />
              ) : (
                <div className="w-64 h-64 flex flex-col items-center justify-center text-slate-500 text-sm text-center px-4 gap-3">
                  <RefreshCw className="w-10 h-10 animate-spin text-blue-600" />
                  <span className="text-slate-600">
                    Generando código seguro…
                  </span>
                  <span className="text-xs text-slate-500">
                    Puede tardar unos segundos
                  </span>
                </div>
              )}
            </div>

            {/* Instrucciones */}
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold text-base mb-2 flex items-center gap-2 text-slate-900">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  Cómo vincular tu WhatsApp
                </h3>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                  <li>
                    Abre{' '}
                    <b className="text-slate-900">WhatsApp</b> en tu celular.
                  </li>
                  <li>
                    Toca{' '}
                    <b className="text-slate-900">
                      ⋮ (Configuración) → Dispositivos vinculados
                    </b>
                    .
                  </li>
                  <li>
                    Toca{' '}
                    <b className="text-slate-900">Vincular un dispositivo</b>.
                  </li>
                  <li>Escanea el QR de la izquierda.</li>
                </ol>
              </div>

              {status?.last_error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                  {status.last_error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
