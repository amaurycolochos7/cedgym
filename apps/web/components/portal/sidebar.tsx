'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, CreditCard, QrCode, Dumbbell, GraduationCap,
  Calendar, Ruler, MessageSquare, User, LogOut, Menu, X, Trophy, Apple
} from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/portal/dashboard',   label: 'Inicio',        icon: Home },
  { href: '/portal/membership',  label: 'Mi membresía',  icon: CreditCard },
  { href: '/portal/qr',          label: 'Mi QR',         icon: QrCode },
  { href: '/portal/rutinas',     label: 'Mis rutinas',   icon: Dumbbell },
  { href: '/portal/cursos',      label: 'Mis cursos',    icon: GraduationCap },
  { href: '/portal/plan-alimenticio', label: 'Mi plan alim.', icon: Apple },
  { href: '/portal/clases',      label: 'Reservar clase', icon: Calendar },
  { href: '/portal/logros',      label: 'Logros',        icon: Trophy },
  { href: '/portal/mediciones',  label: 'Mediciones',    icon: Ruler },
  { href: '/portal/chat',        label: 'Chat',          icon: MessageSquare },
  { href: '/portal/perfil',      label: 'Perfil',        icon: User },
];

export function PortalSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { logout, user } = useAuth();

  const content = (
    <>
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size="sm" imageOnly href={null} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wider text-slate-900">CED·GYM</span>
            <span className="text-[10px] uppercase tracking-widest text-blue-600">Atleta</span>
          </div>
        </div>
        <button className="md:hidden text-slate-500 hover:text-slate-900" onClick={() => setOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                active
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-200 space-y-2">
        {user && (
          <div className="px-3 py-2 text-xs text-slate-500 truncate">
            {user.name} · {user.phone}
          </div>
        )}
        <button
          onClick={() => logout?.()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile topbar */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden flex items-center justify-between h-12 px-3 bg-white/95 backdrop-blur border-b border-slate-200 text-slate-900">
        <button
          className="p-2 rounded-lg hover:bg-slate-100 -ml-2 text-slate-700"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Logo size="sm" imageOnly href={null} />
          <span className="text-sm font-bold tracking-wider text-slate-900">CED·GYM</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:sticky top-0 left-0 z-50 h-screen w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col transition-transform',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {content}
      </aside>
    </>
  );
}
