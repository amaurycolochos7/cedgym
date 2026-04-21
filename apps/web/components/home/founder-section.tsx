'use client';

import * as React from 'react';
import { Award, ChevronDown, Dumbbell, Medal, Shield, Star, Trophy } from 'lucide-react';

type Category = 'football' | 'power' | 'rec';

const CATEGORY_META: Record<
  Category,
  { label: string; pill: string; dot: string; Icon: typeof Trophy }
> = {
  football: {
    label: 'Football',
    pill: 'text-blue-700 ring-blue-200 bg-blue-50',
    dot: 'text-blue-700 ring-blue-200 bg-blue-50',
    Icon: Shield,
  },
  power: {
    label: 'Powerlifting',
    pill: 'text-rose-700 ring-rose-200 bg-rose-50',
    dot: 'text-rose-700 ring-rose-200 bg-rose-50',
    Icon: Dumbbell,
  },
  rec: {
    label: 'Reconocimiento',
    pill: 'text-amber-700 ring-amber-200 bg-amber-50',
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
  { year: '2011', cat: 'power', title: 'Campeón Mundial — Palm Beach, FL',
    desc: 'Categoría hasta 75 kg.' },
  { year: '2013', cat: 'power', title: 'Campeón Mundial — Richmond, VA',
    desc: 'Primer lugar, categoría hasta 75 kg.' },
  { year: '2014', cat: 'power', title: '1° y 3° lugar Mundial — Las Vegas, NV',
    desc: 'Categoría hasta 83 kg.' },
  { year: '2015', cat: 'power', title: '2° lugar Panamericano — Ribeirão Preto, BR',
    desc: 'Categoría hasta 93 kg.' },
  { year: '2015', cat: 'rec', title: 'Teporaca',
    desc: 'Reconocimiento por su desempeño en competencias internacionales de Levantamiento de Potencia.' },
  { year: '2016', cat: 'power', title: 'Mundial RAW — Killeen, TX',
    desc: 'Categoría hasta 105 kg · lugar 15 de 50 competidores internacionales.' },
  { year: '2018', cat: 'power', title: '2° lugar Nacional — CDMX',
    desc: 'Categoría hasta 105 kg · total: 773 kg levantados.' },
  { year: '2019', cat: 'rec', title: '1er lugar · try-out Caudillos de CUU',
    desc: 'Press de banca: 32 repeticiones con 100 kg. Prueba usada por Borregos TEC, Águilas UACH y NFL.' },
  { year: '2023', cat: 'football', title: '2° lugar Nacional de Football Americano',
    desc: 'Selección Chihuahua · sede Mazatlán, Sinaloa.' },
];

const STATS = [
  { value: '3×', label: 'Mundial Powerlifting', Icon: Trophy },
  { value: '20+', label: 'Años en élite', Icon: Star },
  { value: '773kg', label: 'Total nacional 2018', Icon: Dumbbell },
  { value: '1°', label: 'TD inaugural UACH', Icon: Award },
];

const HIGHLIGHT_COUNT = 4;

export function FounderSection() {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, HIGHLIGHT_COUNT);
  const remaining = ACHIEVEMENTS.length - HIGHLIGHT_COUNT;

  return (
    <section
      id="fundador"
      className="relative overflow-hidden bg-slate-50 px-4 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 text-center sm:mb-16">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
            Detrás del método
          </span>
          <h2 className="font-display mt-4 text-4xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Conoce al{' '}
            <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
              fundador
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
            No vendemos teoría. El mismo método que nos llevó a ganar a nivel mundial.
          </p>
        </div>

        {/* Photo + bio */}
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          {/* Photo column */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-3xl bg-blue-500/20 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/founder.jpg"
                  alt="M.A. Samuel Oswaldo Rodríguez Jeffery"
                  className="h-[320px] w-full max-w-[360px] object-cover sm:h-[480px] sm:w-[420px]"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.background = 'linear-gradient(135deg,#e2e8f0,#cbd5e1)';
                    img.removeAttribute('src');
                  }}
                />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-blue-700 shadow-md ring-1 ring-slate-200">
                Fundador · Coach
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <h3 className="font-display text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                M.A. Samuel Oswaldo Rodríguez Jeffery
              </h3>
              <p className="mt-1.5 text-sm text-blue-700 font-semibold sm:text-base">
                Football · Powerlifting · Prep Física
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                Atleta multidisciplina con más de dos décadas en alto rendimiento:
                campeón nacional con las Águilas UACH, tricampeón mundial de
                Powerlifting y referente de la preparación física en Chihuahua.
              </p>
            </div>
          </div>

          {/* Stats + timeline */}
          <div className="space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {STATS.map(({ value, label, Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm sm:p-5"
                >
                  <Icon className="mb-2 h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
                  <div className="font-display text-2xl font-bold leading-none text-slate-900 sm:text-3xl">
                    {value}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline card */}
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold uppercase tracking-widest text-slate-900">
                  Logros deportivos
                </h4>
                <div className="hidden gap-1.5 sm:flex">
                  {(Object.keys(CATEGORY_META) as Category[]).map((k) => {
                    const meta = CATEGORY_META[k];
                    return (
                      <span
                        key={k}
                        className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.pill}`}
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
