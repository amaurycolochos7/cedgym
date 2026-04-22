'use client';

import { cn } from '@/lib/utils';

type Status = string;

type Variant = 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'brand' | 'default';

const VARIANT_CLASSES: Record<Variant, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
  muted: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-700',
  brand: 'bg-blue-100 text-blue-700',
  default: 'bg-slate-100 text-slate-700',
};

// Internal map keyed by UPPERCASE for predictable lookup. The
// `lookup()` helper normalizes any incoming status (camelCase,
// lowercase, mixed) before searching.
const MAP: Record<string, { variant: Variant; label: string }> = {
  // ── User account status ────────────────────────────────
  UNVERIFIED: { variant: 'warning', label: 'Por verificar' },
  ACTIVE: { variant: 'success', label: 'Activo' },
  INACTIVE: { variant: 'muted', label: 'Inactivo' },
  SUSPENDED: { variant: 'danger', label: 'Suspendido' },
  // ── Memberships ────────────────────────────────────────
  FROZEN: { variant: 'warning', label: 'Congelado' },
  EXPIRED: { variant: 'danger', label: 'Vencida' },
  CANCELLED: { variant: 'muted', label: 'Cancelada' },
  // ── Payments ───────────────────────────────────────────
  APPROVED: { variant: 'success', label: 'Pagado' },
  PENDING: { variant: 'warning', label: 'Pendiente' },
  REJECTED: { variant: 'danger', label: 'Rechazado' },
  REFUNDED: { variant: 'info', label: 'Reembolsado' },
  // ── Background jobs ────────────────────────────────────
  RUNNING: { variant: 'info', label: 'En curso' },
  DONE: { variant: 'success', label: 'Listo' },
  FAILED: { variant: 'danger', label: 'Falló' },
  // ── WhatsApp session ───────────────────────────────────
  CONNECTED: { variant: 'success', label: 'Conectado' },
  DISCONNECTED: { variant: 'danger', label: 'Desconectado' },
  STARTING: { variant: 'warning', label: 'Iniciando…' },
  // ── Classes ────────────────────────────────────────────
  SCHEDULED: { variant: 'info', label: 'Programada' },
  COMPLETED: { variant: 'success', label: 'Completada' },
};

// Friendly fallback: if the status comes from a system we haven't
// catalogued, capitalize it (e.g. "trial_period" → "Trial period")
// instead of dumping the raw token on the user.
function prettify(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: Status }) {
  const key = String(status ?? '').trim().toUpperCase();
  const entry = MAP[key] ?? {
    variant: 'default' as Variant,
    label: prettify(String(status ?? '')),
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        VARIANT_CLASSES[entry.variant],
      )}
    >
      {entry.label}
    </span>
  );
}
