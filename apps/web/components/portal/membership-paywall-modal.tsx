'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Lock, X, ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Friendly name of the feature the user tried to access (e.g. "Mi QR", "Rutinas"). */
  featureName?: string;
  /**
   * Optional: when provided, the "Ver planes" CTA opens the in-portal
   * PlansModal instead of navigating to the public landing `/#planes`.
   * This keeps the user inside the portal.
   */
  onSeePlans?: () => void;
}

export function MembershipPaywallModal({ open, onClose, featureName, onSeePlans }: Props) {
  // Lock body scroll while open so the page underneath doesn't scroll behind the modal.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const what = featureName ? `usar ${featureName}` : 'usar esta función';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      {/* Card — bottom sheet on mobile, centered card on tablet+ */}
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Lock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id="paywall-title"
              className="font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
            >
              Necesitas membresía
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Para {what} necesitas una membresía vigente. Elige el plan que se
              adapta a ti — cancelas cuando quieras.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Ahora no
          </button>
          {onSeePlans ? (
            <button
              type="button"
              onClick={onSeePlans}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
            >
              Ver planes
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/#planes"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
            >
              Ver planes
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
