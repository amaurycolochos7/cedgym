'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { adminApi } from '@/lib/admin-api';
import { MemberSearch } from './member-search';

interface TopbarProps {
  onMenu: () => void;
  title?: string;
}

export function Topbar({ onMenu, title }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const { data: failedJobs } = useQuery({
    queryKey: ['admin', 'failed-jobs-count'],
    queryFn: () => adminApi.failedJobsCount().catch(() => ({ count: 0 })),
    refetchInterval: 30_000,
  });

  const initials = React.useMemo(() => {
    if (!user?.name) return 'AD';
    return user.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }, [user?.name]);

  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden text-sm font-semibold tracking-wider text-slate-900 sm:block">
        {title}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 md:ml-6 md:max-w-sm">
        <MemberSearch
          className="flex-1 min-w-0"
          placeholder="Buscar socio…"
          onSelect={(m) => router.push(`/admin/miembros/${m.id}`)}
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Link
          href="/admin/automations"
          className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Notificaciones"
          title="Jobs fallidos"
        >
          <Bell className="h-4 w-4" />
          {failedJobs && failedJobs.count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {failedJobs.count > 99 ? '99+' : failedJobs.count}
            </span>
          ) : null}
        </Link>

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
              {user?.name?.split(' ')[0] ?? 'Admin'}
            </span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Link
                href="/admin/settings"
                className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Ajustes
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="flex w-full items-center gap-2 border-t border-slate-200 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
