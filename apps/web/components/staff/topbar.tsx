'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface StaffTopbarProps {
  onMenu: () => void;
}

const TITLES: Record<string, string> = {
  '/staff/scan': 'Scan QR',
  '/staff/members': 'Socios',
  '/staff/walk-in': 'Inscribir socio',
  '/staff/pos': 'Cobrar',
};

export function StaffTopbar({ onMenu }: StaffTopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const initials = React.useMemo(() => {
    if (!user?.name) return 'ST';
    return user.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }, [user?.name]);

  const title = React.useMemo(() => {
    const match = Object.keys(TITLES).find(
      (k) => pathname === k || pathname?.startsWith(`${k}/`),
    );
    return match ? TITLES[match] : 'Staff';
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="text-sm font-semibold tracking-wider text-slate-900 sm:text-base">
          {title}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-slate-900 hover:bg-slate-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white ring-2 ring-slate-200">
                {initials}
              </div>
              <span className="hidden font-medium sm:block">
                {user?.name?.split(' ')[0] ?? 'Staff'}
              </span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    router.push('/staff-login');
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
