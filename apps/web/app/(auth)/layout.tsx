import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="CED·GYM"
            className="h-9 w-9 rounded-full ring-1 ring-slate-200 sm:h-11 sm:w-11"
          />
          <span className="logo-font text-base font-black leading-none tracking-tight sm:text-xl">
            <span className="text-blue-600">CED</span>
            <span className="text-slate-900">·GYM</span>
          </span>
        </Link>
      </header>

      <main className="flex w-full flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {children}
          </div>
          <p className="mt-4 text-center text-xs text-slate-500 sm:mt-6">
            <Link
              href="/"
              className="font-semibold text-slate-600 transition hover:text-blue-600"
            >
              ← Volver al inicio
            </Link>
          </p>
        </div>
      </main>

      <footer className="px-4 pb-4 text-center text-[10px] text-slate-500 sm:pb-6 sm:text-[11px]">
        © {new Date().getFullYear()} CED·GYM
      </footer>
    </div>
  );
}
