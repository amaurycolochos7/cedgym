import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Features que existen en el catálogo público (/memberships/plans)
// pero todavía NO queremos mostrar al socio en el frontend porque
// la funcionalidad no está liberada. Filtra por substring (case-
// insensitive) para tolerar pequeños cambios de copy en el backend
// sin tener que sincronizar el filtro al milímetro.
//
// Cuando el feature se libere en producto, simplemente sacar la
// línea de aquí — la UI vuelve a mostrarlo automáticamente sin
// tocar nada más.
const HIDDEN_FEATURE_SUBSTRINGS = [
  'panel del atleta', // pendiente de habilitar
];

/** Filtra features del catálogo de planes que aún no están liberadas. */
export function visiblePlanFeatures(features: string[]): string[] {
  return features.filter(
    (f) =>
      !HIDDEN_FEATURE_SUBSTRINGS.some((needle) =>
        f.toLowerCase().includes(needle),
      ),
  );
}

// Diccionario de plan codes legacy → nombre comercial en español.
// Lo usamos al traducir descripciones de pago que se grabaron en
// inglés antes del 2026-05 (ej. "Alta walk-in STARTER MONTHLY").
const PLAN_CODE_ES: Record<string, string> = {
  STARTER: 'Básico',
  PRO: 'Pro',
  ELITE: 'Élite',
};
const CYCLE_CODE_ES: Record<string, string> = {
  MONTHLY: 'mensual',
  QUARTERLY: 'trimestral',
  ANNUAL: 'anual',
};

/**
 * Traduce descripciones legacy de pagos que quedaron en inglés en
 * la DB (ej. "Alta walk-in STARTER MONTHLY") al copy en español que
 * generan los flujos nuevos. Las descripciones nuevas ya están en
 * español al guardarse, así que pasan tal cual. Operación
 * idempotente: si no matchea ningún patrón legacy, devuelve el
 * input sin cambios.
 */
export function formatPaymentDescription(raw?: string | null): string {
  if (!raw) return 'Membresía';
  const s = String(raw).trim();
  if (!s) return 'Membresía';

  // Patrón 1: "Alta walk-in {PLAN} {CYCLE}" — recepción nuevo socio.
  const altaWalkin = s.match(/^Alta walk-in (\w+) (\w+)$/i);
  if (altaWalkin) {
    const plan = PLAN_CODE_ES[altaWalkin[1].toUpperCase()] ?? altaWalkin[1];
    const cycle = CYCLE_CODE_ES[altaWalkin[2].toUpperCase()] ?? altaWalkin[2];
    return `Inscripción en recepción — Plan ${plan} (${cycle})`;
  }

  // Patrón 2: "Renovación walk-in {PLAN} {CYCLE}" — recepción renovación.
  const renovWalkin = s.match(/^Renovaci[óo]n walk-in (\w+) (\w+)$/i);
  if (renovWalkin) {
    const plan = PLAN_CODE_ES[renovWalkin[1].toUpperCase()] ?? renovWalkin[1];
    const cycle = CYCLE_CODE_ES[renovWalkin[2].toUpperCase()] ?? renovWalkin[2];
    return `Renovación en recepción — Plan ${plan} (${cycle})`;
  }

  // Patrón 3: "Renovación {PLAN} — {CYCLE}" — webhook Stripe (auto-renew).
  const renovOnline = s.match(/^Renovaci[óo]n (\w+) [—-] (\w+)$/i);
  if (renovOnline) {
    const plan = PLAN_CODE_ES[renovOnline[1].toUpperCase()] ?? renovOnline[1];
    const cycle = CYCLE_CODE_ES[renovOnline[2].toUpperCase()] ?? renovOnline[2];
    return `Renovación en línea — Plan ${plan} (${cycle})`;
  }

  // Patrón 4: "Inscripción walk-in curso: {NAME}" — curso por recepción.
  const cursoWalkin = s.match(/^Inscripci[óo]n walk-in curso:\s*(.+)$/i);
  if (cursoWalkin) {
    return `Inscripción a curso en recepción — ${cursoWalkin[1].trim()}`;
  }

  // Sin match → asumir que ya es texto user-friendly (los flujos
  // nuevos generan español directo, no necesitan traducción).
  return s;
}

/** Persist small JSON blobs with a TTL (ms). */
export function lsSetJSON<T>(key: string, value: T, ttlMs: number): void {
  if (typeof window === 'undefined') return;
  const payload = { value, expires: Date.now() + ttlMs };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

export function lsGetJSON<T = unknown>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; expires: number };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expires && parsed.expires < Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.value as T;
  } catch {
    return null;
  }
}

export function lsDelete(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

/** Computes age in full years for a YYYY-MM-DD string. */
export function ageFromISO(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

export function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Friendly plan names shown to members. Must match the landing copy —
// the enum codes (STARTER/PRO/ELITE) are internal only.
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  STARTER: 'Básico',
  PRO: 'Pro',
  ELITE: 'Élite',
};

export function planDisplayName(code?: string | null): string {
  if (!code) return '—';
  return PLAN_DISPLAY_NAMES[code] ?? code;
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  CANCELED: 'Cancelada',
  FROZEN: 'Congelada',
  PENDING: 'Pendiente',
};

export function membershipStatusLabel(code?: string | null): string {
  if (!code) return '—';
  const key = code.toUpperCase();
  return MEMBERSHIP_STATUS_LABELS[key] ?? code;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Pagado',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazado',
  REFUNDED: 'Reembolsado',
  FAILED: 'Fallido',
};

export function paymentStatusLabel(code?: string | null): string {
  if (!code) return '—';
  const key = code.toUpperCase();
  return PAYMENT_STATUS_LABELS[key] ?? code;
}

const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
  PENDING: 'Pendiente',
};

export function userStatusLabel(code?: string | null): string {
  if (!code) return '—';
  const key = code.toUpperCase();
  return USER_STATUS_LABELS[key] ?? code;
}
