'use client';

import Link from 'next/link';
import { AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Llaves de localStorage — separadas para que descartar uno no oculte el otro.
const DISMISS_KEY_INCOMPLETE = 'cedgym_profile_banner_dismissed';
const DISMISS_KEY_UPGRADE = 'cedgym_profile_upgrade_banner_dismissed';

// Campos del wizard nuevo. Si el socio NO tiene ninguno de estos en su
// routine_profile o nutrition_profile pero sí está marcado como
// profile_completed, significa que viene del wizard viejo y nos falta
// info para alimentar bien a la IA.
const NEW_ROUTINE_FIELDS = [
  'motivation',
  'training_style',
  'priority_muscles',
  'goal_type',
  'dislikes',
  'years_training',
] as const;

const NEW_NUTRITION_FIELDS = [
  'cooker',
  'cooking_time',
  'budget',
  'disliked_foods',
  'supplements',
  'food_relationship',
] as const;

function hasAnyNewField(profile: Record<string, unknown> | null | undefined, fields: readonly string[]) {
  if (!profile || typeof profile !== 'object') return false;
  for (const k of fields) {
    const v = profile[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    return true;
  }
  return false;
}

export function ProfileCompletionBanner() {
  const { user } = useAuth();
  const [dismissedIncomplete, setDismissedIncomplete] = useState(false);
  const [dismissedUpgrade, setDismissedUpgrade] = useState(false);
  const [pathname, setPathname] = useState<string>('');

  // Read pathname from window instead of next/navigation's usePathname
  // — Next 14 + Turbopack has a recurring HMR bug where adding a hook
  // to an already-compiled client component boots the app with a null
  // React context on the next re-render. window.location works across
  // that boundary.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissedIncomplete(
      localStorage.getItem(DISMISS_KEY_INCOMPLETE) === '1',
    );
    setDismissedUpgrade(
      localStorage.getItem(DISMISS_KEY_UPGRADE) === '1',
    );
    setPathname(window.location.pathname);
  }, []);

  // Pulled aparte de useAuth porque user del context no trae los blobs
  // de perfil (rutina/nutrición). Esto sí los trae para detectar legacy.
  const meQ = useQuery<{
    user: {
      profile_completed?: boolean;
      fitness_profile?: Record<string, unknown> | null;
      routine_profile?: Record<string, unknown> | null;
      nutrition_profile?: Record<string, unknown> | null;
    };
  }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    enabled: !!user,
    // Sin staleTime — queremos que el banner refleje el estado de
    // BD lo más fresco posible. Si el socio actualiza su perfil en
    // otra pestaña o desde otro dispositivo, el banner desaparece
    // sin esperar.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Never on the perfil page itself — sería ruido redundante.
  if (pathname.startsWith('/portal/perfil')) return null;
  if (!user) return null;

  const me = meQ.data?.user;
  const profileCompleted = me?.profile_completed ?? user.profile_completed;

  // ── Caso 1: perfil aún no completado (socio nuevo) ────────────
  if (!profileCompleted && !dismissedIncomplete) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 text-sm">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="flex-1 text-blue-900 leading-snug">
          Completa tu perfil para acceder a más beneficios.
        </span>
        <Link
          href="/portal/perfil"
          className="shrink-0 text-blue-700 hover:text-blue-800 font-semibold whitespace-nowrap"
        >
          Completar →
        </Link>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY_INCOMPLETE, '1');
            setDismissedIncomplete(true);
          }}
          className="shrink-0 text-blue-500 hover:text-blue-700"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Caso 2: perfil "legacy" — completo pero sin campos nuevos ────
  // Lo detectamos cuando profile_completed=true PERO ni routine_profile
  // ni nutrition_profile contienen ninguno de los campos del wizard
  // nuevo (motivación, gustos, dislikes, supplementos, etc.).
  // No esperamos a que `meQ` cargue para evitar parpadeo: si no
  // tenemos data aún, no mostramos nada todavía (mejor un frame
  // vacío que un flicker).
  if (
    profileCompleted &&
    me &&
    !dismissedUpgrade &&
    !hasAnyNewField(me.routine_profile, NEW_ROUTINE_FIELDS) &&
    !hasAnyNewField(me.nutrition_profile, NEW_NUTRITION_FIELDS)
  ) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 text-sm">
        <span className="flex-1 text-amber-900 leading-snug">
          <strong className="font-semibold">Mejoramos tu perfil:</strong>{' '}
          ahora puedes contarnos tu motivación, alimentos que no te gustan, suplementos y más para que la IA entienda mejor lo que necesitas.
        </span>
        <Link
          href="/portal/perfil?upgrade=1"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors"
        >
          Actualizar
        </Link>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY_UPGRADE, '1');
            setDismissedUpgrade(true);
          }}
          className="shrink-0 text-amber-500 hover:text-amber-700"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
