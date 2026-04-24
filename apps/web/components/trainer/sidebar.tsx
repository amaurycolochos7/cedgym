'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Dumbbell,
  DollarSign,
  Users,
  MessageSquare,
  User as UserIcon,
  LogOut,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const TRAINER_NAV: NavItem[] = [
  { label: 'Dashboard',              href: '/trainer/dashboard', icon: LayoutDashboard },
  { label: 'Mis rutinas y productos',href: '/trainer/products',  icon: Dumbbell },
  { label: 'Ventas y payouts',       href: '/trainer/sales',     icon: DollarSign },
  { label: 'Mis atletas',            href: '/trainer/athletes',  icon: Users },
  { label: 'Chat',                   href: '/trainer/chat',      icon: MessageSquare },
  { label: 'Perfil',                 href: '/trainer/profile',   icon: UserIcon },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function TrainerSidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  const handleLogout = React.useCallback(() => {
    logout();
    router.push('/login');
  }, [logout, router]);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-white/5 bg-neutral-950/95 backdrop-blur transition-transform',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
          <Link
            href="/trainer/dashboard"
            className="flex items-center gap-2.5"
          >
            <Logo size="sm" href={null} imageOnly />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wider text-white">
                CED·GYM
              </span>
              <span className="text-[10px] uppercase tracking-widest text-brand-orange">
                Trainer
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-0.5 px-2">
            {TRAINER_NAV.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-orange/10 text-brand-orange ring-1 ring-inset ring-brand-orange/20'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/5 p-3 space-y-1">
          {user?.name && (
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-white/40 truncate">
              {user.name}
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/60 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
