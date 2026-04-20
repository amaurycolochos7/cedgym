'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

declare global { interface Window { Html5Qrcode: any } }

type ScanResult =
  | { ok: true; member: any; message?: string }
  | { ok: false; error: { code: string; message: string } };

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
      const errObj = err?.response?.data?.error ?? { code: 'SCAN_ERROR', message: 'Error al validar' };
      setResult({ ok: false, error: errObj });
      beep(false);
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Check-in por QR</h1>
        <p className="text-zinc-400 mt-1">
          Escanea el QR del atleta. {history.length} check-ins este turno.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
          <div
            id="qr-reader"
            className="w-full aspect-square bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center text-zinc-600"
          >
            {!active && <Camera className="w-12 h-12" />}
          </div>
          <div className="mt-3 flex gap-2">
            {!active ? (
              <Button onClick={startCamera}>Iniciar cámara</Button>
            ) : (
              <Button variant="ghost" onClick={stopCamera}>Detener</Button>
            )}
          </div>
        </div>

        <div
          className={
            result
              ? result.ok
                ? 'bg-emerald-600/20 border border-emerald-500 rounded-2xl p-6'
                : 'bg-red-600/20 border border-red-500 rounded-2xl p-6'
              : 'bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6'
          }
        >
          {!result && (
            <div className="text-zinc-500 text-center py-16">
              Esperando escaneo…
            </div>
          )}
          {result?.ok && (
            <div className="space-y-3">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <div className="text-center">
                <div className="text-2xl font-bold">{result.member?.name}</div>
                <div className="text-sm text-zinc-300 mt-1">
                  {result.member?.plan} · Vence {result.member?.expires_at?.slice(0, 10)}
                </div>
                <div className="text-xs text-zinc-400 mt-2">
                  🔥 Racha: {result.member?.current_streak_days ?? 0} días
                </div>
              </div>
            </div>
          )}
          {result && !result.ok && (
            <div className="space-y-3">
              <XCircle className="w-16 h-16 text-red-400 mx-auto" />
              <div className="text-center">
                <div className="text-lg font-semibold">{result.error.code}</div>
                <div className="text-sm text-zinc-300 mt-1">
                  {result.error.message}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5">
        <h3 className="font-semibold mb-3">Historial del turno</h3>
        {history.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no hay check-ins.</p>
        ) : (
          <div className="space-y-1 text-sm max-h-60 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-zinc-800 last:border-0">
                <span>{h.member?.name}</span>
                <span className="text-zinc-500">
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
