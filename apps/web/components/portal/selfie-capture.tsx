'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, RefreshCcw, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api, normalizeError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/schemas';

const BTN_PRIMARY =
  'inline-flex items-center justify-center h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_GHOST =
  'inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed';

interface SelfieCaptureProps {
  /** Called with the stored selfie URL once the upload completes. */
  onSuccess?: (selfie_url: string) => void;
  /** Optional cancel/close handler (e.g. when rendered inside a modal). */
  onCancel?: () => void;
}

type Phase = 'idle' | 'live' | 'captured' | 'fallback';

export function SelfieCapture({ onSuccess, onCancel }: SelfieCaptureProps) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  // ── Camera lifecycle ────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPhase('fallback');
      setError(
        'Tu navegador no soporta la cámara. Sube una foto desde tu galería.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          /* autoplay may fail silently on some browsers */
        });
      }
      setPhase('live');
    } catch (e) {
      // Permission denied, no camera, etc. Fall back to file input.
      setPhase('fallback');
      setError(
        'No pudimos acceder a la cámara. Puedes subir una foto desde tu dispositivo.',
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // ── Snapshot ────────────────────────────────────────────────
  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    // Square crop centered on the live feed so the circular mask looks right.
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    // Mirror the image so "what you see" matches "what you get" for
    // front-camera previews (we apply `scaleX(-1)` on the <video>).
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);
    setDataUrl(jpeg);
    setPhase('captured');
    stopStream();
  }, [stopStream]);

  const retake = useCallback(() => {
    setDataUrl(null);
    startCamera();
  }, [startCamera]);

  // ── File fallback ───────────────────────────────────────────
  const onFilePicked = useCallback((file: File | null) => {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/i.test(file.type)) {
      setError('Sube una imagen JPEG o PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen supera 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setDataUrl(result);
        setPhase('captured');
        setError(null);
      }
    };
    reader.onerror = () => setError('No pudimos leer el archivo.');
    reader.readAsDataURL(file);
  }, []);

  // ── Upload ──────────────────────────────────────────────────
  const upload = useMutation({
    mutationFn: async () => {
      if (!dataUrl) throw new Error('NO_IMAGE');
      const res = await api.post<{ selfie_url: string }>('/users/me/selfie', {
        image_base64: dataUrl,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Selfie guardada.');
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      onSuccess?.(data.selfie_url);
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      toast.error(norm.message || 'No pudimos guardar tu selfie.');
      setError(norm.message || 'No pudimos guardar tu selfie.');
    },
  });

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-bold text-slate-900">
          Selfie para identificación
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          La usamos únicamente para que el staff te reconozca en la recepción.
          Puedes cambiarla cuando quieras desde tu perfil.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Camera / preview surface */}
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-full ring-2 ring-blue-500/30 bg-slate-100">
        {phase === 'captured' && dataUrl ? (
          <img
            src={dataUrl}
            alt="Selfie"
            className="h-full w-full object-cover"
          />
        ) : phase === 'live' ? (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full object-cover [transform:scaleX(-1)]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <Camera className="h-12 w-12" />
          </div>
        )}
        {/* Face-framing guide */}
        {phase !== 'captured' && (
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/80" />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {phase === 'idle' && (
          <>
            <button type="button" className={BTN_PRIMARY} onClick={startCamera}>
              <Camera className="mr-2 h-4 w-4" />
              Abrir cámara
            </button>
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Subir foto
            </button>
          </>
        )}

        {phase === 'live' && (
          <>
            <button type="button" className={BTN_PRIMARY} onClick={takeSnapshot}>
              <Camera className="mr-2 h-4 w-4" />
              Tomar foto
            </button>
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => {
                stopStream();
                setPhase('idle');
              }}
            >
              Cancelar
            </button>
          </>
        )}

        {phase === 'fallback' && (
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Subir foto
          </button>
        )}

        {phase === 'captured' && (
          <>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => upload.mutate()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar selfie
            </button>
            <button
              type="button"
              className={BTN_GHOST}
              onClick={retake}
              disabled={upload.isPending}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Tomar de nuevo
            </button>
          </>
        )}

        {onCancel && phase !== 'live' && (
          <button
            type="button"
            className={cn(BTN_GHOST, 'text-slate-500')}
            onClick={() => {
              stopStream();
              onCancel();
            }}
            disabled={upload.isPending}
          >
            Cerrar
          </button>
        )}
      </div>

      {/* Hidden file input used for both the deliberate fallback and the
          "Subir foto" shortcut on mobile. `capture=user` hints the OS to
          default to the front camera when the user taps. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="user"
        className="hidden"
        onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export default SelfieCapture;
