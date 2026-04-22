'use client';

import { useEffect } from 'react';

/**
 * Mounts the client-side interactivity for the home page:
 *   • Navbar scrolled state
 *   • Hero word rotator
 *   • Membership cycle toggle (mensual / trimestral / anual)
 *   • Mobile menu drawer
 * This is migrated verbatim (structurally) from redesign.html's inline <script>.
 */
export function InteractivityClient() {
  useEffect(() => {
    /* ---------- Navbar scrolled state ---------- */
    const navbar = document.getElementById('navbar');
    const onScroll = () => {
      if (!navbar) return;
      if (window.scrollY > 10) navbar.classList.add('scrolled', 'shadow-md');
      else navbar.classList.remove('scrolled', 'shadow-md');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- Hero rotator ---------- */
    const rotator = document.querySelector('.rotator');
    let rotatorInterval: ReturnType<typeof setInterval> | null = null;
    if (rotator) {
      const words = rotator.querySelectorAll('em');
      let i = 0;
      rotatorInterval = setInterval(() => {
        words[i].classList.remove('is-active');
        i = (i + 1) % words.length;
        words[i].classList.add('is-active');
      }, 2400);
    }

    /* ---------- Cycle toggle ---------- */
    const cycleLabels: Record<string, string> = {
      month: '/mes',
      q: '/mes · cobro trimestral',
      y: '/mes · cobro anual',
    };
    const cycleBtns = document.querySelectorAll<HTMLElement>('.cycle-btn');
    const handleCycle = (e: Event) => {
      const btn = e.currentTarget as HTMLElement;
      cycleBtns.forEach((b) => {
        b.classList.remove('is-active', 'bg-white', 'text-blue-700', 'shadow-sm');
        b.classList.add('text-slate-600');
      });
      btn.classList.add('is-active', 'bg-white', 'text-blue-700', 'shadow-sm');
      btn.classList.remove('text-slate-600');
      const mode = btn.dataset.cycle as 'month' | 'q' | 'y';
      document
        .querySelectorAll<HTMLElement>('.plan-price')
        .forEach((el) => {
          const v = parseInt(
            el.dataset[mode] || el.dataset.month || '0',
            10,
          );
          const monthly =
            mode === 'month'
              ? v
              : mode === 'q'
                ? Math.round(v / 3)
                : Math.round(v / 12);
          el.textContent = monthly.toLocaleString('es-MX');
        });
      document
        .querySelectorAll<HTMLElement>('.cycle-label')
        .forEach((el) => {
          el.textContent = cycleLabels[mode];
        });
    };
    cycleBtns.forEach((b) => {
      b.addEventListener('click', handleCycle);
      b.classList.add('text-slate-600');
    });
    const initBtn = document.querySelector<HTMLElement>(
      '.cycle-btn.is-active',
    );
    if (initBtn) {
      initBtn.classList.add('bg-white', 'text-blue-700', 'shadow-sm');
      initBtn.classList.remove('text-slate-600');
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      cycleBtns.forEach((b) => b.removeEventListener('click', handleCycle));
      if (rotatorInterval) clearInterval(rotatorInterval);
    };
  }, []);

  return null;
}
