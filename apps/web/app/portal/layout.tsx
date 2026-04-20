import { PortalSidebar } from '@/components/portal/sidebar';
import { ProfileCompletionBanner } from '@/components/portal/profile-banner';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <PortalSidebar />
      <main className="flex-1 min-w-0">
        <ProfileCompletionBanner />
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
