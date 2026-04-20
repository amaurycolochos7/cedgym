'use client';

import * as React from 'react';
import { Award, ChevronDown, Dumbbell, Medal, Shield, Star, Trophy } from 'lucide-react';

type Category = 'football' | 'power' | 'rec';

const CATEGORY_META: Record<Category, { label: string; color: string; Icon: typeof Trophy }> = {
  football: { label: 'Football', color: 'text-brand-orange border-brand-orange/50 bg-brand-orange/10', Icon: Shield },
  power:    { label: 'Powerlifting', color: 'text-red-400 border-red-500/50 bg-red-500/10', Icon: Dumbbell },
  rec:      { label: 'Reconocimiento', color: 'text-amber-300 border-amber-400/50 bg-amber-400/10', Icon: Medal },
};

type Achievement = { year: string; cat: Category; title: string; desc: string };

const ACHIEVEMENTS: Achievement[] = [
  {
    year: '2000-05',
    cat: 'football',
    title: '5x Campeón con Osos Club',
    desc: 'Categorías Junior y Fachac de Fut Bol Americano.',
  },
  {
    year: '2007',
    cat: 'football',
    title: 'Primer touchdown inaugural Estadio UACH',
    desc: 'Partido inaugural Águilas de la UACH vs Bulldogs TLU (San Antonio, TX) el 24 de mayo. Placa de reconocimiento.',
  },
  {
    year: '2008',
    cat: 'football',
    title: 'Campeón Nacional ONEFA',
    desc: 'Águilas de la UACH — Liga Nacional de Fut Bol Americano.',
  },
  {
    year: '2009',
    cat: 'football',
    title: 'Seleccionado Nacional',
    desc: 'Entre los mejores receptores de México.',
  },
  {
    year: '2011',
    cat: 'power',
    title: 'Campeón Mundial — Palm Beach, FL',
    desc: 'Categoría hasta 75 kg.',
  },
  {
    year: '2013',
    cat: 'power',
    title: 'Campeón Mundial — Richmond, VA',
    desc: 'Primer lugar, categoría hasta 75 kg.',
  },
  {
    year: '2014',
    cat: 'power',
    title: '1° y 3° lugar Mundial — Las Vegas, NV',
    desc: 'Categoría hasta 83 kg.',
  },
  {
    year: '2015',
    cat: 'power',
    title: '2° lugar Panamericano — Ribeirão Preto, BR',
    desc: 'Categoría hasta 93 kg.',
  },
  {
    year: '2015',
    cat: 'rec',
    title: 'Teporaca',
    desc: 'Reconocimiento por su desempeño en competencias internacionales de Levantamiento de Potencia.',
  },
  {
    year: '2016',
    cat: 'power',
    title: 'Mundial RAW — Killeen, TX',
    desc: 'Categoría hasta 105 kg · lugar 15 de 50 competidores internacionales.',
  },
  {
    year: '2018',
    cat: 'power',
    title: '2° lugar Nacional — CDMX',
    desc: 'Categoría hasta 105 kg · total: 773 kg levantados.',
  },
  {
    year: '2019',
    cat: 'rec',
    title: '1er lugar · try-out Caudillos de CUU',
    desc: 'Press de banca: 32 repeticiones con 100 kg. Prueba utilizada también por Borregos TEC MTY, Águilas UACH y NFL.',
  },
  {
    year: '2023',
    cat: 'football',
    title: '2° lugar Nacional de Football Americano',
    desc: 'Selección Chihuahua · sede Mazatlán, Sinaloa.',
  },
];

const STATS = [
  { value: '3x', label: 'Campeón mundial Powerlifting', Icon: Trophy },
  { value: '20+', label: 'Años compitiendo élite', Icon: Star },
  { value: '773kg', label: 'Total levantado nacional 2018', Icon: Dumbbell },
  { value: '1°', label: 'TD inaugural Estadio UACH', Icon: Award },
];

const HIGHLIGHT_COUNT = 4;

export function FounderSection() {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, HIGHLIGHT_COUNT);
  const remaining = ACHIEVEMENTS.length - HIGHLIGHT_COUNT;

  return (
    <section
      id="fundador"
      className="relative overflow-hidden bg-gradient-to-b from-brand-dark via-black to-brand-dark px-4 py-10 sm:py-16"
    >
      <div className="pointer-events-none absolute -right-40 top-20 h-96 w-96 rounded-full bg-brand-orange/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-40 bottom-20 h-96 w-96 rounded-full bg-red-500/5 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center sm:mb-12">
          <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
            Detrás del método
          </span>
          <h2 className="mb-2 px-2 text-2xl font-black uppercase leading-tight sm:text-4xl md:text-5xl">
            Conoce al{' '}
            <span className="bg-gradient-to-r from-brand-orange-2 to-brand-orange bg-clip-text text-transparent">
              fundador
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-gray-400 sm:text-base">
            No vendemos teoría. El mismo método que nos llevó a ganar a nivel mundial.
          </p>
        </div>

        {/* Photo + bio */}
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          {/* Photo column */}
          <div className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="relative mb-5">
              <div className="absolute inset-0 animate-pulse rounded-3xl bg-brand-orange/30 blur-[60px]" />
              <div className="relative overflow-hidden rounded-2xl border-4 border-brand-dark shadow-[0_0_40px_rgba(30,90,255,0.25)] sm:rounded-3xl sm:border-[6px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/founder.jpg"
                  alt="M.A. Samuel Oswaldo Rodríguez Jeffery"
                  className="h-[280px] w-full max-w-[320px] object-cover sm:h-[460px] sm:w-[400px]"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.background = 'linear-gradient(135deg,#1a1a1a,#2a2a2a)';
                    img.removeAttribute('src');
                  }}
                />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-brand-orange/40 bg-black/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-orange backdrop-blur-sm sm:-bottom-4 sm:px-4 sm:py-1.5 sm:text-xs">
                Fundador · Coach
              </div>
            </div>

            <div className="mt-3">
              <h3 className="text-xl font-black uppercase leading-tight text-white sm:text-3xl">
                M.A. Samuel Oswaldo
                <br />
                Rodríguez Jeffery
              </h3>
              <p className="mt-1 text-xs text-gray-400 sm:mt-2 sm:text-base">
                Football Americano · Powerlifting · Prep Física
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-300 sm:text-base lg:mx-0">
                Atleta multidisciplina con más de dos décadas en alto rendimiento: campeón nacional con las Águilas UACH, tricampeón mundial de Powerlifting y referente de la preparación física en Chihuahua.
              </p>
            </div>
          </div>

          {/* Stats + timeline column */}
          <div>
            {/* Stats grid */}
            <div className="mb-5 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4">
              {STATS.map(({ value, label, Icon }) => (
                <div
                  key={label}
                  className="glass rounded-xl border border-white/5 p-3 sm:rounded-2xl sm:p-5"
                >
                  <Icon className="mb-1 h-4 w-4 text-brand-orange sm:mb-2 sm:h-6 sm:w-6" />
                  <div className="text-xl font-black leading-none text-white sm:text-3xl">
                    {value}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400 sm:text-xs">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="glass rounded-xl border border-white/5 p-3 sm:rounded-2xl sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-white sm:text-base">
                  Logros deportivos
                </h4>
                <div className="hidden gap-2 sm:flex">
                  {(Object.keys(CATEGORY_META) as Category[]).map((k) => {
                    const meta = CATEGORY_META[k];
                    return (
                      <span
                        key={k}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color}`}
                      >
                        <meta.Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <ol className="relative ml-1 space-y-3 border-l border-white/10 pl-4 sm:space-y-5 sm:pl-5">
                {visible.map((a, idx) => {
                  const meta = CATEGORY_META[a.cat];
                  return (
                    <li key={idx} className="relative">
                      <span
                        className={`absolute -left-[1.35rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border sm:-left-[1.52rem] sm:top-1 sm:h-5 sm:w-5 ${meta.color}`}
                      >
                        <meta.Icon className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-orange sm:text-sm">
                          {a.year}
                        </span>
                        <h5 className="text-xs font-bold text-white sm:text-base">
                          {a.title}
                        </h5>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 sm:text-sm">
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
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-orange/30 bg-brand-orange/10 py-2.5 text-[11px] font-black uppercase tracking-widest text-brand-orange transition hover:bg-brand-orange/20 sm:text-xs"
                >
                  {expanded ? 'Mostrar menos' : `Ver ${remaining} logros más`}
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
