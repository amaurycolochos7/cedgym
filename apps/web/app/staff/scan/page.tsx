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
  plan?: string;
  daily_limit?: number;
  visits_today?: number;
  last_checkin_at?: string;
};
type VisitInfo = {
  is_reentry: boolean;
  number: number;
  daily_limit: number | null;
  mins_since_last: number | null;
};
type ScanResult =
  | {
      ok: true;
      member: any;
      visit?: VisitInfo;
      message?: string;
    }
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
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {/* Header compacto: el topbar ya muestra el título "Scan QR".
          Aquí solo va el contador del turno como hint contextual. */}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          Escanear QR
        </h1>
        <span className="text-xs text-slate-500">
          <span className="tabular-nums font-semibold text-slate-700">
            {history.length}
          </span>{' '}
          check-ins este turno
        </span>
      </div>

      {/* Layout responsivo:
          - mobile: cámara → resultado → historial (1 col)
          - md (≥768): cámara | resultado, historial debajo
          - lg (≥1024): cámara | resultado | historial (3 col, todo en
            una pantalla sin scroll)
          La cámara está capada con max-w para que no estire demasiado
          en pantallas grandes. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          {/*
            IMPORTANTE: #qr-reader NO debe tener hijos manejados por React.
            html5-qrcode inyecta sus propios nodos (video/canvas) ahí dentro y
            si React también renderiza hijos en el mismo nodo, al desmontar
            falla con "Failed to execute 'removeChild' on 'Node'". Por eso el
            placeholder va en un overlay hermano.
          */}
          <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-xl bg-slate-900 text-slate-500">
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
          <div className="mt-3 flex justify-center gap-2">
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
                ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5'
                : 'rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5'
              : 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5'
          }
        >
          {!result && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-slate-500 sm:py-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <Camera className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm">Esperando escaneo…</p>
              <p className="text-xs text-slate-400">
                Apunta el QR del socio al lector
              </p>
            </div>
          )}
          {result?.ok && (
            <div className="space-y-2 text-center">
              {result.member?.selfie_url ? (
                <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl ring-4 ring-emerald-200 sm:h-32 sm:w-32">
                  <img
                    src={result.member.selfie_url}
                    alt={result.member?.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600 sm:h-16 sm:w-16" />
              )}
              <div>
                {/* Banner del tipo de entrada — re-entry vs nueva visita.
                    Re-entry es cuando el socio ya entró en los últimos
                    90 min y vuelve (olvidó algo, salió por agua, etc.). */}
                {result.visit?.is_reentry ? (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 sm:text-[11px]">
                    Re-entrada · entró hace{' '}
                    {result.visit.mins_since_last ?? 0} min
                  </p>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 sm:text-[11px]">
                    Verifica que la cara coincide
                  </p>
                )}
                <div className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                  {result.member?.name}
                </div>
                <div className="mt-1 text-xs text-slate-700 sm:text-sm">
                  {planDisplayName(result.member?.plan)} · Vence{' '}
                  {result.member?.expires_at?.slice(0, 10)}
                </div>
                {/* Contador de visitas del día. Para Básico muestra
                    "Visita 1/1 hoy" — al recepcionista le sirve para
                    saber si el socio ya consumió su acceso del día. */}
                {result.visit && (
                  <div className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                    {result.visit.daily_limit
                      ? `Visita ${result.visit.number}/${result.visit.daily_limit} hoy`
                      : `Visita ${result.visit.number} hoy · plan ilimitado`}
                  </div>
                )}
              </div>
            </div>
          )}
          {result && !result.ok && (
            <div className="space-y-3">
              {result.error.code === 'SELFIE_MISSING' ||
              result.error.code === 'DAILY_LIMIT_REACHED' ? (
                <AlertTriangle className="mx-auto h-16 w-16 text-amber-600" />
              ) : (
                <XCircle className="mx-auto h-16 w-16 text-rose-600" />
              )}
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-900">
                  {errorTitle(result.error.code)}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {result.error.message}
                </div>
                {result.error.code === 'SELFIE_MISSING' &&
                  result.error.user_name && (
                    <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-amber-200">
                      <p className="font-semibold text-slate-900">
                        {result.error.user_name}
                      </p>
                      <p className="mt-1">
                        Pídele que abra el link de bienvenida que recibió
                        por WhatsApp y suba su selfie. Después de eso,
                        podrá entrar escaneando este mismo QR.
                      </p>
                    </div>
                  )}
                {/* DAILY_LIMIT_REACHED — el socio ya consumió su visita
                    del día (Básico = 1/día). Mostramos el dato claro
                    para que recepción confirme y, si lo amerita,
                    autorice un reingreso manual. */}
                {result.error.code === 'DAILY_LIMIT_REACHED' &&
                  result.error.user_name && (
                    <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-amber-200">
                      <p className="font-semibold text-slate-900">
                        {result.error.user_name}
                      </p>
                      <p className="mt-1">
                        Plan{' '}
                        {result.error.plan === 'STARTER'
                          ? 'Básico'
                          : result.error.plan}{' '}
                        permite{' '}
                        <strong>
                          {result.error.daily_limit ?? 1}{' '}
                          {(result.error.daily_limit ?? 1) === 1
                            ? 'visita'
                            : 'visitas'}
                        </strong>{' '}
                        al día.{' '}
                        {result.error.last_checkin_at && (
                          <>
                            Entró hoy a las{' '}
                            {new Date(
                              result.error.last_checkin_at,
                            ).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            .
                          </>
                        )}
                      </p>
                    </div>
                  )}
                {result.error.code === 'DUPLICATE_FAST' && (
                  <div className="mt-2 text-xs text-slate-500">
                    Detectamos un scan repetido. Espera unos segundos
                    e intenta de nuevo.
                  </div>
                )}
              </div>
              {/* Override: permitir reingreso autorizado.
                  - DAILY_LIMIT_REACHED: el socio Básico llegó al límite
                    pero recepción quiere autorizar (gerencia OK).
                  - DUPLICATE_FAST: NO se autoriza override (es un
                    accidente de UI, esperar 30 seg basta). */}
              {result.error.code === 'DAILY_LIMIT_REACHED' &&
                result.error.user_id && (
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt(
                          'Motivo del reingreso (autorización gerencia, etc.):',
                          '',
                        );
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
                      {override.isPending
                        ? 'Autorizando…'
                        : 'Autorizar reingreso'}
                    </button>
                    <p className="text-center text-[11px] text-slate-500">
                      Queda registrado en auditoría con tu usuario.
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Historial — span full row en md (debajo del split cámara/resultado),
            sidebar a la derecha en lg+. Scroll interno para no expandir
            la altura de la página cuando hay muchos check-ins. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2 lg:col-span-1">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Historial del turno
            </h3>
            <span className="text-[11px] text-slate-500">
              {history.length}
            </span>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">Aún no hay check-ins.</p>
          ) : (
            <div className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1 text-sm">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="flex justify-between border-b border-slate-100 py-1.5 last:border-0"
                >
                  <span className="truncate text-slate-900">
                    {h.member?.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {new Date(h.at).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Mapeo de error code → título corto en español para el panel de
// resultado. Mantiene la UI consistente cuando el backend devuelve
// codes nuevos: agregar caso aquí en lugar de cadenas de ternarios.
function errorTitle(code: string): string {
  const titles: Record<string, string> = {
    SELFIE_MISSING: 'Selfie pendiente',
    INACTIVE: 'Membresía vencida',
    NO_MEMBERSHIP: 'Sin membresía',
    EXPIRED_QR: 'QR expirado',
    DUPLICATE_FAST: 'Scan repetido',
    DAILY_LIMIT_REACHED: 'Visita del día consumida',
    USER_INACTIVE: 'Cuenta suspendida',
    USER_NOT_FOUND: 'Usuario no encontrado',
  };
  return titles[code] ?? code;
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
