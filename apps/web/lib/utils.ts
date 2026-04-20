import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
