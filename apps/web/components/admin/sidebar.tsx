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
  Dumbbell,
  Receipt,
  ShoppingBag,
  Boxes,
  MessageSquare,
  Tag,
  BarChart3,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
  /** Roles allowed to see this entry. If omitted, everyone in the variant sees it. */
  roles?: ReadonlyArray<'SUPERADMIN' | 'ADMIN' | 'RECEPTIONIST'>;
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, group: 'Resumen' },
  { label: 'Miembros', href: '/admin/miembros', icon: Users, group: 'Operación' },
  { label: 'Mi equipo', href: '/admin/staff', icon: UserCog, group: 'Operación' },
  { label: 'Membresías', href: '/admin/memberships', icon: CreditCard, group: 'Membresías' },
  { label: 'Cursos', href: '/admin/courses', icon: GraduationCap, group: 'Operación' },
  { label: 'Ejercicios', href: '/admin/ejercicios', icon: Dumbbell, group: 'Operación' },
  { label: 'Pagos', href: '/admin/payments', icon: Receipt, group: 'Finanzas' },
  { label: 'Marketplace', href: '/admin/products', icon: ShoppingBag, group: 'Comercio' },
  { label: 'Inventario', href: '/admin/inventory', icon: Boxes, group: 'Comercio' },
  { label: 'WhatsApp', href: '/admin/whatsapp', icon: MessageSquare, group: 'Crecimiento' },
  { label: 'Promocodes', href: '/admin/promocodes', icon: Tag, group: 'Crecimiento' },
  { label: 'Reportes', href: '/admin/reports', icon: BarChart3, group: 'Reportes' },
  { label: 'Auditoría', href: '/admin/audit', icon: ShieldCheck, group: 'Reportes', roles: ['SUPERADMIN'] },
  { label: 'Ajustes', href: '/admin/settings', icon: Settings, group: 'Sistema' },
];

const STAFF_NAV: NavItem[] = [
  { label: 'Escanear', href: '/staff/scan', icon: LayoutDashboard },
  { label: 'Socios', href: '/staff/members', icon: Users },
  { label: 'Punto de venta', href: '/staff/pos', icon: ShoppingBag },
];

interface SidebarProps {
  variant?: 'admin' | 'staff';
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ variant = 'admin', open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const baseItems = variant === 'admin' ? ADMIN_NAV : STAFF_NAV;

  // Filter role-gated entries (e.g. Auditoría for SUPERADMIN only).
  const items = React.useMemo(
    () =>
      baseItems.filter((it) => {
        if (!it.roles || it.roles.length === 0) return true;
        const role = user?.role;
        return role ? (it.roles as ReadonlyArray<string>).includes(role) : false;
      }),
    [baseItems, user?.role],
  );

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
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <Link
            href={variant === 'admin' ? '/admin/dashboard' : '/staff/scan'}
            className="flex items-center gap-2.5"
          >
            <Logo size="sm" href={null} imageOnly />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wider text-slate-900">
                CED·GYM
              </span>
              <span className="text-[10px] uppercase tracking-widest text-blue-600">
                {variant === 'admin' ? 'Panel Admin' : 'Staff'}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {groups.map(([group, its]) => (
            <div key={group} className="mb-2">
              {group !== '—' && (
                <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
                          active
                            ? 'bg-blue-50 font-semibold text-blue-700'
                            : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            active ? 'text-blue-600' : 'text-slate-400',
                          )}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
