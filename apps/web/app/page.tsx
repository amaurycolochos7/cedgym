import Link from 'next/link';
import {
  ArrowRight,
  Baby,
  Check,
  ChevronRight,
  Clock,
  Crown,
  Flame,
  Instagram,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  QrCode,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { FeaturedProducts } from '@/components/home/featured-products';
import { FounderSection } from '@/components/home/founder-section';
import { InteractivityClient } from '@/components/home/InteractivityClient';
import { MobileMenu } from '@/components/home/mobile-menu';
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

            <div className="hidden items-center gap-7 text-[12px] font-semibold uppercase tracking-[0.15em] text-slate-600 lg:flex">
              <a href="#planes" className="transition-colors hover:text-blue-600">Planes</a>
              <a href="#metodo" className="transition-colors hover:text-blue-600">Método</a>
              <a href="#fundador" className="transition-colors hover:text-blue-600">Coach</a>
              <a href="#para-ti" className="transition-colors hover:text-blue-600">Para ti</a>
              <a href="#instalaciones" className="transition-colors hover:text-blue-600">Instalaciones</a>
              <Link href="/tienda" className="transition-colors hover:text-blue-600">Tienda</Link>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 transition hover:bg-slate-100"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className="group relative inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/30 transition-all hover:bg-blue-700"
              >
                <span>¡Inscríbete ya!</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <MobileMenu />
          </div>
        </div>
      </nav>

      {/* ═════════ HERO — full-bleed promo banner ═════════ */}
      <section id="inicio" className="relative overflow-hidden pt-16 md:pt-18">
        <div className="relative min-h-[560px] sm:min-h-[640px] lg:min-h-[680px]">
          {/* Background photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2400"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Blue brand overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-blue-900/80 to-blue-900/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

          <div className="relative mx-auto flex h-full min-h-[560px] sm:min-h-[640px] lg:min-h-[680px] max-w-7xl items-center px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-2xl">
              <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl md:text-7xl">
                Diseñado por un{' '}
                <span className="bg-gradient-to-r from-sky-300 to-white bg-clip-text text-transparent">
                  campeón mundial.
                </span>
              </h1>

              <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
                Entrena con el Coach <strong className="text-white">Samuel Jeffery</strong>,
                tricampeón mundial de powerlifting. Rutinas y plan de comidas diseñados
                por el coach, listos para ti.
              </p>

              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-xl shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-500"
                >
                  ¡Inscríbete ya!
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#planes"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-8 py-4 text-sm font-semibold uppercase tracking-[0.15em] text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/15"
                >
                  Ver planes
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ PLANS (moved up — core conversion) ═════════ */}
      <section id="planes" className="bg-slate-50 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
              Membresías
            </span>
            <h2 className="font-display mt-4 text-3xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Elige el mejor plan y{' '}
              <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                entrena ya.
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
              Todos los planes incluyen acceso al gym con QR. Cancela cuando quieras.
            </p>
          </div>

          {/* Cycle switcher */}
          <div className="mt-7 flex justify-center">
            <div className="inline-flex gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200 shadow-sm">
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
              <PlanCard
                href="/register?redirect=/checkout/starter&product=starter&type=membership"
                tier="Starter" subtitle="Para empezar"
                icon={<Zap className="h-5 w-5" />}
                priceMonth="690" priceQ="1864" priceY="6624"
                features={[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Sala general' },
                  { t: '3 clases grupales / semana' },
                  { t: 'Plan base del coach' },
                  { t: 'Panel del atleta + progreso' },
                ]}
                cta="Elegir Starter"
              />
              <PlanCard
                href="/register?redirect=/checkout/pro&product=pro&type=membership"
                tier="Pro" subtitle="Atleta regular" popular
                icon={<Flame className="h-5 w-5" />}
                priceMonth="1,290" priceQ="3483" priceY="12384"
                features={[
                  { t: 'Acceso al gym con QR', hi: true },
                  { t: 'Acceso ilimitado 6 días' },
                  { t: 'Clases grupales sin límite' },
                  { t: 'Plan del coach personalizado' },
                  { t: '1 curso incluido / trimestre' },
                ]}
                cta="Elegir Pro"
              />
              <PlanCard
                href="/register?redirect=/checkout/elite&product=elite&type=membership"
                tier="Élite" subtitle="Preparación deportiva"
                icon={<Crown className="h-5 w-5" />}
                priceMonth="2,290" priceQ="6183" priceY="21984"
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
            Pagos seguros · Mercado Pago
          </p>
        </div>
      </section>

      {/* ═════════ MÉTODO · 30s del coach ═════════ */}
      <section id="metodo" className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            {/* Copy */}
            <div>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Método del coach
              </span>
              <h2 className="font-display mt-4 text-3xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
                Tu rutina en{' '}
                <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                  30 segundos.
                </span>
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
                Recibes tu rutina semanal completa con el método del Coach Samuel —
                el mismo sistema que lo llevó a 3 títulos mundiales. Videos, sets y
                descansos, listos para ti.
              </p>

              <ul className="mt-7 space-y-3">
                {[
                  'Plan del día con sets, repes y descansos',
                  'Video de ejecución en cada ejercicio',
                  'Plan de comidas con lista de compras',
                  'Adaptación por edad, lesiones y deporte',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-slate-700 sm:text-base">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  Recibir mi rutina <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Mockup */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-6 text-white shadow-2xl sm:p-7">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-sky-300/20 blur-2xl" />

                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                      Tu panel · vista previa
                    </span>
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white/30" />
                      <span className="h-2 w-2 rounded-full bg-white/30" />
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm">
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

      {/* ═════════ PARA TI — horizontal carousel (audience + sports combined) ═════════ */}
      <section id="para-ti" className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Para ti
              </span>
              <h2 className="font-display mt-3 text-3xl leading-[0.95] tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                El coach diseña para quien eres.
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Adultos, mayores, juveniles y deportistas. Desliza →
              </p>
            </div>
          </div>
        </div>

        {/* Full-bleed carousel */}
        <div className="mt-8 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
          <div className="mx-auto flex max-w-7xl gap-4 px-4 sm:gap-5 sm:px-6 lg:px-8">
            {AUDIENCE.map((a) => (
              <div
                key={a.title}
                className="snap-start shrink-0 w-[260px] sm:w-[300px] overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative h-44 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.img} alt={a.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 backdrop-blur-sm">
                    <a.Icon className="h-3 w-3" />
                    {a.tag}
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-xl font-bold tracking-tight text-slate-900">
                    {a.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Discipline pills */}
        <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6 lg:px-8">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mr-1">
            Y en tu deporte:
          </span>
          {['Fuerza', 'HYROX', 'Powerlifting', 'Funcional', 'Football', 'Soccer', 'Básquet', 'Tenis', 'Boxeo', 'CrossFit'].map((s) => (
            <span
              key={s}
              className="rounded-full bg-white ring-1 ring-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ═════════ INSTALACIONES — horizontal carousel ═════════ */}
      <section id="instalaciones" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Instalaciones
              </span>
              <h2 className="font-display mt-3 text-3xl leading-[0.95] tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                Todo lo que necesitas.
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Máquinas, funcional y cardio completo. Desliza →
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
          <div className="mx-auto flex max-w-7xl gap-4 px-4 sm:gap-5 sm:px-6 lg:px-8">
            {FACILITIES.map((f) => (
              <div
                key={f.title}
                className="snap-start shrink-0 w-[300px] sm:w-[360px] overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.img} alt={f.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-xl font-bold tracking-tight text-slate-900">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════ PRODUCTS ═════════ */}
      <FeaturedProducts />

      {/* ═════════ UBICACIÓN ═════════ */}
      <section id="ubicacion" className="bg-slate-50 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
            <div className="order-2 lg:order-1">
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Contacto directo
              </span>
              <h2 className="font-display mt-4 text-3xl leading-[0.95] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
                Visítanos.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
                Estamos en el corazón de Chihuahua. Pasa, conoce la sala y llévate un
                tour.
              </p>

              <div className="mt-6 space-y-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200 shadow-sm sm:p-6">
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

            <div className="relative order-1 aspect-[4/3] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-xl lg:order-2 lg:aspect-auto lg:h-[520px]">
              <iframe
                src="https://www.google.com/maps?q=CED+Gym+Av.+Tecnologico+Santo+Nino+Chihuahua&output=embed&z=16"
                width="100%" height="100%" style={{ border: 0 }}
                allowFullScreen loading="lazy"
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
                  target="_blank" rel="noreferrer"
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
      <footer className="bg-slate-900 px-4 pt-14 pb-8 text-slate-300">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:text-left lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Link href="#inicio" className="group inline-flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="CED·GYM" className="h-12 w-12 rounded-full ring-1 ring-white/10" />
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
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">
                Plataforma de preparación física para atletas. Método del Coach Samuel,
                tricampeón mundial, puesto en tus manos.
              </p>
              <div className="mt-5 flex gap-3">
                <a href="https://instagram.com/ced.gym.chih" target="_blank" rel="noreferrer" aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#E4405F]">
                  <Instagram className="h-4 w-4" />
                </a>
                <a href="https://wa.me/526141970660" target="_blank" rel="noreferrer" aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-[#25D366]">
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a href="tel:+526141970660" aria-label="Llamar"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-blue-600">
                  <Phone className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">
                Plataforma
              </h4>
              <ul className="space-y-3 text-sm">
                <FooterLink href="#planes">Planes</FooterLink>
                <FooterLink href="#metodo">Método</FooterLink>
                <FooterLink href="/tienda">Tienda</FooterLink>
                <FooterLink href="#fundador">Coach</FooterLink>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">
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

/* ═════════ Data ═════════ */

const AUDIENCE = [
  {
    title: 'Adultos',
    tag: '18 – 55',
    body: 'Hipertrofia, fuerza y pérdida de grasa con plan completo.',
    Icon: Users,
    img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800',
  },
  {
    title: 'Adultos mayores',
    tag: '55+',
    body: 'Baja carga, máquinas seguras, énfasis en movilidad.',
    Icon: UserCheck,
    img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=800',
  },
  {
    title: 'Niños y juveniles',
    tag: '6 – 17',
    body: 'Funcional, coordinación y peso corporal.',
    Icon: Baby,
    img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=800',
  },
  {
    title: 'Deportistas',
    tag: 'Pro',
    body: 'Programación por deporte con prep física específica.',
    Icon: Trophy,
    img: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?q=80&w=800',
  },
] as const;

const FACILITIES = [
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
  {
    title: 'Peso libre',
    body: 'Bancas, barras olímpicas, discos calibrados y racks.',
    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1000',
  },
  {
    title: 'Clases grupales',
    body: 'Salón dedicado para HIIT, spinning y movilidad.',
    img: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?q=80&w=1000',
  },
] as const;

/* ═════════ Helpers ═════════ */

function PlanCard({
  href, tier, subtitle, icon, popular,
  priceMonth, priceQ, priceY, features, cta,
}: {
  href: string; tier: string; subtitle: string;
  icon: React.ReactNode; popular?: boolean;
  priceMonth: string; priceQ: string; priceY: string;
  features: { t: string; hi?: boolean }[]; cta: string;
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
          El más popular
        </span>
      )}

      <div className="mb-5 flex items-center gap-3">
        <span
          className={
            'inline-flex h-11 w-11 items-center justify-center rounded-xl ' +
            (popular ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-blue-100 text-blue-700')
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-bold tracking-tight">{tier}</h3>
          <p className={'text-[11px] font-semibold uppercase tracking-[0.15em] ' + (popular ? 'text-white/80' : 'text-slate-500')}>
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
            MXN <em className="cycle-label not-italic text-xs">/mes</em>
          </span>
        </div>
      </div>

      <ul className="mb-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li
            key={f.t}
            className={'flex items-start gap-2 ' + (popular ? 'text-white/90' : f.hi ? 'font-semibold text-slate-900' : 'text-slate-700')}
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
          (popular ? 'bg-white text-blue-700 hover:bg-sky-50' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25')
        }
      >
        {cta} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ContactRow({
  icon, iconClass = 'bg-blue-100 text-blue-700',
  label, primary, sub, href,
}: {
  icon: React.ReactNode; iconClass?: string;
  label: string; primary: string; sub?: string; href?: string;
}) {
  const body = (
    <>
      <div className={'mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ' + iconClass}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="font-semibold text-slate-900">{primary}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="group flex items-center">{body}</a>
  ) : (
    <div className="flex items-center">{body}</div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const cls = 'text-slate-400 transition hover:text-white';
  return (
    <li>
      {isInternal ? <Link href={href} className={cls}>{children}</Link> : <a href={href} className={cls}>{children}</a>}
    </li>
  );
}
