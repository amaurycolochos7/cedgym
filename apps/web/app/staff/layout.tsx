'use client';

import * as React from 'react';
import { Sidebar } from '@/components/admin/sidebar';
import { StaffTopbar } from '@/components/staff/topbar';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar variant="staff" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <StaffTopbar onMenu={() => setOpen(true)} />
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
