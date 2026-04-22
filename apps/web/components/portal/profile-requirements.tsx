'use client';

import { CheckCircle2, Circle, ShieldCheck, ArrowRight } from 'lucide-react';
import { useProfileStatus } from '@/lib/use-profile-status';
import { cn } from '@/lib/utils';

interface RequirementItem {
  key: string;
  label: string;
  description: string;
  done: boolean;
  required: boolean;
  anchor: string;
}

/**
 * Visual checklist shown at the top of the "Mi cuenta" tab on /portal/perfil.
 *
 * - Required fields (full name + selfie) gate membership purchase.
 * - When all required items are done, collapses into a success badge.
 */
export function ProfileRequirements() {
  const {
    hasFullName,
    hasSelfie,
    canPurchaseMembership,
    requiredComplete,
    requiredTotal,
  } = useProfileStatus();

  const items: RequirementItem[] = [
    {
      key: 'full_name',
      label: 'Nombre completo',
      description: 'Como aparece en tu INE — lo usamos en tu recibo.',
      done: hasFullName,
      required: true,
      anchor: '#datos-personales',
    },
    {
      key: 'selfie',
      label: 'Selfie de identificación',
      description: 'El staff la usa para reconocerte en recepción.',
      done: hasSelfie,
      required: true,
      anchor: '#selfie',
    },
  ];

  const progressPct = Math.round((requiredComplete / requiredTotal) * 100);

  // All required items complete → collapsed success state.
  if (canPurchaseMembership) {
    return (
      <section
        aria-label="Requisitos para comprar membresía"
        className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-4 sm:p-5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                Listo para comprar membresía
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                <CheckCircle2 size={11} /> Verificado
              </span>
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-600">
              Tus datos básicos están completos. Ya puedes contratar un plan en el dashboard.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Requisitos para comprar membresía"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Header + progress */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ShieldCheck size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Requisitos para comprar membresía
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
              Completa estos datos antes de contratar tu plan.
            </p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] uppercase tracking-widest font-semibold text-slate-500">
              Progreso
            </span>
            <span className="block text-sm font-bold tabular-nums text-slate-900">
              {requiredComplete} / {requiredTotal}
            </span>
          </span>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={requiredComplete}
          aria-valuemin={0}
          aria-valuemax={requiredTotal}
          aria-label={`${requiredComplete} de ${requiredTotal} requisitos cumplidos`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              progressPct === 100 ? 'bg-emerald-500' : 'bg-blue-600',
            )}
            style={{ width: `${Math.max(progressPct, 4)}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.key}
            className={cn(
              'flex items-start gap-3 rounded-xl border px-3 py-2.5 transition',
              it.done
                ? 'border-emerald-100 bg-emerald-50/50'
                : it.required
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-slate-200 bg-white',
            )}
          >
            <span
              className={cn(
                'mt-0.5 shrink-0',
                it.done ? 'text-emerald-500' : 'text-slate-300',
              )}
              aria-hidden="true"
            >
              {it.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    it.done ? 'text-slate-900' : 'text-slate-800',
                  )}
                >
                  {it.label}
                </span>
                {it.required ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    Requerido
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Opcional
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 leading-snug">
                {it.description}
              </p>
            </div>
            {!it.done && (
              <a
                href={it.anchor}
                className="shrink-0 inline-flex items-center gap-1 self-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
              >
                Completar
                <ArrowRight size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
