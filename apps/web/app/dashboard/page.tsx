import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPERADMIN']);
const STAFF_ROLES = new Set(['RECEPTIONIST']);

export default function DashboardRedirect() {
  const role = cookies().get('cedgym_role')?.value ?? '';
  if (ADMIN_ROLES.has(role)) redirect('/admin/dashboard');
  if (STAFF_ROLES.has(role)) redirect('/staff/scan');
  redirect('/portal/dashboard');
}
