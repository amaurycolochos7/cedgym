'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCog,
  CreditCard,
  GraduationCap,
  CalendarClock,
  Receipt,
  ShoppingBag,
  Boxes,
  Wand2,
  MessageSquare,
  Tag,
  BarChart3,
  Settings,
  Sparkles,
  MessagesSquare,
  X,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, group: 'Resumen' },
  { label: 'Miembros', href: '/admin/miembros', icon: Users, group: 'Operación' },
  { label: 'Mi equipo', href: '/admin/staff', icon: UserCog, group: 'Operación' },
  { label: 'Membresías', href: '/admin/memberships', icon: CreditCard, group: 'Operación' },
  { label: 'Cursos', href: '/admin/courses', icon: GraduationCap, group: 'Operación' },
  { label: 'Clases', href: '/admin/classes', icon: CalendarClock, group: 'Operación' },
  { label: 'Pagos', href: '/admin/payments', icon: Receipt, group: 'Finanzas' },
  { label: 'Marketplace', href: '/admin/products', icon: ShoppingBag, group: 'Comercio' },
  { label: 'Inventario', href: '/admin/inventory', icon: Boxes, group: 'Comercio' },
  { label: 'Automaciones', href: '/admin/automations', icon: Wand2, group: 'Crecimiento' },
  { label: 'Plantillas', href: '/admin/templates', icon: MessagesSquare, group: 'Crecimiento' },
  { label: 'WhatsApp', href: '/admin/whatsapp', icon: MessageSquare, group: 'Crecimiento' },
  { label: 'Promocodes', href: '/admin/promocodes', icon: Tag, group: 'Crecimiento' },
  { label: 'Referidos', href: '/admin/referrals', icon: Sparkles, group: 'Crecimiento' },
  { label: 'Reportes', href: '/admin/reports', icon: BarChart3, group: 'Finanzas' },
  { label: 'Ajustes', href: '/admin/settings', icon: Settings, group: 'Sistema' },
];

const STAFF_NAV: NavItem[] = [
  { label: 'Escanear', href: '/staff/scan', icon: LayoutDashboard },
  { label: 'Socios', href: '/staff/members', icon: Users },
  { label: 'Punto de venta', href: '/staff/pos', icon: ShoppingBag },
  { label: 'Asistencia', href: '/staff/attendance', icon: CalendarClock },
];

interface SidebarProps {
  variant?: 'admin' | 'staff';
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ variant = 'admin', open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const items = variant === 'admin' ? ADMIN_NAV : STAFF_NAV;

  // Group by group label
  const groups = React.useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const it of items) {
      const k = it.group ?? '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

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
            href={variant === 'admin' ? '/admin/dashboard' : '/staff/scan'}
            className="flex items-center gap-2.5"
          >
            <Logo size="sm" href={null} imageOnly />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wider text-white">
                CED·GYM
              </span>
              <span className="text-[10px] uppercase tracking-widest text-brand-orange">
                {variant === 'admin' ? 'Panel Admin' : 'Staff'}
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
          {groups.map(([group, its]) => (
            <div key={group} className="mb-2">
              {group !== '—' && (
                <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {group}
                </div>
              )}
              <ul className="space-y-0.5 px-2">
                {its.map((item) => {
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
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3">
          <Link
            href="/portal/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/50 hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft className="h-3 w-3" />
            Volver al portal atleta
          </Link>
        </div>
      </aside>
    </>
  );
}
