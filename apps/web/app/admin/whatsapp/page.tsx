'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Smartphone, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

  /**
   * Auto-bootstrap:
   * Al entrar a la página, si no hay sesión conectada, no está inicializando
   * y no tenemos QR, arrancamos una sola vez automáticamente.
   *
   * Además, si el bot se detuvo por qr_exhausted o fallo, reintentamos cada
   * 30 s mientras la página esté abierta.
   */
  const autoStartedRef = useRef(false);
  const lastAutoStartRef = useRef(0);

  useEffect(() => {
    if (!status) return;
    if (status.is_connected) return;
    if (status.initializing) return;
    if (qrData?.qr) return;
    if (start.isPending) return;

    const now = Date.now();
    // Primera vez: dispara de inmediato.
    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      lastAutoStartRef.current = now;
      start.mutate();
      return;
    }
    // Retries automáticos cada 30 s si sigue sin QR y sin conexión.
    if (now - lastAutoStartRef.current > 30_000) {
      lastAutoStartRef.current = now;
      start.mutate();
    }
  }, [status, qrData?.qr, start]);

  // Si la sesión se conecta, resetea el flag por si el usuario cierra
  // sesión después y entra de nuevo.
  useEffect(() => {
    if (status?.is_connected) autoStartedRef.current = false;
  }, [status?.is_connected]);

  const connected = !!status?.is_connected;
  const initializing = !!status?.initializing || start.isPending;
  const hasQR = !!qrData?.qr;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">WhatsApp Bot</h1>
        <p className="text-zinc-400 mt-1">
          Conecta el número oficial del gym. Desde aquí se enviarán todos los
          códigos de verificación, recordatorios de membresía y promociones
          automáticas a tus socios.
        </p>
      </div>

      {/* === CONECTADO === */}
      {connected && (
        <div className="bg-gradient-to-br from-emerald-600/10 to-emerald-800/5 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-300">
                  Conectado
                </div>
                <div className="text-sm text-zinc-400">
                  {status?.phone_number && (
                    <span className="font-mono">+{status.phone_number}</span>
                  )}
                  {status?.pushname && (
                    <span className="ml-2">· {status.pushname}</span>
                  )}
                </div>
                {status?.last_heartbeat && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Última actividad:{' '}
                    {new Date(status.last_heartbeat).toLocaleString('es-MX')}
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              className="text-red-400 hover:bg-red-500/10"
              onClick={() => {
                if (confirm('¿Cerrar la sesión del bot? Tendrás que escanear el QR de nuevo para reconectar.')) {
                  logout.mutate();
                }
              }}
              disabled={logout.isPending}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {logout.isPending ? 'Cerrando…' : 'Cerrar sesión'}
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-500/20 text-sm text-emerald-200/80">
            El bot está listo para enviar OTPs de registro, recordatorios de
            membresía, promociones y todas las notificaciones automáticas a tus
            socios.
          </div>
        </div>
      )}

      {/* === NO CONECTADO: escaneo === */}
      {!connected && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            <div className="font-semibold">
              {initializing && !hasQR
                ? 'Preparando conexión…'
                : hasQR
                ? 'Escanea el QR desde tu WhatsApp'
                : 'Iniciando…'}
            </div>
          </div>

          <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
            {/* QR */}
            <div className="bg-white rounded-xl overflow-hidden min-w-[304px] min-h-[304px] flex items-center justify-center p-4 shadow-lg">
              {hasQR ? (
                <img
                  src={qrData.qr}
                  alt="QR WhatsApp"
                  width={272}
                  height={272}
                  className="block"
                />
              ) : (
                <div className="w-64 h-64 flex flex-col items-center justify-center text-zinc-400 text-sm text-center px-4 gap-3">
                  <RefreshCw className="w-10 h-10 animate-spin text-brand-orange" />
                  <span className="text-zinc-600">
                    Generando código seguro…
                  </span>
                  <span className="text-xs text-zinc-400">
                    Puede tardar unos segundos
                  </span>
                </div>
              )}
            </div>

            {/* Instrucciones */}
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand-orange" />
                  Cómo vincular tu WhatsApp
                </h3>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                  <li>
                    Abre <b className="text-white">WhatsApp</b> en tu celular.
                  </li>
                  <li>
                    Toca <b className="text-white">⋮ (Configuración) → Dispositivos vinculados</b>.
                  </li>
                  <li>
                    Toca <b className="text-white">Vincular un dispositivo</b>.
                  </li>
                  <li>Escanea el QR de la izquierda.</li>
                </ol>
              </div>

              {status?.last_error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
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
