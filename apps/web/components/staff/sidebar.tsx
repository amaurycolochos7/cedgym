'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QrCode, Users, ShoppingCart, Clipboard, LogOut, UserPlus } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/staff/scan',       label: 'Scan QR',       icon: QrCode },
  { href: '/staff/members',    label: 'Socios',        icon: Users },
  { href: '/staff/walk-in',    label: 'Inscribir socio', icon: UserPlus },
  { href: '/staff/pos',        label: 'Cobrar',        icon: ShoppingCart },
  { href: '/staff/attendance', label: 'Asistencia',    icon: Clipboard },
];

export function StaffSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col min-h-screen">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
        <Logo size="sm" imageOnly href={null} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wider text-white">CED·GYM</span>
          <span className="text-[10px] uppercase tracking-widest text-brand-orange">Staff</span>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                active
                  ? 'bg-orange-600/20 text-orange-100 border border-orange-500/30'
                  : 'text-zinc-400 hover:bg-zinc-800/60'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800">
        <button
          onClick={() => logout?.()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-red-400"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
