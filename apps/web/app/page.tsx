import Link from 'next/link';
import {
  ArrowRight,
  Baby,
  Check,
  CheckCircle2,
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
    <>
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed left-0 top-0 -z-10 hidden h-full w-full overflow-hidden md:block">
        <div className="absolute -left-[10%] -top-[10%] h-96 w-96 animate-blob rounded-full bg-brand-orange/10 mix-blend-screen blur-[100px]" />
        <div
          className="absolute -right-[10%] top-[40%] h-96 w-96 animate-blob rounded-full bg-brand-orange/5 mix-blend-screen blur-[100px]"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="absolute bottom-[10%] left-[30%] h-96 w-96 animate-blob rounded-full bg-brand-orange/5 mix-blend-screen blur-[100px]"
          style={{ animationDelay: '4s' }}
        />
      </div>

      {/* Navbar */}
      <nav
        id="navbar"
        className="navbar fixed top-0 z-50 w-full border-b border-white/5 bg-brand-dark/80 backdrop-blur-xl transition-all duration-300"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between md:h-20">
            {/* Brand */}
            <Link
              href="#inicio"
              className="group relative z-50 flex items-center gap-3"
            >
              <img
                src="/logo.png"
                alt="CED·GYM"
                className="h-9 w-9 rounded-full ring-1 ring-white/10 sm:h-10 sm:w-10"
              />
              <span className="logo-font text-lg font-black leading-none tracking-tight sm:text-xl md:text-2xl">
                <span className="text-brand-orange">CED</span>
                <span className="text-white">·GYM</span>
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden items-center gap-7 text-xs font-bold uppercase tracking-widest text-gray-300 lg:flex">
              <a href="#inicio" className="transition-colors hover:text-brand-orange">
                Inicio
              </a>
              <a href="#disciplinas" className="transition-colors hover:text-brand-orange">
                Deportes
              </a>
              <a href="#fundador" className="transition-colors hover:text-brand-orange">
                Fundador
              </a>
              <a href="#cursos" className="transition-colors hover:text-brand-orange">
                Cursos
              </a>
              <a href="#planes" className="transition-colors hover:text-brand-orange">
                Planes
              </a>
              <Link href="/tienda" className="transition-colors hover:text-brand-orange">
                Tienda
              </Link>
            </div>

            {/* CTAs Desktop */}
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className="group relative overflow-hidden rounded-full bg-brand-orange px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_20px_rgba(30,90,255,0.3)] transition-all hover:shadow-[0_0_30px_rgba(30,90,255,0.5)]"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span>Crear cuenta</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              id="mobile-menu-btn"
              className="z-50 p-2 text-white transition hover:text-brand-orange focus:outline-none lg:hidden"
              aria-label="Toggle menu"
              suppressHydrationWarning
            >
              <Menu className="h-7 w-7" />
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        <div
          id="mobile-menu"
          className="fixed inset-0 z-40 flex translate-x-full flex-col overflow-y-auto bg-brand-dark/95 px-6 pt-24 backdrop-blur-2xl transition-transform duration-300 lg:hidden"
        >
          <div className="mt-4 flex flex-col space-y-8 text-xl font-black uppercase tracking-wider sm:text-2xl">
            <a
              href="#inicio"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Inicio
            </a>
            <a
              href="#disciplinas"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Deportes
            </a>
            <a
              href="#fundador"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Fundador
            </a>
            <a
              href="#cursos"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Cursos
            </a>
            <a
              href="#planes"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Membresías
            </a>
            <Link
              href="/tienda"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Tienda
            </Link>
            <a
              href="#ubicacion"
              className="mobile-link text-white transition hover:text-brand-orange"
            >
              Contacto
            </a>
          </div>
          <div className="mt-8 space-y-4 pb-12">
            <Link
              href="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange py-4 text-center text-sm font-bold uppercase tracking-widest text-black shadow-[0_4px_20px_rgba(30,90,255,0.3)]"
            >
              <UserPlus className="h-5 w-5" /> Crear cuenta
            </Link>
            <Link
              href="/login"
              className="glass flex w-full items-center justify-center gap-2 rounded-xl py-4 text-center text-sm font-bold uppercase tracking-widest text-white"
            >
              <LogIn className="h-5 w-5" /> Iniciar sesión
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — full viewport, centered, dark gym photo */}
      <section
        id="inicio"
        className="relative flex min-h-[100svh] items-center justify-center overflow-hidden"
      >
        <img
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 text-center sm:px-6">
          <span className="mb-6 block text-xs font-bold uppercase tracking-[0.3em] text-brand-orange sm:text-sm">
            CED·GYM · CHIHUAHUA
          </span>
          <h1 className="font-display text-5xl uppercase leading-[0.9] tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl">
            Entrena con método,
            <br />
            no con copia y pega
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg md:text-xl">
            Rutinas y planes alimenticios personalizados con IA, diseñados por el
            Coach Samuel Jeffery — tricampeón mundial de powerlifting.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Link
              href="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl !bg-[#FF6B00] px-8 py-4 text-center text-sm font-black uppercase tracking-widest text-white shadow-[0_10px_30px_rgba(255,107,0,0.35)] transition hover:-translate-y-0.5 hover:!bg-[#FF8A00] sm:w-auto"
            >
              <Flame className="h-5 w-5" /> Empieza hoy
            </Link>
            <a
              href="#planes"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white/20 sm:w-auto"
            >
              Ver planes
            </a>
          </div>
        </div>
      </section>

      {/* Nuestras Disciplinas — WHITE */}
      <section
        id="disciplinas"
        className="bg-white px-4 py-16 text-zinc-900 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="font-display text-4xl uppercase tracking-tight sm:text-5xl md:text-6xl">
              Nuestras Disciplinas
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-zinc-500 sm:text-lg">
              Rutinas adaptadas al deporte que practicas
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Fuerza',
                body: 'Hipertrofia, técnica, progresión por carga.',
                img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1000',
              },
              {
                title: 'HYROX',
                body: 'Condición física funcional para competir.',
                img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000',
              },
              {
                title: 'Powerlifting',
                body: 'SBD con programación científica.',
                img: 'https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?q=80&w=1000',
              },
              {
                title: 'Funcional',
                body: 'Movilidad, coordinación, cardio metabólico.',
                img: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?q=80&w=1000',
              },
            ].map((d) => (
              <div
                key={d.title}
                className="group relative aspect-[4/5] overflow-hidden rounded-2xl shadow-sm"
              >
                <img
                  src={d.img}
                  alt={d.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-display text-3xl uppercase tracking-tight text-white">
                    {d.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/85">{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rutinas adaptadas a ti — NAVY */}
      <section className="bg-brand-dark px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="font-display text-4xl uppercase tracking-tight text-white sm:text-5xl md:text-6xl">
              Rutinas adaptadas a ti
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
              Cada persona entrena diferente. Tu rutina lo sabe.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: 'Adultos',
                body: 'De 18 a 55 años. Hipertrofia, fuerza, pérdida de grasa con plan completo.',
              },
              {
                icon: UserCheck,
                title: 'Adultos Mayores',
                body: '55+ años. Baja carga, máquinas seguras, énfasis en movilidad.',
              },
              {
                icon: Baby,
                title: 'Niños y Juveniles',
                body: '6 a 17 años. Entrenamiento funcional, coordinación y peso corporal.',
              },
              {
                icon: Trophy,
                title: 'Deportistas',
                body: 'Fútbol americano, soccer, básquet, tenis. Programación específica por deporte.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-brand-orange/40 bg-brand-orange/10">
                  <Icon className="h-5 w-5 text-brand-orange" />
                </div>
                <h3 className="font-display text-2xl uppercase tracking-tight text-white">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IA en 30 segundos — WHITE */}
      <section className="bg-white px-4 py-16 text-zinc-900 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left */}
            <div>
              <span className="mb-3 block text-xs font-bold uppercase tracking-[0.3em] text-brand-orange">
                Tecnología · IA
              </span>
              <h2 className="font-display text-4xl uppercase leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
                Tu rutina personalizada en 30 segundos
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                Nos dices tu objetivo, nivel, días disponibles y equipo. Nuestra IA,
                entrenada con el método del Coach Samuel y 20+ años de experiencia,
                arma tu plan semanal completo.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  'Rutina por día con sets, repes y descansos',
                  'Videos de ejecución en cada ejercicio',
                  'Adapta por lesiones, edad y equipo disponible',
                  'Plan alimenticio con lista de compras incluido',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-zinc-700 sm:text-base">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-8 py-4 text-sm font-black uppercase tracking-widest text-white transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Crear mi rutina ahora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Right — mockup */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-dark via-[#0a1838] to-brand-orange/60 p-8 shadow-2xl">
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-orange/30 blur-3xl" />
                <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
                      Vista previa del portal
                    </span>
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                    <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">
                      Lunes · Empuje
                    </p>
                    <h4 className="mt-2 font-display text-2xl uppercase tracking-tight text-white">
                      Sesión de hoy
                    </h4>

                    <div className="mt-5 space-y-3">
                      {[
                        { name: 'Press banca', sets: '4 × 6', rest: '2:30' },
                        { name: 'Press inclinado mancuerna', sets: '3 × 10', rest: '1:30' },
                        { name: 'Fondos en paralelas', sets: '3 × 8', rest: '2:00' },
                        { name: 'Extensión tríceps cable', sets: '4 × 12', rest: '1:00' },
                      ].map((ex) => (
                        <div
                          key={ex.name}
                          className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">{ex.name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-white/50">
                              {ex.sets} · descanso {ex.rest}
                            </p>
                          </div>
                          <Check className="h-4 w-4 text-brand-orange" />
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
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

      {/* Fundador */}
      <FounderSection />

      {/* Instalaciones — NAVY, 3-column */}
      <section className="bg-brand-dark px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="font-display text-4xl uppercase tracking-tight text-white sm:text-5xl md:text-6xl">
              Instalaciones completas
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                title: 'Zona de máquinas',
                body: 'Pecho, pierna, espalda, hombro — cada grupo con máquina dedicada.',
                img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000',
              },
              {
                title: 'Área funcional',
                body: 'Llantas, marros, TRX, escaleras de agilidad y más.',
                img: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bcc?q=80&w=1000',
              },
              {
                title: 'Cardio completo',
                body: 'Bicicletas, remadoras, elípticas, esquís, caminadoras.',
                img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=1000',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={f.img}
                    alt={f.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 to-transparent" />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-2xl uppercase tracking-tight text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/70">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Membresías */}
      <section
        id="planes"
        className="overflow-hidden border-y border-white/5 bg-brand-gray py-10 sm:py-16"
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 text-center sm:mb-8">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
              Membresías
            </span>
            <h2 className="mb-3 px-2 font-display text-4xl uppercase tracking-tight sm:text-5xl md:text-6xl">
              Elige tu nivel
            </h2>
            <p className="mx-auto max-w-xl text-sm text-gray-400 sm:text-base">
              Todos los planes incluyen <strong className="text-white">acceso al gym con QR</strong>.
              Cancela cuando quieras.
            </p>
          </div>

          <div className="mb-6 flex justify-center sm:mb-8">
            <div className="glass inline-flex gap-1 rounded-full p-1">
              <button
                className="cycle-btn is-active rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition sm:px-5 sm:py-2 sm:text-xs"
                data-cycle="month"
              >
                Mensual
              </button>
              <button
                className="cycle-btn flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition sm:gap-2 sm:px-5 sm:py-2 sm:text-xs"
                data-cycle="q"
              >
                Trim.{' '}
                <span className="rounded bg-brand-orange/20 px-1 text-[9px] text-brand-orange sm:px-2 sm:py-0.5 sm:text-[10px]">
                  −10%
                </span>
              </button>
              <button
                className="cycle-btn flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition sm:gap-2 sm:px-5 sm:py-2 sm:text-xs"
                data-cycle="y"
              >
                Anual{' '}
                <span className="rounded bg-brand-orange/20 px-1 text-[9px] text-brand-orange sm:px-2 sm:py-0.5 sm:text-[10px]">
                  −20%
                </span>
              </button>
            </div>
          </div>

          <PlanCarousel>
            {/* Starter */}
            <div className="glass-card rounded-2xl p-4 sm:rounded-3xl sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 sm:h-12 sm:w-12">
                  <Zap className="h-4 w-4 text-brand-orange sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-black uppercase tracking-wide sm:text-2xl">
                    Starter
                  </h3>
                  <p className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-500 sm:text-xs">
                    Para empezar
                  </p>
                </div>
              </div>
              <div className="mb-4 border-b border-white/5 pb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black sm:text-4xl">
                    $
                    <span
                      className="plan-price"
                      data-month="690"
                      data-q="1864"
                      data-y="6624"
                    >
                      690
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 sm:text-sm">
                    MXN{' '}
                    <em className="cycle-label text-[10px] not-italic text-gray-500 sm:text-xs">
                      /mes
                    </em>
                  </span>
                </div>
              </div>
              <ul className="mb-5 space-y-2 text-xs sm:text-sm">
                {[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Sala general' },
                  { t: '3 clases grupales / semana' },
                  { t: 'Plan base de entrenamiento' },
                  { t: 'Panel del atleta + progreso' },
                ].map((f) => (
                  <li key={f.t} className={`flex items-start gap-2 ${f.hi ? 'font-semibold text-white' : 'text-gray-300'}`}>
                    {f.hi ? (
                      <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    ) : (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    )}
                    <span>{f.t}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register?redirect=/checkout/starter&product=starter&type=membership"
                className="block w-full rounded-xl !bg-[#FF6B00] py-3 text-center text-xs font-black uppercase tracking-widest text-white transition hover:!bg-[#FF8A00]"
              >
                Elegir Starter
              </Link>
            </div>

            {/* Pro */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-orange-2 via-brand-orange to-brand-orange-3 p-[1px] sm:rounded-3xl">
              <div className="absolute right-4 top-0 z-10 rounded-b-lg bg-brand-orange px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-black sm:right-6 sm:px-3 sm:py-1 sm:text-[10px]">
                Más popular
              </div>
              <div className="rounded-2xl bg-brand-gray p-4 sm:rounded-3xl sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange sm:h-12 sm:w-12">
                    <Flame className="h-4 w-4 text-black sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-black uppercase tracking-wide sm:text-2xl">
                      Pro
                    </h3>
                    <p className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-500 sm:text-xs">
                      Atleta regular
                    </p>
                  </div>
                </div>
                <div className="mb-4 border-b border-white/5 pb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-gradient text-3xl font-black sm:text-4xl">
                      $
                      <span
                        className="plan-price"
                        data-month="1290"
                        data-q="3483"
                        data-y="12384"
                      >
                        1,290
                      </span>
                    </span>
                    <span className="text-xs text-gray-400 sm:text-sm">
                      MXN{' '}
                      <em className="cycle-label text-[10px] not-italic text-gray-500 sm:text-xs">
                        /mes
                      </em>
                    </span>
                  </div>
                </div>
                <ul className="mb-5 space-y-2 text-xs sm:text-sm">
                  {[
                    { t: 'Acceso al gym con QR', hi: true },
                    { t: 'Acceso ilimitado 6 días' },
                    { t: 'Clases grupales sin límite' },
                    { t: 'Plan personalizado por coach' },
                    { t: '1 curso incluido / trimestre' },
                  ].map((f) => (
                    <li key={f.t} className={`flex items-start gap-2 ${f.hi ? 'font-semibold text-white' : 'text-gray-300'}`}>
                      {f.hi ? (
                        <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                      )}
                      <span>{f.t}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register?redirect=/checkout/pro&product=pro&type=membership"
                  className="block w-full rounded-xl !bg-[#FF6B00] py-3 text-center text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_30px_rgba(255,107,0,0.35)] transition hover:!bg-[#FF8A00]"
                >
                  Elegir Pro
                </Link>
              </div>
            </div>

            {/* Élite */}
            <div className="glass-card rounded-2xl p-4 sm:rounded-3xl sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 sm:h-12 sm:w-12">
                  <Crown className="h-4 w-4 text-brand-orange sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-black uppercase tracking-wide sm:text-2xl">
                    Élite
                  </h3>
                  <p className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-500 sm:text-xs">
                    Preparación deportiva
                  </p>
                </div>
              </div>
              <div className="mb-4 border-b border-white/5 pb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black sm:text-4xl">
                    $
                    <span
                      className="plan-price"
                      data-month="2290"
                      data-q="6183"
                      data-y="21984"
                    >
                      2,290
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 sm:text-sm">
                    MXN{' '}
                    <em className="cycle-label text-[10px] not-italic text-gray-500 sm:text-xs">
                      /mes
                    </em>
                  </span>
                </div>
              </div>
              <ul className="mb-5 space-y-2 text-xs sm:text-sm">
                {[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Programa individualizado' },
                  { t: 'Prep física por deporte' },
                  { t: '2 sesiones 1:1 / semana' },
                  { t: 'Nutrición + análisis de video' },
                ].map((f) => (
                  <li key={f.t} className={`flex items-start gap-2 ${f.hi ? 'font-semibold text-white' : 'text-gray-300'}`}>
                    {f.hi ? (
                      <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    ) : (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    )}
                    <span>{f.t}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register?redirect=/checkout/elite&product=elite&type=membership"
                className="block w-full rounded-xl !bg-[#FF6B00] py-3 text-center text-xs font-black uppercase tracking-widest text-white transition hover:!bg-[#FF8A00]"
              >
                Elegir Élite
              </Link>
            </div>
          </PlanCarousel>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500 sm:mt-8 sm:text-xs">
            <ShieldCheck className="h-3 w-3 text-brand-orange sm:h-4 sm:w-4" />
            Pagos seguros · Mercado Pago · Cancela cuando quieras
          </p>
        </div>
      </section>

      {/* Marketplace Destacados */}
      <FeaturedProducts />

      {/* Ubicación */}
      <section
        id="ubicacion"
        className="relative overflow-hidden px-4 py-10 sm:py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 lg:order-1">
              <span className="mb-2 block text-center text-[10px] font-bold uppercase tracking-widest text-brand-orange sm:text-sm lg:text-left">
                Contacto directo
              </span>
              <h2 className="mb-8 text-center font-display text-4xl uppercase tracking-tight text-white sm:mb-10 sm:text-5xl md:text-6xl lg:text-left">
                Visita nuestras instalaciones
              </h2>

              <div className="mx-auto mb-10 max-w-md space-y-4 rounded-3xl border border-white/5 bg-brand-dark p-6 sm:space-y-6 sm:p-8 lg:max-w-none">
                <div className="group flex cursor-pointer items-start">
                  <div className="mr-4 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 transition group-hover:bg-brand-orange sm:mr-6 sm:mt-0 sm:h-12 sm:w-12">
                    <MapPin className="h-5 w-5 text-brand-orange transition group-hover:text-black sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="mb-1 text-lg font-bold uppercase tracking-wide text-white sm:text-xl">
                      Av. Tecnológico, Santo Niño
                    </p>
                    <p className="text-xs text-gray-400 sm:text-sm">
                      Deportiva, Chihuahua, México.
                    </p>
                  </div>
                </div>

                <div className="h-px w-full bg-white/5" />

                <a
                  href="https://wa.me/526141970660"
                  className="group flex items-center"
                >
                  <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10 transition group-hover:bg-green-500 sm:mr-6 sm:h-12 sm:w-12">
                    <Phone className="h-5 w-5 text-green-500 transition group-hover:text-white sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                      WhatsApp
                    </p>
                    <p className="text-lg font-medium text-white transition group-hover:text-green-400 sm:text-xl">
                      614 197 0660
                    </p>
                  </div>
                </a>

                <div className="h-px w-full bg-white/5" />

                <a
                  href="https://instagram.com/ced.gym.chih"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center"
                >
                  <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 transition sm:mr-6 sm:h-12 sm:w-12">
                    <Instagram className="h-5 w-5 text-pink-500 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                      Síguenos
                    </p>
                    <p className="text-lg font-medium text-white transition group-hover:text-pink-400 sm:text-xl">
                      @ced.gym.chih
                    </p>
                  </div>
                </a>

                <div className="h-px w-full bg-white/5" />

                <div className="flex items-start">
                  <div className="mr-4 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 sm:mr-6 sm:mt-0 sm:h-12 sm:w-12">
                    <Clock className="h-5 w-5 text-brand-orange sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                      Horario
                    </p>
                    <p className="text-base font-medium text-white sm:text-lg">
                      Lun — Vie · 7:00 — 21:00
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="group relative order-1 h-[350px] w-full overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl sm:h-[450px] lg:order-2 lg:h-[600px]">
              <iframe
                src="https://www.google.com/maps?q=CED+Gym+Av.+Tecnologico+Santo+Nino+Chihuahua&output=embed&z=16"
                width="100%"
                height="100%"
                style={{
                  border: 0,
                  filter: 'grayscale(100%) invert(90%) contrast(1.2)',
                }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 z-0 transition duration-700 lg:group-hover:filter-none"
              />
              <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between rounded-2xl border border-white/10 bg-brand-dark/95 p-4 backdrop-blur-md sm:bottom-6 sm:left-6 sm:right-6 sm:p-6">
                <div>
                  <p className="text-base font-black uppercase text-white sm:text-xl">
                    CED·GYM
                  </p>
                  <p className="text-xs font-bold text-brand-orange sm:text-sm">
                    Fábrica de Monstruos · Chihuahua
                  </p>
                </div>
                <a
                  href="https://maps.app.goo.gl/hjCPfR18PnDXEFqr7"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-brand-orange sm:h-12 sm:w-12"
                >
                  <Navigation className="h-4 w-4 sm:h-5 sm:w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-brand-dark pb-8 pt-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 grid grid-cols-1 gap-10 text-center md:grid-cols-2 md:gap-12 md:text-left lg:grid-cols-4">
            <div className="flex flex-col items-center md:items-start lg:col-span-2">
              <Link
                href="#inicio"
                className="group relative mb-6 inline-flex items-center gap-3"
              >
                <img
                  src="/logo.png"
                  alt="CED·GYM"
                  className="h-14 w-14 rounded-full"
                />
                <span className="logo-font inline-flex flex-col leading-none text-2xl tracking-tight sm:text-3xl">
                  <span>
                    <span className="text-brand-orange">CED</span>
                    <span className="text-white">·GYM</span>
                  </span>
                  <span className="text-[0.4em] font-bold uppercase tracking-[0.3em] text-white/50">
                    Fábrica de monstruos
                  </span>
                </span>
              </Link>
              <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-gray-400 sm:text-base md:mx-0">
                Plataforma de preparación física para atletas. Forjando monstruos con
                disciplina, comunidad y datos reales.
              </p>
              <div className="flex justify-center space-x-4 md:justify-start">
                <a
                  href="https://instagram.com/ced.gym.chih"
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#E4405F]"
                >
                  <Instagram className="h-5 w-5" />
                </a>
                <a
                  href="https://wa.me/526141970660"
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#25D366]"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
                <a
                  href="tel:+526141970660"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-brand-orange hover:text-black"
                >
                  <Phone className="h-5 w-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-5 text-xs font-black uppercase tracking-widest text-white sm:mb-6 sm:text-sm">
                Plataforma
              </h4>
              <ul className="space-y-3 text-sm sm:space-y-4 sm:text-base">
                <li>
                  <a
                    href="#disciplinas"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Deportes
                  </a>
                </li>
                <li>
                  <a
                    href="#planes"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Membresías
                  </a>
                </li>
                <li>
                  <Link
                    href="/tienda"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Tienda
                  </Link>
                </li>
                <li>
                  <a
                    href="#app"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Panel del atleta
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-5 text-xs font-black uppercase tracking-widest text-white sm:mb-6 sm:text-sm">
                Cuenta
              </h4>
              <ul className="space-y-3 text-sm sm:space-y-4 sm:text-base">
                <li>
                  <Link
                    href="/login"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Iniciar sesión
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Crear cuenta
                  </Link>
                </li>
                <li>
                  <a
                    href="#inscripcion"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Inscripción
                  </a>
                </li>
                <li>
                  <a
                    href="#ubicacion"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Contacto
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center md:flex-row md:text-left">
            <p className="text-xs font-medium text-gray-500 sm:text-sm">
              © {new Date().getFullYear()} CED·GYM. Todos los derechos reservados.
            </p>
            <p className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 sm:text-xs">
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
    </>
  );
}
