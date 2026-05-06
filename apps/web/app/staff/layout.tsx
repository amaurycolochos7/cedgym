import { StaffShell } from '@/components/staff/shell';

// force-dynamic — las páginas /staff usan cookies/sesión y useSearchParams
// (POS lee ?user_id=). Sin esto, el build intenta prerenderizar como
// estáticas y falla con "useSearchParams should be wrapped in Suspense".
export const dynamic = 'force-dynamic';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffShell>{children}</StaffShell>;
}
