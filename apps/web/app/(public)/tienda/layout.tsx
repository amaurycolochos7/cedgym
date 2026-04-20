import Link from 'next/link';
import { Instagram, MessageCircle, Phone } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-brand-dark/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Logo size="md" />
          <nav className="hidden items-center gap-8 text-xs font-bold uppercase tracking-widest text-gray-300 lg:flex">
            <Link href="/" className="transition-colors hover:text-brand-orange">
              Inicio
            </Link>
            <Link
              href="/tienda"
              className="text-brand-orange"
            >
              Tienda
            </Link>
            <Link
              href="/#planes"
              className="transition-colors hover:text-brand-orange"
            >
              Planes
            </Link>
            <Link
              href="/#ubicacion"
              className="transition-colors hover:text-brand-orange"
            >
              Contacto
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-xs font-bold uppercase tracking-widest text-white/80 transition hover:text-white md:inline"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-brand-orange px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-black shadow-brand transition hover:bg-brand-orange-2 sm:px-6 sm:py-2.5 sm:text-xs"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="mt-20 border-t border-white/5 bg-black/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
          <Logo size="sm" />
          <p className="text-center text-xs text-white/50">
            © {new Date().getFullYear()} CED·GYM. Pagos seguros con Mercado Pago.
          </p>
          <div className="flex gap-3">
            <a
              href="https://instagram.com/ced.gym.chih"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://wa.me/526141970660"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href="tel:+526141970660"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
            >
              <Phone className="h-4 w-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
