'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from './auth';

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
  'click',
] as const;

interface IdleOptions {
  /** Roles a los que aplica esta regla. Ej: ['ADMIN','SUPERADMIN']. */
  applyToRoles: string[];
  /** Minutos de inactividad antes del logout forzado. */
  idleMinutes: number;
  /** Minutos antes del límite en los que se muestra un warning. */
  warnBeforeMinutes?: number;
}

/**
 * Auto-logout por inactividad.
 *
 * Escucha eventos de actividad del usuario y resetea un timer cada vez.
 * Si el timer cumple `idleMinutes` sin actividad, limpia la sesión y
 * redirige al login. Solo se arma si el `user.role` está en `applyToRoles`.
 *
 * Optimizado para no re-renderizar React: todo vive en refs y un único
 * setInterval(1000) evalúa el timestamp de última actividad.
 */
export function useIdleLogout({
  applyToRoles,
  idleMinutes,
  warnBeforeMinutes = 2,
}: IdleOptions) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const lastActivityRef = useRef<number>(Date.now());
  const warnedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user?.role || !applyToRoles.includes(user.role)) return;

    const idleMs = idleMinutes * 60 * 1000;
    const warnMs = Math.max(0, idleMs - warnBeforeMinutes * 60 * 1000);

    const mark = () => {
      lastActivityRef.current = Date.now();
      warnedRef.current = false;
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, mark, { passive: true }),
    );

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= idleMs) {
        clearInterval(interval);
        ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
        logout();
        toast.error('Sesión cerrada por inactividad', {
          description: `Pasaron ${idleMinutes} min sin actividad. Vuelve a iniciar sesión.`,
        });
        router.push('/login?idle=1');
        return;
      }

      if (elapsed >= warnMs && !warnedRef.current) {
        warnedRef.current = true;
        const remaining = Math.ceil((idleMs - elapsed) / 60_000);
        toast.warning('Sesión por expirar', {
          description: `Cerraremos tu sesión en ~${remaining} min por inactividad.`,
          duration: 10_000,
        });
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [user?.role, applyToRoles, idleMinutes, warnBeforeMinutes, logout, router]);
}
