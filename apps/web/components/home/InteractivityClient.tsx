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
      if (window.scrollY > 10) navbar.classList.add('scrolled', 'shadow-2xl');
      else navbar.classList.remove('scrolled', 'shadow-2xl');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- Mobile menu ---------- */
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    let menuOpen = false;
    const toggleMenu = () => {
      menuOpen = !menuOpen;
      if (!mobileMenu || !navbar) return;
      if (menuOpen) {
        mobileMenu.classList.remove('translate-x-full');
        document.body.classList.add('overflow-hidden');
        navbar.classList.add('bg-brand-dark/95');
      } else {
        mobileMenu.classList.add('translate-x-full');
        document.body.classList.remove('overflow-hidden');
        if (window.scrollY < 10)
          navbar.classList.remove('bg-brand-dark/95');
      }
    };
    mobileBtn?.addEventListener('click', toggleMenu);
    const mobileLinks = document.querySelectorAll('.mobile-link');
    const linkClose = () => {
      if (menuOpen) toggleMenu();
    };
    mobileLinks.forEach((l) => l.addEventListener('click', linkClose));

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
        b.classList.remove('is-active', 'bg-brand-orange', 'text-black');
        b.classList.add('text-white/70');
      });
      btn.classList.add('is-active', 'bg-brand-orange', 'text-black');
      btn.classList.remove('text-white/70');
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
      b.classList.add('text-white/70');
    });
    const initBtn = document.querySelector<HTMLElement>(
      '.cycle-btn.is-active',
    );
    if (initBtn) {
      initBtn.classList.add('bg-brand-orange', 'text-black');
      initBtn.classList.remove('text-white/70');
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      mobileBtn?.removeEventListener('click', toggleMenu);
      mobileLinks.forEach((l) => l.removeEventListener('click', linkClose));
      cycleBtns.forEach((b) => b.removeEventListener('click', handleCycle));
      if (rotatorInterval) clearInterval(rotatorInterval);
    };
  }, []);

  return null;
}
