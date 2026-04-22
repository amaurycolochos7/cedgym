'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Camera, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

declare global { interface Window { Html5Qrcode: any } }

type ScanErrorData = {
  code: string;
  message: string;
  retry_after_sec?: number;
  user_id?: string;
  user_name?: string;
};
type ScanResult =
  | { ok: true; member: any; message?: string }
  | { ok: false; error: ScanErrorData };

export default function StaffScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [active, setActive] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const scannerRef = useRef<any>(null);
  const [libReady, setLibReady] = useState(false);

  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = () => setLibReady(true);
    s.onerror = () => console.error('No se pudo cargar html5-qrcode');
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);

  const scan = useMutation({
    mutationFn: async (token: string) =>
      (await api.post('/checkins/scan', { token })).data,
    onSuccess: (data) => {
      setResult({ ok: true, ...data });
      beep(true);
      setHistory((h) => [{ ...data, at: Date.now() }, ...h].slice(0, 20));
    },
    onError: (err: any) => {
      const errObj =
        err?.response?.data?.error ?? { code: 'SCAN_ERROR', message: 'Error al validar' };
      setResult({ ok: false, error: errObj });
      beep(false);
    },
  });

  // Override manual: permitir reingreso cuando el cooldown bloqueó.
  const override = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) =>
      (
        await api.post('/checkins/manual', {
          user_id: userId,
          method: 'MANUAL',
          override: true,
          reason: reason || undefined,
        })
      ).data,
    onSuccess: (data) => {
      toast.success('Reingreso autorizado');
      beep(true);
      setResult({
        ok: true,
        member: data.check_in ? { name: 'Reingreso autorizado' } : {},
      } as ScanResult);
      setHistory((h) => [{ member: { name: 'Override' }, at: Date.now() }, ...h].slice(0, 20));
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error?.message || 'No se pudo autorizar el reingreso',
      );
    },
  });

  async function startCamera() {
    if (!libReady || !window.Html5Qrcode) {
      alert('Cámara aún no lista, espera unos segundos.');
      return;
    }
    const html5QrCode = new window.Html5Qrcode('qr-reader');
    scannerRef.current = html5QrCode;
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 300 },
      (decoded: string) => {
        scan.mutate(decoded);
        setTimeout(() => setResult(null), 4000);
      },
      () => {}
    );
    setActive(true);
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { await scannerRef.current.clear(); } catch {}
    }
    setActive(false);
  }

  useEffect(() => () => { stopCamera(); }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Escanear QR</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escanea el QR del atleta. {history.length} check-ins este turno.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div
            id="qr-reader"
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-slate-500"
          >
            {!active && <Camera className="h-12 w-12" />}
          </div>
          <div className="mt-3 flex gap-2">
            {!active ? (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
              >
                Iniciar cámara
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Detener
              </button>
            )}
          </div>
        </div>

        <div
          className={
            result
              ? result.ok
                ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-6'
                : 'rounded-2xl border border-rose-200 bg-rose-50 p-6'
              : 'rounded-2xl border border-slate-200 bg-white p-6'
          }
        >
          {!result && (
            <div className="py-16 text-center text-slate-500">
              Esperando escaneo…
            </div>
          )}
          {result?.ok && (
            <div className="space-y-3">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">
                  {result.member?.name}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {result.member?.plan} · Vence{' '}
                  {result.member?.expires_at?.slice(0, 10)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Racha: {result.member?.current_streak_days ?? 0} días
                </div>
              </div>
            </div>
          )}
          {result && !result.ok && (
            <div className="space-y-3">
              <XCircle className="mx-auto h-16 w-16 text-rose-600" />
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-900">
                  {result.error.code}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {result.error.message}
                </div>
                {result.error.code === 'DUPLICATE' && result.error.user_name && (
                  <div className="mt-2 text-xs text-slate-500">
                    {result.error.user_name}
                    {typeof result.error.retry_after_sec === 'number' &&
                      ` — espera ${Math.ceil(result.error.retry_after_sec / 60)} min`}
                  </div>
                )}
              </div>
              {/* Override: permitir reingreso cuando es legítimo. */}
              {result.error.code === 'DUPLICATE' && result.error.user_id && (
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt(
                        'Motivo del reingreso (opcional): p.ej. "salió al auto"',
                        '',
                      );
                      // Null = cancelled prompt → abortar. "" = aceptó vacío.
                      if (reason === null) return;
                      override.mutate({
                        userId: result.error.user_id!,
                        reason: reason.trim() || undefined,
                      });
                    }}
                    disabled={override.isPending}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {override.isPending ? 'Autorizando…' : 'Permitir reingreso'}
                  </button>
                  <p className="text-center text-[11px] text-slate-500">
                    Queda registrado en auditoría con tu usuario.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-slate-900">Historial del turno</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay check-ins.</p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex justify-between border-b border-slate-200 py-1 last:border-0"
              >
                <span className="text-slate-900">{h.member?.name}</span>
                <span className="text-slate-500">
                  {new Date(h.at).toLocaleTimeString('es-MX')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    osc.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}
