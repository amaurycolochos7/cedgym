import Link from 'next/link';
import {
  ArrowRight,
  Baby,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Flame,
  Instagram,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { FeaturedProducts } from '@/components/home/featured-products';
import { FounderSection } from '@/components/home/founder-section';
import { InteractivityClient } from '@/components/home/InteractivityClient';
import { PlanCarousel } from '@/components/ui/plan-carousel';

export default function HomePage() {
  return (
    <div className="bg-white text-slate-900">
      {/* ═════════ NAVBAR ═════════ */}
      <nav
        id="navbar"
        className="navbar fixed top-0 z-50 w-full border-b border-slate-200/70 bg-white/85 backdrop-blur-xl transition-all duration-300"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between md:h-18">
            <Link href="#inicio" className="group relative z-50 flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="CED·GYM"
                className="h-9 w-9 rounded-full ring-1 ring-slate-200 sm:h-10 sm:w-10"
              />
              <span className="logo-font text-lg font-black leading-none tracking-tight sm:text-xl">
                <span className="text-blue-600">CED</span>
                <span className="text-slate-900">·GYM</span>
              </span>
            </Link>

            {/* Desktop menu */}
            <div className="hidden items-center gap-7 text-[12px] font-semibold uppercase tracking-[0.15em] text-slate-600 lg:flex">
              <a href="#inicio" className="transition-colors hover:text-blue-600">Inicio</a>
              <a href="#disciplinas" className="transition-colors hover:text-blue-600">Deportes</a>
              <a href="#fundador" className="transition-colors hover:text-blue-600">Fundador</a>
              <a href="#ia" className="transition-colors hover:text-blue-600">IA</a>
              <a href="#planes" className="transition-colors hover:text-blue-600">Planes</a>
              <Link href="/tienda" className="transition-colors hover:text-blue-600">Tienda</Link>
            </div>

            {/* CTAs desktop */}
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 transition hover:bg-slate-100"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-blue-600 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/30 transition-all hover:bg-blue-700 hover:shadow-blue-700/40"
              >
                <span>Crear cuenta</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              id="mobile-menu-btn"
              className="z-50 p-2 text-slate-700 transition hover:text-blue-600 focus:outline-none lg:hidden"
              aria-label="Toggle menu"
              suppressHydrationWarning
            >
              <Menu className="h-7 w-7" />
            </button>
          </div>
        </div>

        {/* Mobile menu overlay */}
        <div
          id="mobile-menu"
          className="fixed inset-0 z-40 flex translate-x-full flex-col overflow-y-auto bg-white px-6 pt-24 transition-transform duration-300 lg:hidden"
        >
          <div className="mt-4 flex flex-col space-y-5 text-xl font-bold tracking-tight text-slate-900">
            {[
              ['Inicio', '#inicio'],
              ['Deportes', '#disciplinas'],
              ['Fundador', '#fundador'],
              ['IA', '#ia'],
              ['Planes', '#planes'],
              ['Tienda', '/tienda'],
              ['Contacto', '#ubicacion'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href!}
                className="mobile-link border-b border-slate-200 pb-4 text-slate-900 transition hover:text-blue-600"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="mt-8 space-y-3 pb-12">
            <Link
              href="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-center text-sm font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/30"
            >
              <UserPlus className="h-5 w-5" /> Crear cuenta
            </Link>
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white ring-1 ring-slate-300 py-4 text-center text-sm font-semibold uppercase tracking-[0.15em] text-slate-700"
            >
              <LogIn className="h-5 w-5" /> Iniciar sesión
            </Link>
          </div>
        </div>
      </nav>

      {/* ═════════ HERO ═════════ */}
      <section
        id="inicio"
        className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white pt-24 pb-12 sm:pt-28 sm:pb-20 lg:pt-32"
      >
        {/* Subtle dot grid bg */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(37,99,235,0.12) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            {/* Copy */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                CED·GYM · Chihuahua
              </span>
              <h1 className="font-display mt-5 text-5xl leading-[0.95] tracking-tight text-slate-900 sm:text-6xl md:text-7xl lg:text-7xl">
                ENTRENA CON{' '}
                <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 bg-clip-text text-transparent">
                  MÉTODO
                </span>
                ,<br />
                NO CON COPIA Y PEGA.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Rutinas y planes de comida personalizados con IA, diseñados por el
                Coach <strong className="text-slate-900">Samuel Jeffery</strong> —
                tricampeón mundial de powerlifting.
              </p>

              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-4 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-700/30"
                >
                  <Flame className="h-5 w-5" />
                  Empieza hoy
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#planes"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-semibold uppercase tracking-[0.15em] text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-50"
                >
                  Ver planes
                </a>
              </div>

              {/* Trust row */}
              <div className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6 sm:max-w-lg">
                {[
                  ['3×', 'Mundial Powerlifting'],
                  ['20+', 'Años de experiencia'],
                  ['30s', 'Tu rutina con IA'],
                ].map(([value, label]) => (
                  <div key={label}>
                    <div className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                      {value}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual */}
            <div className="relative">
              {/* Photo card */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1400"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-transparent" />
              </div>

              {/* Floating stat card */}
              <div className="absolute -bottom-6 -left-3 w-56 rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-xl sm:-left-6 sm:w-64">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      IA
                    </div>
                    <div className="font-display text-lg font-bold text-slate-900">
                      Rutina lista en 30s
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating QR card */}
              <div className="absolute -top-4 -right-3 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 p-4 text-white shadow-xl sm:-right-6">
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    QR incluido
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ DISCIPLINAS ═════════ */}
      <section id="disciplinas" className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Deportes"
            title="Nuestras disciplinas"
            sub="Rutinas adaptadas al deporte que practicas."
          />

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Fuerza',
                body: 'Hipertrofia, técnica y progresión por carga.',
                img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1000',
              },
              {
                title: 'HYROX',
                body: 'Condición funcional de competición.',
                img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000',
              },
              {
                title: 'Powerlifting',
                body: 'SBD con programación científica.',
                img: 'https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?q=80&w=1000',
              },
              {
                title: 'Funcional',
                body: 'Movilidad, coordinación y cardio.',
                img: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?q=80&w=1000',
              },
            ].map((d) => (
              <div
                key={d.title}
                className="group relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.img}
                  alt={d.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="font-display text-2xl uppercase tracking-tight text-white sm:text-3xl">
                    {d.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-white/90">{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════ RUTINAS ADAPTADAS ═════════ */}
      <section className="bg-slate-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Personalización"
            title="Rutinas adaptadas a ti"
            sub="Cada persona entrena diferente. Tu rutina lo sabe."
          />

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: 'Adultos',
                body: '18 a 55 años. Hipertrofia, fuerza y pérdida de grasa con plan completo.',
              },
              {
                icon: UserCheck,
                title: 'Adultos mayores',
                body: '55+ años. Baja carga, máquinas seguras, énfasis en movilidad.',
              },
              {
                icon: Baby,
                title: 'Niños y juveniles',
                body: '6 a 17 años. Entrenamiento funcional, coordinación y peso corporal.',
              },
              {
                icon: Trophy,
                title: 'Deportistas',
                body: 'Football, soccer, básquet, tenis. Programación específica por deporte.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════ IA EN 30 SEGUNDOS ═════════ */}
      <section id="ia" className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                <Sparkles className="h-3 w-3" /> Tecnología · IA
              </span>
              <h2 className="font-display mt-4 text-4xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
                Tu rutina en{' '}
                <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                  30 segundos
                </span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Nos dices tu objetivo, nivel, días disponibles y equipo. Nuestra IA
                —entrenada con el método del Coach Samuel y 20+ años de experiencia—
                arma tu plan semanal completo.
              </p>

              <ul className="mt-7 space-y-3">
                {[
                  'Rutina por día con sets, repes y descansos',
                  'Videos de ejecución en cada ejercicio',
                  'Se adapta a lesiones, edad y equipo disponible',
                  'Plan de comidas con lista de compras incluido',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-slate-700 sm:text-base">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  Crear mi rutina <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Mockup preview */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-6 text-white shadow-2xl sm:p-8">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-sky-300/20 blur-2xl" />

                <div className="relative">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                      Vista previa del portal
                    </span>
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white/30" />
                      <span className="h-2 w-2 rounded-full bg-white/30" />
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-5 backdrop-blur-sm ring-1 ring-white/15">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-sky-200">
                      Lunes · Empuje
                    </p>
                    <h4 className="mt-1.5 font-display text-2xl tracking-tight">
                      Sesión de hoy
                    </h4>

                    <div className="mt-4 space-y-2">
                      {[
                        { name: 'Press banca', sets: '4 × 6', rest: '2:30' },
                        { name: 'Press inclinado mancuerna', sets: '3 × 10', rest: '1:30' },
                        { name: 'Fondos en paralelas', sets: '3 × 8', rest: '2:00' },
                        { name: 'Extensión tríceps cable', sets: '4 × 12', rest: '1:00' },
                      ].map((ex) => (
                        <div
                          key={ex.name}
                          className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2.5 ring-1 ring-white/10"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">{ex.name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-white/70">
                              {ex.sets} · descanso {ex.rest}
                            </p>
                          </div>
                          <Check className="h-4 w-4 text-sky-200" />
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                        Próximo
                      </span>
                      <span className="text-xs font-semibold text-white">Mar · Tirón</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ FUNDADOR ═════════ */}
      <FounderSection />

      {/* ═════════ INSTALACIONES ═════════ */}
      <section className="bg-slate-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Instalaciones"
            title="Todo lo que necesitas"
            sub="Máquinas, zona funcional y cardio completo."
          />

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                title: 'Zona de máquinas',
                body: 'Pecho, pierna, espalda y hombro — cada grupo con máquina dedicada.',
                img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000',
              },
              {
                title: 'Área funcional',
                body: 'Llantas, marros, TRX, escaleras de agilidad y más.',
                img: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bcc?q=80&w=1000',
              },
              {
                title: 'Cardio completo',
                body: 'Bicicletas, remadoras, elípticas, esquís y caminadoras.',
                img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=1000',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.img}
                    alt={f.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════ PLANES ═════════ */}
      <section id="planes" className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Membresías"
            title="Elige tu nivel"
            sub="Todos los planes incluyen acceso al gym con QR. Cancela cuando quieras."
          />

          {/* Cycle switcher */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
              <button
                className="cycle-btn is-active rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition sm:px-5"
                data-cycle="month"
              >
                Mensual
              </button>
              <button
                className="cycle-btn flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition sm:px-5"
                data-cycle="q"
              >
                Trim.
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                  −10%
                </span>
              </button>
              <button
                className="cycle-btn flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition sm:px-5"
                data-cycle="y"
              >
                Anual
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                  −20%
                </span>
              </button>
            </div>
          </div>

          <div className="mt-10">
            <PlanCarousel>
              {/* Starter */}
              <PlanCard
                href="/register?redirect=/checkout/starter&product=starter&type=membership"
                tier="Starter"
                subtitle="Para empezar"
                icon={<Zap className="h-5 w-5" />}
                priceMonth="690"
                priceQ="1864"
                priceY="6624"
                features={[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Sala general' },
                  { t: '3 clases grupales / semana' },
                  { t: 'Plan base de entrenamiento' },
                  { t: 'Panel del atleta + progreso' },
                ]}
                cta="Elegir Starter"
              />

              {/* Pro (popular) */}
              <PlanCard
                href="/register?redirect=/checkout/pro&product=pro&type=membership"
                tier="Pro"
                subtitle="Atleta regular"
                popular
                icon={<Flame className="h-5 w-5" />}
                priceMonth="1,290"
                priceQ="3483"
                priceY="12384"
                features={[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Acceso ilimitado 6 días' },
                  { t: 'Clases grupales sin límite' },
                  { t: 'Plan personalizado por coach' },
                  { t: '1 curso incluido / trimestre' },
                ]}
                cta="Elegir Pro"
              />

              {/* Élite */}
              <PlanCard
                href="/register?redirect=/checkout/elite&product=elite&type=membership"
                tier="Élite"
                subtitle="Preparación deportiva"
                icon={<Crown className="h-5 w-5" />}
                priceMonth="2,290"
                priceQ="6183"
                priceY="21984"
                features={[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Programa individualizado' },
                  { t: 'Prep física por deporte' },
                  { t: '2 sesiones 1:1 / semana' },
                  { t: 'Nutrición + análisis de video' },
                ]}
                cta="Elegir Élite"
              />
            </PlanCarousel>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Pagos seguros · Mercado Pago · Cancela cuando quieras
          </p>
        </div>
      </section>

      {/* ═════════ PRODUCTS ═════════ */}
      <FeaturedProducts />

      {/* ═════════ UBICACION ═════════ */}
      <section id="ubicacion" className="bg-slate-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Contact card */}
            <div className="order-2 lg:order-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Contacto directo
              </span>
              <h2 className="font-display mt-4 text-4xl tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
                Visítanos
              </h2>
              <p className="mt-3 max-w-xl text-base text-slate-600 sm:text-lg">
                Estamos en el corazón de Chihuahua. Entra, conoce las instalaciones y
                te mostramos la sala.
              </p>

              <div className="mt-8 space-y-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm sm:p-8">
                <ContactRow
                  icon={<MapPin className="h-5 w-5" />}
                  label="Dirección"
                  primary="Av. Tecnológico, Santo Niño"
                  sub="Deportiva, Chihuahua, México"
                />
                <div className="h-px w-full bg-slate-100" />
                <ContactRow
                  href="https://wa.me/526141970660"
                  icon={<Phone className="h-5 w-5" />}
                  iconClass="bg-emerald-100 text-emerald-700"
                  label="WhatsApp"
                  primary="614 197 0660"
                />
                <div className="h-px w-full bg-slate-100" />
                <ContactRow
                  href="https://instagram.com/ced.gym.chih"
                  icon={<Instagram className="h-5 w-5" />}
                  iconClass="bg-pink-100 text-pink-700"
                  label="Síguenos"
                  primary="@ced.gym.chih"
                />
                <div className="h-px w-full bg-slate-100" />
                <ContactRow
                  icon={<Clock className="h-5 w-5" />}
                  label="Horario"
                  primary="Lun — Vie · 7:00 — 21:00"
                />
              </div>
            </div>

            {/* Map */}
            <div className="relative order-1 aspect-[4/3] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-xl lg:order-2 lg:aspect-auto lg:h-[560px]">
              <iframe
                src="https://www.google.com/maps?q=CED+Gym+Av.+Tecnologico+Santo+Nino+Chihuahua&output=embed&z=16"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 z-0"
              />
              <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between rounded-2xl bg-white/95 p-4 ring-1 ring-slate-200 shadow-lg backdrop-blur-md">
                <div>
                  <p className="font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    CED·GYM
                  </p>
                  <p className="text-xs font-semibold text-blue-600 sm:text-sm">
                    Fábrica de monstruos · Chihuahua
                  </p>
                </div>
                <a
                  href="https://maps.app.goo.gl/hjCPfR18PnDXEFqr7"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-4 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700"
                  aria-label="Abrir en Google Maps"
                >
                  <Navigation className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ FOOTER ═════════ */}
      <footer className="bg-slate-900 px-4 pt-16 pb-8 text-slate-300">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-2 md:text-left lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Link href="#inicio" className="group inline-flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="CED·GYM"
                  className="h-12 w-12 rounded-full ring-1 ring-white/10"
                />
                <span className="logo-font flex flex-col leading-none text-xl tracking-tight sm:text-2xl">
                  <span>
                    <span className="text-blue-400">CED</span>
                    <span className="text-white">·GYM</span>
                  </span>
                  <span className="mt-1 text-[0.45em] font-bold uppercase tracking-[0.25em] text-slate-400">
                    Fábrica de monstruos
                  </span>
                </span>
              </Link>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-400">
                Plataforma de preparación física para atletas. Forjando monstruos con
                disciplina, comunidad y datos reales.
              </p>
              <div className="mt-6 flex gap-3">
                <a
                  href="https://instagram.com/ced.gym.chih"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#E4405F]"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href="https://wa.me/526141970660"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#25D366]"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a
                  href="tel:+526141970660"
                  aria-label="Llamar"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-blue-600"
                >
                  <Phone className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-white">
                Plataforma
              </h4>
              <ul className="space-y-3 text-sm">
                <FooterLink href="#disciplinas">Deportes</FooterLink>
                <FooterLink href="#planes">Membresías</FooterLink>
                <FooterLink href="/tienda">Tienda</FooterLink>
                <FooterLink href="#ia">IA</FooterLink>
              </ul>
            </div>

            <div>
              <h4 className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-white">
                Cuenta
              </h4>
              <ul className="space-y-3 text-sm">
                <FooterLink href="/login">Iniciar sesión</FooterLink>
                <FooterLink href="/register">Crear cuenta</FooterLink>
                <FooterLink href="#ubicacion">Contacto</FooterLink>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} CED·GYM. Todos los derechos reservados.
            </p>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Pagos por{' '}
              <span className="mp-badge" style={{ padding: '4px 8px' }}>
                <span style={{ fontSize: '.55rem' }}>mercado</span>
                <b style={{ fontSize: '.65rem' }}>pago</b>
              </span>
            </p>
          </div>
        </div>
      </footer>

      <InteractivityClient />
    </div>
  );
}

/* ═════════ Helpers ═════════ */

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="text-center">
      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
        {eyebrow}
      </span>
      <h2 className="font-display mt-4 text-4xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
          {sub}
        </p>
      )}
    </div>
  );
}

function PlanCard({
  href,
  tier,
  subtitle,
  icon,
  popular,
  priceMonth,
  priceQ,
  priceY,
  features,
  cta,
}: {
  href: string;
  tier: string;
  subtitle: string;
  icon: React.ReactNode;
  popular?: boolean;
  priceMonth: string;
  priceQ: string;
  priceY: string;
  features: { t: string; hi?: boolean }[];
  cta: string;
}) {
  return (
    <div
      className={
        'relative flex h-full flex-col rounded-3xl p-6 sm:p-7 ring-1 transition ' +
        (popular
          ? 'bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white ring-blue-600 shadow-xl shadow-blue-600/25'
          : 'bg-white text-slate-900 ring-slate-200 shadow-sm hover:-translate-y-1 hover:shadow-md')
      }
    >
      {popular && (
        <span className="absolute -top-3 right-6 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700 shadow-sm">
          Más popular
        </span>
      )}

      <div className="mb-5 flex items-center gap-3">
        <span
          className={
            'inline-flex h-11 w-11 items-center justify-center rounded-xl ' +
            (popular
              ? 'bg-white/15 text-white ring-1 ring-white/20'
              : 'bg-blue-100 text-blue-700')
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-bold tracking-tight">{tier}</h3>
          <p
            className={
              'text-[11px] font-semibold uppercase tracking-[0.15em] ' +
              (popular ? 'text-white/80' : 'text-slate-500')
            }
          >
            {subtitle}
          </p>
        </div>
      </div>

      <div className={'mb-5 border-b pb-5 ' + (popular ? 'border-white/15' : 'border-slate-100')}>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black leading-none">
            $
            <span className="plan-price" data-month={priceMonth} data-q={priceQ} data-y={priceY}>
              {priceMonth}
            </span>
          </span>
          <span className={'text-sm ' + (popular ? 'text-white/80' : 'text-slate-500')}>
            MXN{' '}
            <em className="cycle-label not-italic text-xs">
              /mes
            </em>
          </span>
        </div>
      </div>

      <ul className="mb-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li
            key={f.t}
            className={
              'flex items-start gap-2 ' +
              (popular ? 'text-white/90' : f.hi ? 'font-semibold text-slate-900' : 'text-slate-700')
            }
          >
            {f.hi ? (
              <QrCode className={'mt-0.5 h-4 w-4 shrink-0 ' + (popular ? 'text-white' : 'text-blue-600')} />
            ) : (
              <Check className={'mt-0.5 h-4 w-4 shrink-0 ' + (popular ? 'text-sky-200' : 'text-blue-600')} />
            )}
            <span>{f.t}</span>
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={
          'mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] transition ' +
          (popular
            ? 'bg-white text-blue-700 hover:bg-sky-50'
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25')
        }
      >
        {cta} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ContactRow({
  icon,
  iconClass = 'bg-blue-100 text-blue-700',
  label,
  primary,
  sub,
  href,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  primary: string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <>
      <div
        className={
          'mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ' +
          iconClass
        }
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <p className="font-semibold text-slate-900">{primary}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="group flex items-center">
      {body}
    </a>
  ) : (
    <div className="flex items-center">{body}</div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const cls = 'text-slate-400 transition hover:text-white';
  return (
    <li>
      {isInternal ? (
        <Link href={href} className={cls}>
          {children}
        </Link>
      ) : (
        <a href={href} className={cls}>
          {children}
        </a>
      )}
    </li>
  );
}
