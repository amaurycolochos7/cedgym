import { PortalSidebar } from '@/components/portal/sidebar';
import { ProfileCompletionBanner } from '@/components/portal/profile-banner';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PortalSidebar />
      <main className="pt-14 pb-28">
        <ProfileCompletionBanner />
        <div className="px-4 py-4 sm:px-6 sm:py-6 md:px-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
