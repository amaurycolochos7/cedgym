'use client';

import * as React from 'react';
import { Award, ChevronDown, Dumbbell, Medal, Shield, Star, Trophy } from 'lucide-react';

type Category = 'football' | 'power' | 'rec';

const CATEGORY_META: Record<
  Category,
  { label: string; label_color: string; dot: string; Icon: typeof Trophy }
> = {
  football: {
    label: 'Football',
    label_color: 'text-blue-700',
    dot: 'text-blue-700 ring-blue-200 bg-blue-50',
    Icon: Shield,
  },
  power: {
    label: 'Powerlifting',
    label_color: 'text-rose-700',
    dot: 'text-rose-700 ring-rose-200 bg-rose-50',
    Icon: Dumbbell,
  },
  rec: {
    label: 'Reconocimiento',
    label_color: 'text-amber-700',
    dot: 'text-amber-700 ring-amber-200 bg-amber-50',
    Icon: Medal,
  },
};

type Achievement = { year: string; cat: Category; title: string; desc: string };

const ACHIEVEMENTS: Achievement[] = [
  { year: '2000-05', cat: 'football', title: '5x Campeón con Osos Club',
    desc: 'Categorías Junior y Fachac de Fut Bol Americano.' },
  { year: '2007', cat: 'football', title: 'Primer touchdown inaugural Estadio UACH',
    desc: 'Partido inaugural Águilas UACH vs Bulldogs TLU (San Antonio, TX) el 24 de mayo. Placa de reconocimiento.' },
  { year: '2008', cat: 'football', title: 'Campeón Nacional ONEFA',
    desc: 'Águilas de la UACH — Liga Nacional de Fut Bol Americano.' },
  { year: '2009', cat: 'football', title: 'Seleccionado Nacional',
    desc: 'Entre los mejores receptores de México.' },
  { year: '2011', cat: 'power', title: 'Campeón Internacional — Palm Beach, FL',
    desc: 'Categoría hasta 75 kg.' },
  { year: '2013', cat: 'power', title: 'Campeón Internacional — Richmond, VA',
    desc: 'Primer lugar, categoría hasta 75 kg.' },
  { year: '2014', cat: 'power', title: '1° y 3° lugar Internacional — Las Vegas, NV',
    desc: 'Categoría hasta 83 kg.' },
  { year: '2015', cat: 'power', title: '2° lugar Panamericano — Ribeirão Preto, BR',
    desc: 'Categoría hasta 93 kg.' },
  { year: '2015', cat: 'rec', title: 'Teporaca',
    desc: 'Reconocimiento por su desempeño en competencias internacionales de Levantamiento de Potencia.' },
  { year: '2016', cat: 'power', title: 'Internacional RAW — Killeen, TX',
    desc: 'Categoría hasta 105 kg · lugar 15 de 50 competidores internacionales.' },
  { year: '2018', cat: 'power', title: '2° lugar Nacional — CDMX',
    desc: 'Categoría hasta 105 kg · total: 773 kg levantados.' },
  { year: '2019', cat: 'rec', title: '1er lugar · try-out Caudillos de CUU',
    desc: 'Press de banca: 32 repeticiones con 100 kg. Prueba usada por Borregos TEC, Águilas UACH y NFL.' },
  { year: '2023', cat: 'football', title: '2° lugar Nacional de Football Americano',
    desc: 'Selección Chihuahua · sede Mazatlán, Sinaloa.' },
];

const STATS = [
  { value: '3×', label: 'Internacional Powerlifting', Icon: Trophy },
  { value: '20+', label: 'Años en élite', Icon: Star },
  { value: '778kg', label: 'Total nacional 2018', Icon: Dumbbell },
  { value: '1°', label: 'TD inaugural UACH', Icon: Award },
];

const HIGHLIGHT_COUNT = 4;

const CAROUSEL_IMAGES: { src: string; alt: string }[] = [
  { src: '/founder.jpg', alt: 'Samuel Jeffery' },
  { src: '/carr1.jpg', alt: 'Samuel Jeffery — powerlifting' },
  { src: '/carr2.jpg', alt: 'Samuel Jeffery — entrenamiento' },
  { src: '/carr3.jpg', alt: 'Samuel Jeffery — football' },
  { src: '/carr4.jpg', alt: 'Samuel Jeffery — football' },
  { src: '/carr5.jpg', alt: 'Samuel Jeffery — football' },
];

const AUTOPLAY_MS = 4000;
const SWIPE_THRESHOLD_PX = 40;

function FounderCarousel() {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const touchStartX = React.useRef<number | null>(null);
  const touchDeltaX = React.useRef(0);

  const total = CAROUSEL_IMAGES.length;
  const goTo = React.useCallback((next: number) => {
    setIndex(((next % total) + total) % total);
  }, [total]);
  const next = React.useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = React.useCallback(() => goTo(index - 1), [goTo, index]);

  React.useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, total]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    const dx = touchDeltaX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    // Resume autoplay after a short delay so the user can read the new slide
    window.setTimeout(() => setPaused(false), 1500);
  };

  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-slate-100 select-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Galería del coach"
              >
      <div
        className="flex h-full w-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {CAROUSEL_IMAGES.map((img, i) => (
          <div key={img.src} className="relative h-full w-full flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt}
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.background = 'linear-gradient(135deg,#1e40af,#0ea5e9)';
                el.removeAttribute('src');
              }}
            />
          </div>
        ))}
      </div>

      {/* Prev / next arrows — visible on hover (desktop) and always on touch */}
      <button
        type="button"
        onClick={prev}
        aria-label="Foto anterior"
        className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Foto siguiente"
        className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      {/* Dots */}
      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
        {CAROUSEL_IMAGES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Ir a la foto ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function FounderSection() {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, HIGHLIGHT_COUNT);
  const remaining = ACHIEVEMENTS.length - HIGHLIGHT_COUNT;

  return (
    <section
      id="fundador"
      className="relative overflow-hidden bg-white px-4 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 max-w-2xl">
          <h2 className="font-display text-4xl leading-[1.05] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            El coach detrás del método.
          </h2>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            M.A. Samuel Oswaldo Rodríguez Jeffery — tricampeón internacional de Powerlifting,
            campeón nacional con las Águilas UACH y referente de preparación física
            en Chihuahua.
          </p>
          <p className="mt-2 text-sm font-medium text-blue-600">
            Football · Powerlifting · Prep Física
          </p>
        </div>

        {/* Photo + stats + timeline */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          {/* Photo column — clean framing, no viewfinder chrome */}
          <div className="relative">
            <FounderCarousel />
            {/* Caption below the frame, editorial style */}
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <div>
                <p className="font-display text-xl font-semibold text-slate-900">
                  Samuel Jeffery
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Fundador · Coach
                </p>
              </div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-blue-600">
                3× Internacional · 20+ años
              </p>
            </div>
          </div>

          {/* Right column: stats + timeline */}
          <div className="space-y-6">
            {/* Stats grid — cleaner borders, no ring-shadow combo */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {STATS.map(({ value, label, Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                >
                  <Icon className="mb-2 h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
                  <div className="font-display text-2xl font-bold leading-none text-slate-900 sm:text-3xl">
                    {value}
                  </div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-2">
                <h4 className="font-display text-lg font-semibold text-slate-900">
                  Logros deportivos
                </h4>
                <div className="hidden gap-3 sm:flex">
                  {(Object.keys(CATEGORY_META) as Category[]).map((k) => {
                    const meta = CATEGORY_META[k];
                    return (
                      <span
                        key={k}
                        className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] ${meta.label_color}`}
                      >
                        <meta.Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <ol className="relative ml-1 space-y-4 border-l border-slate-200 pl-5 sm:space-y-5">
                {visible.map((a, idx) => {
                  const meta = CATEGORY_META[a.cat];
                  return (
                    <li key={idx} className="relative">
                      <span
                        className={`absolute -left-[1.72rem] top-1 flex h-5 w-5 items-center justify-center rounded-full ring-1 ${meta.dot}`}
                      >
                        <meta.Icon className="h-2.5 w-2.5" />
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 sm:text-xs">
                          {a.year}
                        </span>
                        <h5 className="text-sm font-semibold text-slate-900 sm:text-base">
                          {a.title}
                        </h5>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                        {a.desc}
                      </p>
                    </li>
                  );
                })}
              </ol>

              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 ring-1 ring-blue-200 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-blue-700 transition hover:bg-blue-100"
                >
                  {expanded ? 'Mostrar menos' : `Ver ${remaining} logros más`}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
