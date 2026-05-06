'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { staffPosApi } from '@/lib/staff-api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID del socio cuyo teléfono se va a corregir. */
  userId: string;
  /** Teléfono actual (para mostrarlo y comparar). Acepta `+52614…` o '6141234567'. */
  currentPhone: string;
  /** Nombre para usar en el toast de confirmación. */
  memberName?: string;
  /** Opcional: callback tras éxito (para invalidar queries en el caller). */
  onCorrected?: () => void;
}

/**
 * Diálogo compartido para corregir el teléfono de un socio cuando
 * recepción se equivocó al inscribirlo. Llama
 * POST /staff/members/:id/correct-phone que:
 *   1) actualiza el teléfono
 *   2) invalida el welcome link viejo (welcome_token_v++)
 *   3) limpia password/selfie/last_login_at por si el destinatario
 *      equivocado redimió el link viejo
 *   4) manda WhatsApp nuevo al número corregido
 *
 * El botón requiere confirmar la acción porque resetea contraseña
 * y selfie del socio (acción destructiva si fue por error).
 */
export function CorrectPhoneDialog({
  open,
  onOpenChange,
  userId,
  currentPhone,
  memberName,
  onCorrected,
}: Props) {
  const [phone, setPhone] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  // Reset al abrir/cerrar.
  React.useEffect(() => {
    if (!open) {
      setPhone('');
      setConfirmed(false);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => staffPosApi.correctPhone(userId, phone.trim()),
    onSuccess: () => {
      toast.success(
        `Teléfono actualizado y link reenviado${
          memberName ? ` a ${memberName.split(' ')[0]}` : ''
        }.`,
      );
      onCorrected?.();
      onOpenChange(false);
    },
    onError: (err: { message?: string; code?: string }) => {
      if (err?.code === 'PHONE_TAKEN') {
        toast.error('Ese teléfono ya está registrado para otro socio.');
      } else if (err?.code === 'PHONE_INVALID') {
        toast.error('Teléfono inválido. Usa 10 dígitos o formato +52…');
      } else {
        toast.error(err?.message ?? 'No se pudo corregir el teléfono');
      }
    },
  });

  // Solo permitimos dígitos en el input — recepción puede pegar con
  // espacios o guiones, los limpiamos. La normalización a +52 sucede
  // en el backend.
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d+]/g, '').slice(0, 16);
    setPhone(raw);
  };

  const cleanedDigits = phone.replace(/\D/g, '');
  const valid = cleanedDigits.length >= 10 && cleanedDigits.length <= 15;
  const sameAsCurrent =
    valid &&
    (cleanedDigits === currentPhone.replace(/\D/g, '') ||
      `+52${cleanedDigits}` === currentPhone ||
      `+${cleanedDigits}` === currentPhone);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !mut.isPending && onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={mut.isPending}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Corregir teléfono
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Si te equivocaste al escribir el número, corrígelo aquí. El link
          que se mandó al número anterior queda invalidado y se manda uno
          nuevo al teléfono correcto.
        </p>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Teléfono actual:</span>
            <span className="font-mono text-slate-900">
              {currentPhone || '—'}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="new-phone"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600"
          >
            Teléfono correcto
          </label>
          <input
            id="new-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="+52 614 123 4567"
            autoFocus
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            10 dígitos local (México) o internacional con +. Sin espacios
            ni guiones.
          </p>
        </div>

        <label className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-amber-300 text-amber-600 focus:ring-amber-500"
          />
          <span>
            <span className="flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Esto resetea contraseña y selfie del socio
            </span>
            Por si el destinatario equivocado alcanzó a abrir el link
            anterior. El socio legítimo arranca limpio desde el paso 1.
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={!valid || sameAsCurrent || !confirmed || mut.isPending}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mut.isPending ? 'Corrigiendo…' : 'Corregir y reenviar'}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:flex-initial"
          >
            Cancelar
          </button>
        </div>

        {sameAsCurrent && (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Es el mismo número actual. Cambia algún dígito para corregir.
          </p>
        )}
      </div>
    </div>
  );
}
