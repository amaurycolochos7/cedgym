/* ==============================================
   CED-GYM · Fabrica de Monstruos · Interactions
   ============================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ------------- Year -------------
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ------------- Loader -------------
  window.addEventListener('load', () => {
    const loader = $('#loader');
    if (loader) {
      setTimeout(() => loader.classList.add('loader--hide'), 700);
      setTimeout(() => loader.remove(), 1600);
    }
  });


  // ------------- Nav scroll state -------------
  const nav = $('#nav');
  const onScroll = () => {
    if (window.scrollY > 30) nav.classList.add('nav--scrolled');
    else nav.classList.remove('nav--scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ------------- Mobile menu -------------
  const burger = $('#burger');
  const mobileMenu = $('#mobileMenu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        burger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ------------- Reveal on scroll -------------
  const revealEls = $$('[data-reveal]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  revealEls.forEach(el => io.observe(el));

  // ------------- Counter animation -------------
  const counters = $$('[data-count]');
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10) || 0;
      const duration = 1800;
      const start = performance.now();

      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(target * eased).toLocaleString('es-MX');
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString('es-MX');
      };
      requestAnimationFrame(tick);
      counterIO.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => counterIO.observe(c));

  // ------------- Sparks (hero) -------------
  const sparks = $('#sparks');
  if (sparks) {
    const count = window.innerWidth < 700 ? 18 : 36;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + '%';
      s.style.bottom = -Math.random() * 20 + '%';
      s.style.animationDelay = Math.random() * 4 + 's';
      s.style.animationDuration = (3 + Math.random() * 4) + 's';
      const hue = Math.random() > 0.5 ? '#ff3d00' : '#ffb300';
      s.style.background = hue;
      s.style.boxShadow = `0 0 12px ${hue}`;
      s.style.opacity = 0.6 + Math.random() * 0.4;
      sparks.appendChild(s);
    }
  }

  // ------------- Tilt effect on service cards -------------
  if (window.matchMedia('(pointer: fine)').matches) {
    $$('[data-tilt]').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rx = ((y - cy) / cy) * -6;
        const ry = ((x - cx) / cx) * 6;
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        card.style.setProperty('--mx', (x / rect.width * 100) + '%');
        card.style.setProperty('--my', (y / rect.height * 100) + '%');
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // ------------- Parallax on hero logo (via CSS var, doesn't fight float animation) -------------
  const heroLogoImg = $('.hero__logo-img');
  if (heroLogoImg && window.matchMedia('(pointer: fine)').matches) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 16;
      const y = (e.clientY / window.innerHeight - 0.5) * 16;
      heroLogoImg.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  // ------------- Smooth scroll for hash links -------------
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#' || href.length < 2) return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ------------- CTA title per-letter hover randomizer -------------
  $$('.cta__title [data-split]').forEach((span, i) => {
    span.style.animationDelay = (i * 0.08) + 's';
  });

})();
