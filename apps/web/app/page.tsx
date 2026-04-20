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

      {/* Hero */}
      <section
        id="inicio"
        className="hero-bg relative flex min-h-[100svh] items-center justify-center py-24 lg:py-28"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 text-center sm:px-6 md:text-left lg:pl-8">
          <div className="mx-auto max-w-3xl md:mx-0">
            <h1 className="mb-4 break-words text-3xl font-black uppercase leading-[1.05] tracking-tight sm:mb-6 sm:text-5xl md:text-6xl lg:text-7xl">
              Preparación física <br className="hidden sm:block" /> para{' '}
              <span className="text-gradient">atletas reales</span>
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-8 py-4 text-center text-sm font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(30,90,255,0.3)] transition hover:-translate-y-1 hover:bg-brand-orange-2 sm:w-auto"
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

      </section>

      {/* Deportes */}
      <section
        id="disciplinas"
        className="relative overflow-hidden px-4 py-10 sm:py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center sm:mb-12">
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

      {/* Fundador */}
      <FounderSection />

      {/* Cursos / Academia */}
      <section id="cursos" className="relative overflow-hidden px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center sm:mb-12">
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
                bg: 'radial-gradient(circle at 30% 40%, rgba(30,90,255,.5), transparent 55%), linear-gradient(135deg, #0a1e4a, #050f28)',
              },
              {
                id: 'course-pl12',
                title: 'Powerlifting 12W',
                body: 'Programa SBD basado en ciencia con revisión por video semanal.',
                level: 'Avanzado',
                duration: '12 semanas',
                price: 3190,
                unit: 'MXN',
                bg: 'radial-gradient(circle at 70% 30%, rgba(59,122,255,.45), transparent 55%), linear-gradient(135deg, #0a1838, #050f22)',
              },
              {
                id: 'course-nutri',
                title: 'Nutrición Deportiva',
                body: 'Plan alimenticio por objetivo con seguimiento semanal.',
                level: 'Online',
                duration: '6 lecciones',
                price: 1290,
                unit: 'MXN',
                bg: 'radial-gradient(circle at 40% 60%, rgba(30,90,255,.4), transparent 55%), linear-gradient(135deg, #081840, #050f22)',
              },
              {
                id: 'course-kids',
                title: 'Escuela Infantil',
                body: 'Lun–Vie PM · grupos por edad · maestros certificados.',
                level: 'Kids',
                duration: 'Mensual',
                price: 890,
                unit: '/mes',
                bg: 'radial-gradient(circle at 60% 40%, rgba(96,165,250,.5), transparent 55%), linear-gradient(135deg, #0f2450, #061230)',
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
        className="overflow-hidden border-y border-white/5 bg-brand-gray py-10 sm:py-16"
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 text-center sm:mb-8">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
              Membresías
            </span>
            <h2 className="mb-3 px-2 text-2xl font-black uppercase sm:text-4xl md:text-5xl">
              Elige tu <span className="text-gradient">nivel</span>
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

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
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
                className="glass block w-full rounded-xl py-3 text-center text-xs font-black uppercase tracking-widest text-white transition hover:bg-white/10"
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
                  className="block w-full rounded-xl bg-brand-orange py-3 text-center text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(30,90,255,0.3)] transition hover:bg-brand-orange-2"
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
                className="glass block w-full rounded-xl py-3 text-center text-xs font-black uppercase tracking-widest text-white transition hover:bg-white/10"
              >
                Elegir Élite
              </Link>
            </div>
          </div>

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
