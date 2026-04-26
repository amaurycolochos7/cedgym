'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Camera, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { planDisplayName } from '@/lib/utils';

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
  // Si el auto-start falla (permiso denegado, sin cámara, etc.) mostramos el
  // botón manual para que el usuario pueda reintentar tras corregir.
  const [cameraError, setCameraError] = useState<string | null>(null);
  const startingRef = useRef(false);
  // Dedup de detecciones — la cámara dispara el callback ~10fps y mientras
  // el atleta sostiene el QR frente al lector se decodifica el MISMO token
  // en cada frame. Sin esto bombardearíamos al backend con N requests, y
  // como el token es de un solo uso (consumeToken lo quema en Redis), las
  // últimas N-1 vendrían como EXPIRED_QR pisando el resultado real.
  const inFlightRef = useRef(false);
  const lastTokenRef = useRef<{ token: string; at: number } | null>(null);

  useEffect(() => {
    // Reusar el script si ya está cargado (evita duplicados al navegar).
    if ((window as any).Html5Qrcode) {
      setLibReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-html5-qrcode]'
    );
    if (existing) {
      existing.addEventListener('load', () => setLibReady(true), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.async = true;
    s.dataset.html5Qrcode = '1';
    s.onload = () => setLibReady(true);
    s.onerror = () => console.error('No se pudo cargar html5-qrcode');
    document.body.appendChild(s);
    // No removemos el script al desmontar: la librería puede dejar referencias.
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
      // The api.ts response interceptor flattens errors to
      // { status, code, message, details } and copies the original
      // Fastify nested error object into `details` — that's where the
      // per-code extras (user_id, user_name, retry_after_sec) live.
      const extras = (err?.details ?? {}) as Partial<ScanErrorData>;
      const errObj: ScanErrorData = {
        code: err?.code ?? 'SCAN_ERROR',
        message: err?.message ?? 'Error al validar',
        retry_after_sec: extras.retry_after_sec,
        user_id: extras.user_id,
        user_name: extras.user_name,
      };
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
      toast.error(err?.message || 'No se pudo autorizar el reingreso');
    },
  });

  async function startCamera() {
    if (!libReady || !window.Html5Qrcode) return;
    if (startingRef.current || scannerRef.current) return;
    startingRef.current = true;
    setCameraError(null);
    try {
      const html5QrCode = new window.Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 300 },
        (decoded: string) => {
          // Ignora si ya hay una petición en vuelo o si acabamos de
          // procesar el MISMO token hace menos de 8s. La librería sigue
          // detectando el QR en cada frame mientras está delante de la
          // cámara, y sin este filtro le pegaríamos al backend ~10
          // veces por escaneo (consumiendo el token en la primera y
          // pintando EXPIRED_QR en las siguientes).
          if (inFlightRef.current) return;
          const last = lastTokenRef.current;
          const now = Date.now();
          if (last && last.token === decoded && now - last.at < 8000) return;

          inFlightRef.current = true;
          lastTokenRef.current = { token: decoded, at: now };
          scan.mutate(decoded, {
            onSettled: () => {
              inFlightRef.current = false;
            },
          });
          setTimeout(() => setResult(null), 4000);
        },
        () => {}
      );
      setActive(true);
    } catch (e: any) {
      scannerRef.current = null;
      const msg =
        e?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilítalo en el navegador.'
          : e?.name === 'NotFoundError'
            ? 'No se encontró ninguna cámara.'
            : 'No se pudo iniciar la cámara.';
      setCameraError(msg);
    } finally {
      startingRef.current = false;
    }
  }

  async function stopCamera() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try { await s.stop(); } catch {}
      try { await s.clear(); } catch {}
    }
    setActive(false);
  }

  // Auto-iniciar la cámara cuando la librería esté lista. Si el usuario
  // pulsa "Detener", queda inactivo hasta que vuelva a darle a "Iniciar".
  useEffect(() => {
    if (!libReady) return;
    if (active || cameraError) return;
    if (scannerRef.current || startingRef.current) return;
    startCamera();
    // startCamera depende de libReady/scan.mutate (estables); deps mínimas
    // para evitar reintentos en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady, active, cameraError]);

  // Limpieza al desmontar: detener la cámara sin tocar setState (componente ya
  // no existe). Esto evita el "removeChild" cuando React intenta reconciliar
  // los nodos que html5-qrcode inyectó en #qr-reader.
  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      Promise.resolve()
        .then(() => s.stop())
        .catch(() => {})
        .then(() => s.clear())
        .catch(() => {});
    };
  }, []);

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
          {/*
            IMPORTANTE: #qr-reader NO debe tener hijos manejados por React.
            html5-qrcode inyecta sus propios nodos (video/canvas) ahí dentro y
            si React también renderiza hijos en el mismo nodo, al desmontar
            falla con "Failed to execute 'removeChild' on 'Node'". Por eso el
            placeholder va en un overlay hermano.
          */}
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900 text-slate-500">
            <div id="qr-reader" className="absolute inset-0" />
            {!active && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <Camera className="h-12 w-12" />
                {cameraError ? (
                  <p className="text-xs text-rose-300">{cameraError}</p>
                ) : (
                  <p className="text-xs text-slate-400">
                    {libReady ? 'Iniciando cámara…' : 'Cargando lector…'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            {!active ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={!libReady || (!cameraError && startingRef.current)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {cameraError ? 'Reintentar cámara' : 'Iniciar cámara'}
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
            <div className="space-y-3 text-center">
              {result.member?.selfie_url ? (
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-2xl ring-4 ring-emerald-200">
                  <img
                    src={result.member.selfie_url}
                    alt={result.member?.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
              )}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                  Verifica que la cara coincide
                </p>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {result.member?.name}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {planDisplayName(result.member?.plan)} · Vence{' '}
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
              {result.error.code === 'SELFIE_MISSING' ? (
                <AlertTriangle className="mx-auto h-16 w-16 text-amber-600" />
              ) : (
                <XCircle className="mx-auto h-16 w-16 text-rose-600" />
              )}
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-900">
                  {result.error.code === 'SELFIE_MISSING'
                    ? 'Selfie pendiente'
                    : result.error.code === 'OUT_OF_HOURS'
                      ? 'Fuera de horario'
                      : result.error.code === 'INACTIVE'
                        ? 'Membresía vencida'
                        : result.error.code === 'NO_MEMBERSHIP'
                          ? 'Sin membresía'
                          : result.error.code === 'EXPIRED_QR'
                            ? 'QR expirado'
                            : result.error.code === 'DUPLICATE'
                              ? 'Ya entró hace poco'
                              : result.error.code}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {result.error.message}
                </div>
                {result.error.code === 'SELFIE_MISSING' && result.error.user_name && (
                  <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-amber-200">
                    <p className="font-semibold text-slate-900">
                      {result.error.user_name}
                    </p>
                    <p className="mt-1">
                      Pídele que abra el link de bienvenida que recibió por
                      WhatsApp y suba su selfie. Después de eso, podrá entrar
                      escaneando este mismo QR.
                    </p>
                  </div>
                )}
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
