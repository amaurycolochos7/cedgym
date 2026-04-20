/* ===== CED·GYM · Plataforma · Interacciones ===== */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Year ---------- */
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* ---------- Rotating hero word ---------- */
  const rotator = $('.hero__rotator');
  if (rotator) {
    const words = $$('em', rotator);
    let idx = 0;
    setInterval(() => {
      words[idx].classList.remove('is-active');
      idx = (idx + 1) % words.length;
      words[idx].classList.add('is-active');
    }, 2200);
  }

  /* ---------- Sport selector ---------- */
  $$('.sportsel__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.sportsel__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  /* ---------- Billing cycle ---------- */
  const cycleBtns = $$('.cycle__btn');
  const cycleLabels = {
    month: '/mes',
    q:     '/mes · cobro trimestral',
    y:     '/mes · cobro anual'
  };
  cycleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cycleBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const mode = btn.dataset.cycle;
      $$('.plan').forEach(plan => {
        const priceEl = $('b', plan.querySelector('.plan__price'));
        if (!priceEl) return;
        const val = parseInt(priceEl.dataset[mode] || priceEl.dataset.month, 10);
        const monthly = mode === 'month' ? val : mode === 'q' ? Math.round(val / 3) : Math.round(val / 12);
        priceEl.textContent = monthly.toLocaleString('es-MX');
        const em = plan.querySelector('[data-cycle-label]');
        if (em) em.textContent = ' ' + cycleLabels[mode];
      });
    });
  });

  /* ---------- Modals ---------- */
  const modals = {
    login:    $('#modalLogin'),
    signup:   $('#modalSignup'),
    checkout: $('#modalCheckout'),
  };

  function openModal(key, ctx) {
    Object.values(modals).forEach(m => m && m.classList.remove('is-open'));
    const m = modals[key];
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (key === 'checkout' && ctx) applyCheckoutContext(ctx);
  }
  function closeModal() {
    Object.values(modals).forEach(m => { if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } });
    document.body.style.overflow = '';
  }

  $$('[data-open]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.dataset.open;
      const plan = btn.dataset.plan;
      openModal(key, { plan });
    });
  });
  $$('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  const PLAN_INFO = {
    'starter':          { label: 'Starter · Mensual',          total: 690 },
    'pro':              { label: 'Pro · Mensual',              total: 1290 },
    'elite':            { label: 'Élite · Mensual',            total: 2290 },
    'course-preseason': { label: 'Pretemporada de Football',   total: 2490 },
    'course-pl12':      { label: 'Powerlifting 12 Weeks',      total: 3190 },
    'course-nutri':     { label: 'Nutrición deportiva',        total: 1290 },
    'course-kids':      { label: 'Escuela infantil · Mensual', total: 890 },
  };
  function applyCheckoutContext({ plan }) {
    const info = PLAN_INFO[plan] || PLAN_INFO['pro'];
    const coPlan  = $('#coPlan');
    const coTotal = $('#coTotal');
    if (coPlan)  coPlan.textContent  = info.label;
    if (coTotal) coTotal.textContent = '$' + info.total.toLocaleString('es-MX') + ' MXN';
  }

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  const selectors = [
    '.sect', '.feature', '.sport-card', '.course',
    '.plan', '.coach', '.phone', '.dash', '.mega__wrap',
    '.card-athlete', '.pay-chip', '.quote'
  ];
  $$(selectors.join(',')).forEach(el => {
    el.setAttribute('data-reveal', '');
    io.observe(el);
  });
})();
