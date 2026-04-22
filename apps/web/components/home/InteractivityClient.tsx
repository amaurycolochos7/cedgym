'use client';

import { useEffect } from 'react';

/**
 * Mounts the client-side interactivity for the home page:
 *   • Navbar scrolled state
 *   • Hero word rotator
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

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rotatorInterval) clearInterval(rotatorInterval);
    };
  }, []);

  return null;
}
