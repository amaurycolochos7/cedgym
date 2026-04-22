import Link from 'next/link';
import { Instagram, MessageCircle, Phone } from 'lucide-react';

export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" className="group relative z-50 flex items-center gap-2.5">
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
          <nav className="hidden items-center gap-7 text-[12px] font-semibold uppercase tracking-[0.15em] text-slate-600 lg:flex">
            <Link href="/" className="transition-colors hover:text-blue-600">
              Inicio
            </Link>
            <Link href="/tienda" className="text-blue-600">
              Tienda
            </Link>
            <Link href="/#planes" className="transition-colors hover:text-blue-600">
              Planes
            </Link>
            <Link href="/#ubicacion" className="transition-colors hover:text-blue-600">
              Contacto
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 transition hover:bg-slate-100 md:inline-flex"
            >
              Ingresar
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 sm:px-5 sm:py-2.5 sm:text-xs"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="mt-20 bg-slate-900 px-4 pt-14 pb-8 text-slate-300">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-6 md:flex-row md:border-t-0 md:pt-0">
            <Link href="/" className="group inline-flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="CED·GYM" className="h-10 w-10 rounded-full ring-1 ring-white/10" />
              <span className="logo-font flex flex-col leading-none text-lg tracking-tight">
                <span>
                  <span className="text-blue-400">CED</span>
                  <span className="text-white">·GYM</span>
                </span>
                <span className="mt-1 text-[0.5em] font-bold uppercase tracking-[0.25em] text-slate-400">
                  Fábrica de monstruos
                </span>
              </span>
            </Link>
            <p className="text-center text-xs text-slate-400">
              © {new Date().getFullYear()} CED·GYM. Pagos seguros con Mercado Pago.
            </p>
            <div className="flex gap-3">
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
        </div>
      </footer>
    </div>
  );
}
