'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, QrCode, Dumbbell, User, LogOut, Apple,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/portal/dashboard',        label: 'Inicio',     icon: Home },
  { href: '/portal/qr',               label: 'QR',         icon: QrCode },
  { href: '/portal/rutinas',          label: 'Rutinas',    icon: Dumbbell },
  { href: '/portal/plan-alimenticio', label: 'Plan alim.', icon: Apple },
  { href: '/portal/perfil',           label: 'Perfil',     icon: User },
];

/**
 * Portal shell chrome — native-app style.
 *   • Top: brand + logout (fixed).
 *   • Bottom: 5-tab nav (fixed, safe-area aware).
 * Designed to mirror the experience we'll ship in the future mobile app,
 * so the web portal and the app share the same navigation model.
 */
export function PortalSidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 bg-white/95 backdrop-blur border-b border-slate-200">
        <Link href="/portal/dashboard" className="flex items-center gap-2.5 min-w-0">
          <Logo size="sm" imageOnly href={null} />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold tracking-wider text-slate-900">CED·GYM</span>
            {user?.name && (
              <span className="text-[10px] uppercase tracking-widest text-blue-600 truncate">
                {user.name.split(' ')[0]}
              </span>
            )}
          </div>
        </Link>
        <button
          onClick={() => logout?.()}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </header>

      {/* Bottom tab bar — floats above the viewport edge so it never gets
          clipped by the browser/device chrome. */}
      <nav
        className="fixed left-3 right-3 z-40 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-lg shadow-slate-900/5"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <ul className="flex items-stretch justify-around max-w-xl mx-auto px-2">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 h-16 text-[11px] transition',
                    active
                      ? 'text-blue-600 font-semibold'
                      : 'text-slate-500 hover:text-slate-900',
                  )}
                >
                  <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
