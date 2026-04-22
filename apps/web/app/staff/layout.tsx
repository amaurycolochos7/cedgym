import { StaffSidebar } from '@/components/staff/sidebar';

export const dynamic = 'force-dynamic';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <StaffSidebar />
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
