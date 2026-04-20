import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  Baby,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  CreditCard,
  Crown,
  Dribbble,
  Dumbbell,
  FileCheck,
  Flame,
  Gamepad2,
  Instagram,
  LayoutDashboard,
  Lock,
  LogIn,
  MapPin,
  Medal,
  Menu,
  MessageCircle,
  MessageSquare,
  Navigation,
  Phone,
  QrCode,
  Shield,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { FeaturedProducts } from '@/components/home/featured-products';
import { FounderSection } from '@/components/home/founder-section';
import { InteractivityClient } from '@/components/home/InteractivityClient';

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
                className="h-10 w-10 rounded-full ring-1 ring-white/10"
              />
              <span className="logo-font hidden text-xl font-black leading-none tracking-tight sm:inline-block md:text-2xl">
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
              <a href="#insignia" className="transition-colors hover:text-brand-orange">
                Football
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
                className="group relative overflow-hidden rounded-full bg-brand-orange px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_20px_rgba(255,107,26,0.3)] transition-all hover:shadow-[0_0_30px_rgba(255,107,26,0.5)]"
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
              href="#insignia"
              className="mobile-link border-b border-white/10 pb-4 text-white transition hover:text-brand-orange"
            >
              Football Élite
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange py-4 text-center text-sm font-bold uppercase tracking-widest text-black shadow-[0_4px_20px_rgba(255,107,26,0.3)]"
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

      {/* Hero */}
      <section
        id="inicio"
        className="hero-bg relative flex min-h-[100svh] items-center justify-center pb-16 pt-20"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
        <div className="relative z-10 mx-auto mt-8 w-full max-w-7xl px-4 text-center sm:px-6 md:mt-0 md:text-left lg:pl-8">
          <div className="mx-auto max-w-3xl md:mx-0">
            <div className="glass mb-6 inline-flex w-auto items-center justify-center gap-2 rounded-full border-brand-orange/30 px-4 py-2 md:justify-start">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-orange" />
              <span className="text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
                Chihuahua · Desde 2016
              </span>
            </div>

            <h1 className="mb-4 text-5xl font-black uppercase leading-[1.05] tracking-tight sm:mb-6 sm:text-6xl md:text-7xl lg:text-8xl">
              Preparación
              <br className="hidden sm:block" />
              física para <br className="hidden sm:block" />
              <span className="rotator text-gradient leading-tight">
                <em className="is-active">todos los deportes.</em>
                <em>fútbol americano.</em>
                <em>fútbol soccer.</em>
                <em>básquetbol.</em>
                <em>tenis.</em>
                <em>beisbol.</em>
                <em>MMA.</em>
                <em>powerlifting.</em>
                <em>HYROX.</em>
              </span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl px-4 text-base font-light leading-relaxed text-gray-300 sm:mb-10 sm:text-lg md:mx-0 md:px-0 md:text-xl">
              Más que un gimnasio, un{' '}
              <strong className="text-white">ecosistema para atletas</strong>.
              Inscríbete, toma cursos, paga tu membresía y lleva tu progreso — todo
              en un solo lugar.
            </p>

            <div className="flex flex-col justify-center gap-4 px-4 sm:flex-row sm:gap-5 md:justify-start md:px-0">
              <Link
                href="/register"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-8 py-4 text-center text-sm font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(255,107,26,0.3)] transition hover:-translate-y-1 hover:bg-brand-orange-2 sm:w-auto"
              >
                <Flame className="h-5 w-5" /> Inscríbete hoy
              </Link>
              <a
                href="#planes"
                className="glass group flex w-full items-center justify-center gap-3 rounded-xl px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-white/10 sm:w-auto"
              >
                Ver planes
                <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-1" />
              </a>
            </div>

            <div className="mx-auto mt-12 grid max-w-md grid-cols-3 gap-6 md:mx-0 md:max-w-lg">
              <div className="text-center md:text-left">
                <p className="text-3xl font-black text-white sm:text-4xl">+500</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                  Atletas activos
                </p>
              </div>
              <div className="text-center md:text-left">
                <p className="text-3xl font-black text-white sm:text-4xl">10</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                  Años formando
                </p>
              </div>
              <div className="text-center md:text-left">
                <p className="text-3xl font-black text-white sm:text-4xl">12+</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-xs">
                  Deportes
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 transform animate-bounce flex-col items-center md:flex">
          <span className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            Explorar
          </span>
          <ChevronDown className="text-brand-orange" />
        </div>
      </section>

      {/* Marquee */}
      <section className="relative z-20 overflow-hidden bg-brand-orange py-6 sm:py-8">
        <div className="group flex items-center overflow-hidden whitespace-nowrap">
          <div className="marquee-track flex items-center text-lg font-black uppercase tracking-widest text-black sm:text-xl md:text-2xl">
            {Array.from({ length: 2 }).map((_, r) => (
              <span key={r} className="flex items-center">
                <span className="mx-4 sm:mx-8">•</span> FÁBRICA DE MONSTRUOS
                <span className="mx-4 sm:mx-8">•</span> PREP FÍSICA DE ÉLITE
                <span className="mx-4 sm:mx-8">•</span> COACHES CERTIFICADOS
                <span className="mx-4 sm:mx-8">•</span> ACADEMIA ONLINE
                <span className="mx-4 sm:mx-8">•</span> COMUNIDAD REAL
                <span className="mx-4 sm:mx-8">•</span> PAGO CON MERCADO PAGO
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Deportes */}
      <section
        id="disciplinas"
        className="relative overflow-hidden px-4 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-20">
            <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
              La plataforma
            </span>
            <h2 className="mb-4 px-2 text-3xl font-black uppercase sm:text-4xl md:text-5xl">
              Preparamos al atleta <br className="sm:hidden" />
              <span className="text-gradient">por deporte</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base font-light text-gray-400 sm:text-lg">
              Cada disciplina tiene demandas únicas. Entrenamos específico por deporte
              y por posición.
            </p>
            <div className="mx-auto mt-8 h-1.5 w-20 rounded-full bg-brand-orange sm:w-24" />
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Shield,
                title: 'Fútbol Americano',
                body: 'Fuerza, potencia, velocidad y resistencia HYROX. Programa insignia de la casa.',
              },
              {
                icon: CircleDot,
                title: 'Fútbol Soccer',
                body: 'Explosividad, cambio de dirección, core y prevención de lesiones por posición.',
              },
              {
                icon: Dribbble,
                title: 'Básquetbol',
                body: 'Salto vertical, aceleración y control bajo fatiga durante 4 cuartos.',
              },
              {
                icon: Gamepad2,
                title: 'Tenis / Pádel',
                body: 'Rotación, hombro sano, reacción y consistencia de fuerza en set largo.',
              },
              {
                icon: Dumbbell,
                title: 'Powerlifting',
                body: 'Sentadilla, press banca, peso muerto. Programación basada en ciencia.',
              },
              {
                icon: Baby,
                title: 'Escuela Kids',
                body: 'Coordinación y bases deportivas para 6–13 años con maestros certificados.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="glass-card group relative z-10 rounded-3xl p-6 sm:p-10"
              >
                <div className="relative mb-6 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-brand-gray transition group-hover:border-brand-orange/50 sm:mb-8 sm:h-16 sm:w-16">
                  <div className="absolute inset-0 translate-y-full bg-brand-orange/20 transition-transform duration-300 ease-out group-hover:translate-y-0" />
                  <Icon className="relative z-10 h-7 w-7 text-white transition-colors group-hover:text-brand-orange sm:h-8 sm:w-8" />
                </div>
                <h3 className="mb-3 text-xl font-black uppercase tracking-wide sm:mb-4 sm:text-2xl">
                  {title}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-gray-400 sm:text-base">
                  {body}
                </p>
                <Link
                  href="/register"
                  className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-brand-orange transition hover:text-white sm:text-sm"
                >
                  Inscribirme <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosistema */}
      <section
        id="ecosistema"
        className="overflow-hidden border-y border-white/5 bg-brand-gray py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-12">
            <div className="order-2 grid w-full grid-cols-2 gap-3 sm:gap-4 lg:order-1 lg:w-1/2">
              {[
                { icon: UserPlus, title: 'Cuenta', sub: 'Tu perfil de atleta' },
                {
                  icon: BookOpen,
                  title: 'Cursos',
                  sub: 'Academia online',
                  up: true,
                },
                { icon: CreditCard, title: 'Mercado Pago', sub: 'Pago seguro' },
                {
                  icon: LayoutDashboard,
                  title: 'Panel',
                  sub: 'Tu progreso',
                  up: true,
                  highlight: true,
                },
              ].map(({ icon: Icon, title, sub, up, highlight }) => (
                <div
                  key={title}
                  className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-4 text-center transition hover:scale-105 sm:p-6 ${
                    up ? 'sm:translate-y-4' : ''
                  } ${
                    highlight
                      ? 'border-brand-orange/30 bg-brand-dark'
                      : 'border-white/5 bg-brand-dark'
                  }`}
                >
                  {highlight && (
                    <div className="absolute inset-0 bg-brand-orange/10 transition group-hover:bg-brand-orange/20" />
                  )}
                  <div
                    className={`relative z-10 mb-2 flex h-10 w-10 items-center justify-center rounded-full sm:mb-3 sm:h-12 sm:w-12 ${
                      highlight
                        ? 'bg-brand-orange text-black'
                        : 'border border-brand-orange text-brand-orange'
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <h4
                    className={`relative z-10 mb-1 text-xs font-black uppercase sm:text-sm ${
                      highlight ? 'text-brand-orange' : ''
                    }`}
                  >
                    {title}
                  </h4>
                  <p className="relative z-10 text-[10px] uppercase text-gray-500 sm:text-xs">
                    {sub}
                  </p>
                </div>
              ))}
            </div>

            <div className="order-1 w-full text-center lg:order-2 lg:w-1/2 lg:pl-10 lg:text-left">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
                Más que entrenar
              </span>
              <h2 className="mb-4 text-3xl font-black uppercase leading-tight sm:mb-6 sm:text-4xl md:text-5xl">
                El ecosistema <br className="hidden sm:block" />
                <span className="text-gradient">CED·GYM</span>
              </h2>
              <p className="mb-6 px-2 text-base leading-relaxed text-gray-400 sm:mb-8 md:text-lg lg:px-0">
                Cuenta, cursos, membresías, pagos y panel — todo conectado en una sola
                plataforma. Como las grandes, pero para el atleta real.
              </p>
              <ul className="mx-auto mb-8 max-w-md space-y-3 text-left sm:space-y-4 lg:mx-0">
                {[
                  'Inscripción en minutos, acceso inmediato',
                  'Seguimiento de PRs, asistencia y carga semanal',
                  'Cobros seguros con Mercado Pago y factura automática',
                  'Cursos incluidos o comprados por separado',
                ].map((t) => (
                  <li
                    key={t}
                    className="flex items-start text-sm font-medium text-gray-300 sm:items-center sm:text-base"
                  >
                    <div className="mr-3 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/20 sm:mr-4 sm:mt-0">
                      <Check className="h-3 w-3 text-brand-orange sm:h-4 sm:w-4" />
                    </div>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-orange px-8 py-4 text-xs font-black uppercase tracking-widest text-black transition hover:scale-105 sm:text-sm"
              >
                Crear cuenta gratis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Football Élite */}
      <section
        id="insignia"
        className="insignia-bg relative overflow-hidden py-16 sm:py-24"
      >
        <div className="absolute inset-0 bg-black/70 md:bg-black/60" />
        <div className="relative z-10 mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center gap-10 overflow-hidden rounded-3xl border border-white/10 bg-brand-dark/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8 md:gap-12 md:rounded-[2.5rem] md:bg-brand-dark/80 md:p-16 lg:flex-row">
            <div className="order-2 w-full text-center lg:order-1 lg:w-3/5 lg:text-left">
              <div className="mb-4 flex items-center justify-center space-x-3 sm:mb-6 lg:justify-start">
                <div className="inline-block rounded-sm border-l-4 border-brand-orange bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">
                  PROGRAMA INSIGNIA
                </div>
              </div>
              <h2 className="mb-4 text-3xl font-black uppercase leading-[1.05] text-white sm:mb-6 sm:text-4xl md:text-5xl lg:text-6xl">
                Prep Física para <br />
                <span className="bg-gradient-to-r from-brand-orange-2 to-brand-orange bg-clip-text text-transparent">
                  Football
                </span>
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-gray-300 sm:text-base md:text-lg lg:mx-0">
                Programa insignia de la casa. Fuerza, potencia, velocidad, resistencia
                y agilidad en un solo sistema diseñado para jugadores de{' '}
                <strong className="text-white">fútbol americano</strong>.
              </p>

              <div className="mb-8 grid grid-cols-1 gap-4 text-left sm:mb-10 sm:grid-cols-2 sm:gap-6">
                {[
                  {
                    icon: Zap,
                    title: 'Fuerza + Velocidad',
                    body: 'Potencia real para el contacto y el sprint.',
                  },
                  {
                    icon: Medal,
                    title: 'Coach Nayo',
                    body: '+10 años preparando atletas de football.',
                  },
                  {
                    icon: Timer,
                    title: 'HYROX',
                    body: 'Para aguantar 4 cuartos al mismo nivel.',
                  },
                  {
                    icon: Users,
                    title: 'Por posición',
                    body: 'QB, RB, WR, OL, DL — prep específica.',
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div
                    key={title}
                    className="glass flex items-center gap-4 rounded-xl p-4 sm:block sm:gap-0 sm:p-5"
                  >
                    <Icon className="h-8 w-8 shrink-0 text-brand-orange sm:mb-2" />
                    <div>
                      <h4 className="text-xs font-bold uppercase text-white sm:text-sm">
                        {title}
                      </h4>
                      <p className="mt-1 text-[11px] text-gray-400 sm:text-xs">
                        {body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-orange px-6 py-4 text-xs font-black uppercase tracking-widest text-black transition hover:scale-105 sm:w-auto sm:rounded-full sm:px-10 sm:py-5 sm:text-sm"
              >
                Inscribirme al programa{' '}
                <ChevronRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </div>

            <div className="relative order-1 mb-6 flex w-full justify-center lg:order-2 lg:mb-0 lg:w-2/5">
              <div className="absolute inset-0 animate-pulse rounded-full bg-brand-orange/20 blur-[40px] md:blur-[60px]" />
              <div className="relative h-48 w-48 overflow-hidden rounded-full border-[6px] border-brand-dark shadow-[0_0_30px_rgba(255,107,26,0.3)] sm:h-64 sm:w-64 md:h-80 md:w-80 md:border-[10px] lg:h-96 lg:w-96">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=2071&auto=format&fit=crop"
                  alt="Football training"
                  className="h-full w-full object-cover grayscale transition duration-700 hover:grayscale-0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fundador */}
      <FounderSection />

      {/* Cursos / Academia */}
      <section id="cursos" className="relative overflow-hidden px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-20">
            <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
              Academia
            </span>
            <h2 className="mb-4 px-2 text-3xl font-black uppercase sm:text-4xl md:text-5xl">
              Cursos con <br className="sm:hidden" />
              <span className="text-gradient">entrenadores reales</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base font-light text-gray-400 sm:text-lg">
              Compra cursos individuales o inclúyelos en tu membresía. Acceso inmediato
              desde tu panel.
            </p>
            <div className="mx-auto mt-8 h-1.5 w-20 rounded-full bg-brand-orange sm:w-24" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                id: 'course-preseason',
                title: 'Pretemporada Football',
                body: 'Fuerza, potencia y condición para llegar al campo al 100%.',
                level: 'Intermedio',
                duration: '8 semanas',
                price: 2490,
                unit: 'MXN',
                bg: 'radial-gradient(circle at 30% 40%, rgba(255,107,26,.5), transparent 55%), linear-gradient(135deg, #2a1004, #0a0503)',
              },
              {
                id: 'course-pl12',
                title: 'Powerlifting 12W',
                body: 'Programa SBD basado en ciencia con revisión por video semanal.',
                level: 'Avanzado',
                duration: '12 semanas',
                price: 3190,
                unit: 'MXN',
                bg: 'radial-gradient(circle at 70% 30%, rgba(255,138,61,.45), transparent 55%), linear-gradient(135deg, #1a0f04, #0a0502)',
              },
              {
                id: 'course-nutri',
                title: 'Nutrición Deportiva',
                body: 'Plan alimenticio por objetivo con seguimiento semanal.',
                level: 'Online',
                duration: '6 lecciones',
                price: 1290,
                unit: 'MXN',
                bg: 'radial-gradient(circle at 40% 60%, rgba(255,107,26,.4), transparent 55%), linear-gradient(135deg, #200c04, #0a0402)',
              },
              {
                id: 'course-kids',
                title: 'Escuela Infantil',
                body: 'Lun–Vie PM · grupos por edad · maestros certificados.',
                level: 'Kids',
                duration: 'Mensual',
                price: 890,
                unit: '/mes',
                bg: 'radial-gradient(circle at 60% 40%, rgba(255,176,116,.5), transparent 55%), linear-gradient(135deg, #2a1a04, #0a0604)',
              },
            ].map((c) => (
              <div
                key={c.id}
                className="glass-card group overflow-hidden rounded-3xl"
              >
                <div
                  className="relative h-40 overflow-hidden"
                  style={{ background: c.bg }}
                >
                  <div className="absolute left-4 top-4 flex gap-2">
                    <span className="rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur">
                      {c.level}
                    </span>
                  </div>
                  <div className="absolute right-4 top-4">
                    <span className="rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur">
                      {c.duration}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="mb-2 text-lg font-black uppercase tracking-wide">
                    {c.title}
                  </h3>
                  <p className="mb-4 text-sm leading-relaxed text-gray-400">
                    {c.body}
                  </p>
                  <div className="flex items-end justify-between border-t border-white/5 pt-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Desde
                      </p>
                      <p className="text-2xl font-black">
                        ${c.price.toLocaleString('es-MX')}{' '}
                        <span className="text-xs font-normal text-gray-400">
                          {c.unit}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/register?redirect=/checkout/${c.id}&product=${c.id}`}
                      className="rounded-lg bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:bg-brand-orange-2"
                    >
                      Inscribirme
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Membresías */}
      <section
        id="planes"
        className="overflow-hidden border-y border-white/5 bg-brand-gray py-16 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
              Membresías
            </span>
            <h2 className="mb-4 px-2 text-3xl font-black uppercase sm:text-4xl md:text-5xl">
              Elige tu <span className="text-gradient">nivel</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base font-light text-gray-400 sm:text-lg">
              Mensual, trimestral o anual. Cancela cuando quieras. Cobros seguros con
              Mercado Pago.
            </p>
            <div className="mx-auto mt-8 h-1.5 w-20 rounded-full bg-brand-orange sm:w-24" />
          </div>

          <div className="mb-12 flex justify-center">
            <div className="glass inline-flex gap-1 rounded-full p-1.5">
              <button
                className="cycle-btn is-active rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest transition"
                data-cycle="month"
              >
                Mensual
              </button>
              <button
                className="cycle-btn flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest transition"
                data-cycle="q"
              >
                Trimestral{' '}
                <span className="rounded bg-brand-orange/20 px-2 py-0.5 text-[10px] text-brand-orange">
                  −10%
                </span>
              </button>
              <button
                className="cycle-btn flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest transition"
                data-cycle="y"
              >
                Anual{' '}
                <span className="rounded bg-brand-orange/20 px-2 py-0.5 text-[10px] text-brand-orange">
                  −20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Starter */}
            <div className="glass-card rounded-3xl p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10">
                  <Zap className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-wide">
                    Starter
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Para empezar
                  </p>
                </div>
              </div>
              <div className="mb-6 border-b border-white/5 pb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black">
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
                  <span className="text-sm text-gray-400">
                    MXN{' '}
                    <em className="cycle-label text-xs not-italic text-gray-500">
                      /mes
                    </em>
                  </span>
                </div>
              </div>
              <ul className="mb-8 space-y-3 text-sm">
                {[
                  'Acceso a sala general',
                  '3 clases grupales / semana',
                  'Plan base de entrenamiento',
                  'Acceso al panel del atleta',
                ].map((f) => (
                  <li key={f} className="flex gap-3 text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />{' '}
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register?redirect=/checkout/starter&product=starter&type=membership"
                className="glass block w-full rounded-xl py-4 text-center text-xs font-black uppercase tracking-widest text-white transition hover:bg-white/10"
              >
                Elegir Starter
              </Link>
            </div>

            {/* Pro */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-orange-2 via-brand-orange to-brand-orange-3 p-[1px]">
              <div className="absolute right-8 top-0 rounded-b-lg bg-brand-orange px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">
                Más popular
              </div>
              <div className="rounded-3xl bg-brand-gray p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange">
                    <Flame className="h-5 w-5 text-black" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-wide">
                      Pro
                    </h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Atleta regular
                    </p>
                  </div>
                </div>
                <div className="mb-6 border-b border-white/5 pb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-gradient text-5xl font-black">
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
                    <span className="text-sm text-gray-400">
                      MXN{' '}
                      <em className="cycle-label text-xs not-italic text-gray-500">
                        /mes
                      </em>
                    </span>
                  </div>
                </div>
                <ul className="mb-8 space-y-3 text-sm">
                  {[
                    'Acceso ilimitado 6 días',
                    'Clases grupales sin límite',
                    'Plan personalizado por coach',
                    '1 curso incluido / trimestre',
                    'Check-in QR · Factura',
                  ].map((f) => (
                    <li key={f} className="flex gap-3 text-gray-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />{' '}
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register?redirect=/checkout/pro&product=pro&type=membership"
                  className="block w-full rounded-xl bg-brand-orange py-4 text-center text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(255,107,26,0.3)] transition hover:bg-brand-orange-2"
                >
                  Elegir Pro
                </Link>
              </div>
            </div>

            {/* Élite */}
            <div className="glass-card rounded-3xl p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10">
                  <Crown className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-wide">
                    Élite
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Preparación deportiva
                  </p>
                </div>
              </div>
              <div className="mb-6 border-b border-white/5 pb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black">
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
                  <span className="text-sm text-gray-400">
                    MXN{' '}
                    <em className="cycle-label text-xs not-italic text-gray-500">
                      /mes
                    </em>
                  </span>
                </div>
              </div>
              <ul className="mb-8 space-y-3 text-sm">
                {[
                  'Programa individualizado',
                  'Prep física por deporte',
                  '2 sesiones 1:1 / semana',
                  'Nutrición incluida',
                  'Análisis de video + PRs',
                ].map((f) => (
                  <li key={f} className="flex gap-3 text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />{' '}
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register?redirect=/checkout/elite&product=elite&type=membership"
                className="glass block w-full rounded-xl py-4 text-center text-xs font-black uppercase tracking-widest text-white transition hover:bg-white/10"
              >
                Elegir Élite
              </Link>
            </div>
          </div>

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-widest text-gray-500">
            <ShieldCheck className="h-4 w-4 text-brand-orange" />
            Cobros seguros con Mercado Pago · Cancela cuando quieras
          </p>
        </div>
      </section>

      {/* Marketplace Destacados */}
      <FeaturedProducts />

      {/* Inscripción */}
      <section id="inscripcion" className="overflow-hidden px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div>
              <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
                Inscripción
              </span>
              <h2 className="mb-6 text-3xl font-black uppercase leading-tight sm:text-4xl md:text-5xl">
                Inscríbete en <br />
                <span className="text-gradient">3 pasos</span>
              </h2>
              <p className="mb-10 max-w-lg text-base font-light leading-relaxed text-gray-400 md:text-lg">
                Crea tu cuenta, elige tu plan y paga seguro con Mercado Pago. Listo
                para entrenar hoy mismo.
              </p>

              <div className="mb-10 space-y-6">
                {[
                  {
                    n: '01',
                    t: 'Crea tu cuenta',
                    b: 'Email, nombre, deporte. 20 segundos.',
                  },
                  {
                    n: '02',
                    t: 'Elige plan o curso',
                    b: 'Starter, Pro, Élite o cursos individuales.',
                  },
                  {
                    n: '03',
                    t: 'Paga con Mercado Pago',
                    b: 'Tarjeta, OXXO, SPEI o saldo MP. Factura al momento.',
                  },
                ].map((s, i) => (
                  <div
                    key={s.n}
                    className={`flex gap-5 ${i < 2 ? 'border-b border-white/5 pb-6' : ''}`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-lg font-black text-brand-orange">
                      {s.n}
                    </div>
                    <div>
                      <h4 className="mb-1 text-base font-black uppercase tracking-wide">
                        {s.t}
                      </h4>
                      <p className="text-sm text-gray-400">{s.b}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-8 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <ShieldCheck className="h-4 w-4 text-brand-orange" /> SSL · 3D
                  Secure
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <FileCheck className="h-4 w-4 text-brand-orange" /> Factura
                  electrónica
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <MessageCircle className="h-4 w-4 text-brand-orange" /> Soporte
                  WhatsApp
                </div>
              </div>

              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-8 py-4 text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(255,107,26,0.3)] transition hover:scale-105 sm:text-sm"
              >
                Comenzar ahora <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Phone mockup */}
            <div className="flex justify-center">
              <div className="phone-frame">
                <div className="phone-screen">
                  <div className="flex h-full flex-col gap-3 p-4 pt-14">
                    <div className="flex items-center justify-between pb-2 text-xs text-gray-400">
                      <span>←</span>
                      <span className="font-bold text-white">Pago</span>
                      <span>
                        <Lock className="inline h-3.5 w-3.5" />
                      </span>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-brand-orange/40 bg-gradient-to-br from-brand-orange/20 to-brand-orange/5 p-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold uppercase tracking-widest text-gray-400">
                          Plan
                        </span>
                        <b className="text-white">Pro · Mensual</b>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold uppercase tracking-widest text-gray-400">
                          Renovación
                        </span>
                        <b className="text-white">15 may 2026</b>
                      </div>
                      <div className="flex items-baseline justify-between border-t border-brand-orange/20 pt-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Total hoy
                        </span>
                        <b className="text-3xl font-black text-white">
                          $1,290{' '}
                          <em className="text-xs font-normal not-italic text-gray-400">
                            MXN
                          </em>
                        </b>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Método de pago
                      </p>
                      <div className="flex items-center gap-3 rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-3">
                        <div className="mp-badge shrink-0">
                          <span>mercado</span>
                          <b>pago</b>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">Mercado Pago</p>
                          <p className="text-[10px] text-gray-400">
                            Tarjeta · OXXO · SPEI
                          </p>
                        </div>
                        <div className="h-4 w-4 shrink-0 rounded-full bg-brand-orange ring-2 ring-brand-orange/30 ring-offset-2 ring-offset-[#0a0908]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Tarjeta
                      </p>
                      <div className="space-y-3 rounded-xl border border-white/10 bg-gradient-to-br from-[#1a120a] to-[#0a050a] p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black tracking-wider">
                            VISA
                          </span>
                          <Wifi className="h-4 w-4 rotate-90 text-gray-400" />
                        </div>
                        <div className="font-mono text-sm tracking-widest">
                          4509 •••• •••• 7321
                        </div>
                        <div className="flex gap-6 text-[10px] uppercase tracking-widest text-gray-400">
                          <span>
                            Vence <b className="text-white">12/29</b>
                          </span>
                          <span>
                            CVV <b className="text-white">•••</b>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-brand-orange py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(255,107,26,0.3)]">
                      Pagar $1,290 MXN <ArrowRight className="h-4 w-4" />
                    </button>
                    <p className="text-center text-[9px] uppercase tracking-widest text-gray-500">
                      🔒 Procesado por Mercado Pago
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Panel del atleta teaser */}
      <section
        id="app"
        className="overflow-hidden border-y border-white/5 bg-brand-gray py-16 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div className="order-2 flex justify-center lg:order-1">
              <div className="glass-card w-full max-w-md space-y-5 rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                      Buenos días,
                    </p>
                    <p className="text-2xl font-black uppercase">Andrés</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-orange text-lg font-black text-black">
                    A
                  </div>
                </div>

                <div className="rounded-2xl border border-brand-orange/40 bg-gradient-to-br from-brand-orange/20 to-brand-orange/5 p-5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                    Hoy · Mar 14
                  </p>
                  <p className="mb-2 text-lg font-black uppercase tracking-wide">
                    Pretemporada · Fuerza
                  </p>
                  <div className="mb-4 flex justify-between text-xs text-gray-300">
                    <span>18:00 — 19:30</span>
                    <span>Coach Nayo</span>
                  </div>
                  <Link
                    href="/portal/qr"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange py-3 text-xs font-black uppercase tracking-widest text-black"
                  >
                    <QrCode className="h-4 w-4" /> Check-in QR
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-brand-dark p-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      Asistencia
                    </p>
                    <p className="text-2xl font-black">
                      92<span className="text-sm text-gray-400">%</span>
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-brand-orange-3 to-brand-orange-2"
                        style={{ width: '92%' }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-brand-dark p-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      PRs · mes
                    </p>
                    <p className="text-2xl font-black">3</p>
                    <div className="mt-2 flex gap-1">
                      <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-brand-orange-3 to-brand-orange-2" />
                      <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-brand-orange-3 to-brand-orange-2" />
                      <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-brand-orange-3 to-brand-orange-2" />
                      <div className="h-1.5 flex-1 rounded-full bg-white/10" />
                      <div className="h-1.5 flex-1 rounded-full bg-white/10" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-brand-dark p-4">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Curso activo
                  </p>
                  <p className="mb-2 text-sm font-black uppercase tracking-wide">
                    Pretemporada Football
                  </p>
                  <div className="mb-1 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-brand-orange-3 to-brand-orange-2"
                      style={{ width: '62%' }}
                    />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Semana 5 de 8 · 62%
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-[#009ee3]/30 bg-[#009ee3]/10 p-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Próximo cobro
                    </p>
                    <p className="text-sm font-bold">Pro · $1,290 MXN</p>
                  </div>
                  <div className="mp-badge">
                    <span>mercado</span>
                    <b>pago</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 text-center lg:order-2 lg:text-left">
              <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
                Panel del atleta
              </span>
              <h2 className="mb-6 text-3xl font-black uppercase leading-tight sm:text-4xl md:text-5xl">
                Tu gimnasio <br />
                <span className="text-gradient">en el bolsillo</span>
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-base font-light leading-relaxed text-gray-400 md:text-lg lg:mx-0">
                Check-in con QR, plan del día, progreso de PRs, facturación y
                renovación automática. Como los atletas profesionales.
              </p>
              <ul className="mx-auto mb-10 max-w-md space-y-3 text-left lg:mx-0">
                {[
                  { icon: QrCode, text: 'Check-in con QR al llegar' },
                  {
                    icon: Calendar,
                    text: 'Plan diario y calendario de clases',
                  },
                  { icon: TrendingUp, text: 'Progreso de PRs y carga semanal' },
                  { icon: FileCheck, text: 'Renovación automática y factura' },
                  { icon: MessageSquare, text: 'Chat directo con tu coach' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3 text-gray-300">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/20">
                      <Icon className="h-3 w-3 text-brand-orange" />
                    </div>
                    {text}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
                <Link
                  href="/register"
                  className="rounded-xl bg-brand-orange px-8 py-4 text-center text-xs font-black uppercase tracking-widest text-black transition hover:scale-105"
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/login"
                  className="glass rounded-xl px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-white transition hover:bg-white/10"
                >
                  Iniciar sesión
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ubicación */}
      <section
        id="ubicacion"
        className="relative overflow-hidden px-4 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 lg:order-1">
              <span className="mb-2 block text-center text-[10px] font-bold uppercase tracking-widest text-brand-orange sm:text-sm lg:text-left">
                Contacto directo
              </span>
              <h2 className="mb-8 text-center text-3xl font-black uppercase text-white sm:mb-10 sm:text-4xl md:text-6xl lg:text-left">
                Visita nuestras <br className="hidden sm:block" />
                <span className="text-gradient">instalaciones</span>
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
                    href="#cursos"
                    className="text-gray-400 transition hover:text-brand-orange"
                  >
                    Cursos
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

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/526141970660"
        target="_blank"
        rel="noreferrer"
        className="group fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_4px_20px_rgba(37,211,102,0.4)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_30px_rgba(37,211,102,0.6)] sm:bottom-6 sm:right-6 sm:h-16 sm:w-16 md:bottom-10 md:right-10"
      >
        <MessageCircle className="h-6 w-6 transition-transform group-hover:scale-110 sm:h-8 sm:w-8" />
        <div className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-40" />
      </a>

      <InteractivityClient />
    </>
  );
}
