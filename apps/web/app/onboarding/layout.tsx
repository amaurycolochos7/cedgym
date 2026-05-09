// Layout enfocado para el onboarding del socio — no tiene sidebar
// del portal ni nav. La idea es que el socio termine el wizard antes
// de hacer cualquier otra cosa, sin distractores. Solo el logo arriba
// y un footer mínimo.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6">
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

      <main className="flex w-full flex-1 justify-center px-4 py-4 sm:px-6 sm:py-8">
        <div className="w-full max-w-3xl">{children}</div>
      </main>

      <footer className="px-4 pb-4 text-center text-[10px] text-slate-500 sm:pb-6 sm:text-[11px]">
        © {new Date().getFullYear()} CED·GYM
      </footer>
    </div>
  );
}
