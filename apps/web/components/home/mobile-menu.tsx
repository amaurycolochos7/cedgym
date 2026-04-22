'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogIn, Menu, UserPlus, X } from 'lucide-react';

const LINKS: [label: string, href: string][] = [
  ['Planes', '#planes'],
  ['Método', '#metodo'],
  ['Coach', '#fundador'],
  ['Para ti', '#para-ti'],
  ['Instalaciones', '#instalaciones'],
  ['Tienda', '/tienda'],
  ['Contacto', '#ubicacion'],
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) document.body.classList.add('overflow-hidden');
    else document.body.classList.remove('overflow-hidden');
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative z-50 p-2 text-slate-700 transition hover:text-blue-600 focus:outline-none lg:hidden"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
      >
        {open ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
      </button>

      {/* Overlay backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={
          'fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />

      {/* Panel */}
      <div
        className={
          'fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-white px-6 pt-20 pb-8 shadow-2xl transition-transform duration-300 lg:hidden ' +
          (open ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <nav className="mt-2 flex flex-col space-y-1 text-base font-semibold text-slate-900">
          {LINKS.map(([label, href]) => {
            const isInternal = href.startsWith('/');
            const cls =
              'flex items-center justify-between rounded-lg px-3 py-3 text-slate-800 hover:bg-blue-50 hover:text-blue-700 transition';
            const child = (
              <>
                <span>{label}</span>
                <span className="text-slate-300">›</span>
              </>
            );
            return isInternal ? (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cls}
              >
                {child}
              </Link>
            ) : (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cls}
              >
                {child}
              </a>
            );
          })}
        </nav>

        <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-center text-sm font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/30"
          >
            <UserPlus className="h-4 w-4" /> Crear cuenta
          </Link>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-center text-sm font-semibold uppercase tracking-[0.15em] text-slate-700 ring-1 ring-slate-300"
          >
            <LogIn className="h-4 w-4" /> Iniciar sesión
          </Link>
        </div>
      </div>
    </>
  );
}
