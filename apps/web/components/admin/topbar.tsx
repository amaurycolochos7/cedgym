'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/5 bg-neutral-950/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-md p-2 text-white/70 hover:bg-white/5 hover:text-white lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden text-sm font-semibold tracking-wider text-white/90 sm:block">
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
          className="relative rounded-md p-2 text-white/70 hover:bg-white/5 hover:text-white"
          aria-label="Notificaciones"
          title="Jobs fallidos"
        >
          <Bell className="h-4 w-4" />
          {failedJobs && failedJobs.count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {failedJobs.count > 99 ? '99+' : failedJobs.count}
            </span>
          ) : null}
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm text-white hover:bg-white/10"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange text-[11px] font-bold text-black">
              {initials}
            </div>
            <span className="hidden font-medium sm:block">
              {user?.name?.split(' ')[0] ?? 'Admin'}
            </span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-neutral-950 shadow-xl"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Link
                href="/admin/settings"
                className="block px-3 py-2 text-sm text-white/80 hover:bg-white/5"
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
                className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
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
