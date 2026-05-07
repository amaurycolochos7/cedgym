'use client';

import { useEffect } from 'react';

/**
 * Auto-actualiza la PWA sin que el socio tenga que desinstalar/reinstalar.
 *
 * Cómo funciona:
 *
 *  1. Registra el service worker (/sw.js) si no existe.
 *  2. Cada hora le pide al browser que verifique si hay un SW nuevo
 *     en el servidor (`registration.update()`). Esto fuerza el chequeo
 *     en clientes que dejan la PWA abierta días sin cerrarla.
 *  3. Cuando hay un SW nuevo "waiting" (instalado pero sin tomar
 *     control), le manda postMessage SKIP_WAITING para que se active
 *     inmediatamente.
 *  4. Cuando el SW nuevo toma control (controllerchange), recargamos
 *     la pestaña con window.location.reload(). El usuario ve un
 *     refresh corto y la PWA queda con el código nuevo.
 *
 * Para web normal (no PWA), el flujo es el mismo — Chrome/Edge/Firefox
 * en escritorio también respetan SW y se benefician del refresh.
 */
export function PWAUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let reloadOnce = false; // evita doble reload si controllerchange dispara dos veces
    let updateInterval: ReturnType<typeof setInterval> | null = null;

    const onControllerChange = () => {
      // El SW nuevo tomó control. Reload para que la página corra
      // con su versión del bundle. El ?_= es un cache buster por si
      // algún caché intermedio (proxy, antivirus) se quedó pegado.
      if (reloadOnce) return;
      reloadOnce = true;
      window.location.reload();
    };

    const registerAndPoll = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');

        // Si ya hay un SW pendiente al registrar (deploy reciente),
        // dispara el flujo de skip-waiting de inmediato.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Cuando aparece un SW nuevo en estado "installing"…
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // Ya hay otro SW corriendo y este nuevo está listo.
              // Le pedimos que tome control.
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Polling: cada hora le pedimos al browser que revise si hay
        // un SW nuevo en /sw.js. Sin esto, las PWA que se mantienen
        // abiertas en background solo chequearán al recargar.
        updateInterval = setInterval(
          () => {
            reg.update().catch(() => {});
          },
          60 * 60 * 1000, // 1 hora
        );

        // También chequea cuando el usuario regresa a la pestaña
        // tras tenerla en background un rato.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      } catch (e) {
        // Registro falló (CSP, https issue) — no rompemos la app.
        console.warn('SW registration failed:', e);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    registerAndPoll();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (updateInterval) clearInterval(updateInterval);
    };
  }, []);

  return null;
}
