import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export const dynamic = 'force-dynamic';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-brand-dark text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-brand-orange/15 blur-3xl sm:h-[480px] sm:w-[480px]" />
        <div className="absolute bottom-0 right-0 h-[280px] w-[280px] translate-x-1/4 translate-y-1/4 rounded-full bg-brand-orange-3/15 blur-3xl sm:h-[420px] sm:w-[420px] sm:translate-x-0 sm:translate-y-0" />
        <div className="absolute inset-0 grid-dots opacity-30" />
      </div>

      <header className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Logo size="md" />
      </header>

      <main className="flex w-full flex-1 items-center justify-center px-3 py-4 sm:px-6 sm:py-6">
        <div className="w-full max-w-[480px]">
          <div className="glass-card rounded-2xl p-5 sm:rounded-3xl sm:p-8 shadow-2xl animate-fade-in">
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-white/50">
            <Link href="/" className="hover:text-brand-orange">
              ← Volver al inicio
            </Link>
          </p>
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-[11px] text-white/40">
        © {new Date().getFullYear()} CED·GYM
      </footer>
    </div>
  );
}
