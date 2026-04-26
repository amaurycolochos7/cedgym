/**
 * Staff — thin API wrappers for the receptionist module.
 *
 * These hit Fastify routes defined under apps/api/src/routes/staff-register.js
 * and the extended POS routes. Everything here requires role RECEPTIONIST+.
 * Shapes are mirrored from the route handlers — keep them in sync.
 */
import { api } from './api';

export type PaymentMethod = 'CASH' | 'CARD_TERMINAL' | 'MP_LINK';
export type PlanCode = 'STARTER' | 'PRO' | 'ELITE';
export type BillingCycle = 'MONTHLY';

export interface StaffMemberSearchResult {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  plan: PlanCode | null;
  membership_status: string | null;
  expires_at: string | null;
  days_remaining: number;
}

export interface PosProductItem {
  type: 'PRODUCT';
  id: string; // sku
  sku: string;
  name: string;
  price_mxn: number;
  stock: number;
  category: string | null;
}

export interface PosMembershipItem {
  type: 'MEMBERSHIP';
  id: string; // PLAN_CYCLE
  plan: PlanCode;
  billing_cycle: BillingCycle;
  name: string;
  price_mxn: number;
}

export interface PosCourseItem {
  type: 'COURSE';
  id: string;
  name: string;
  price_mxn: number;
  sport?: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  enrolled: number;
  seats_left: number;
}

export interface PosMenu {
  products: PosProductItem[];
  memberships: PosMembershipItem[];
  courses: PosCourseItem[];
}

export interface RegisterMemberBody {
  name: string;
  phone: string;
  email?: string;
  plan: PlanCode;
  billing_cycle: BillingCycle;
  payment_method: PaymentMethod;
}

export interface RegisterMemberResponse {
  user_id: string;
  membership_id: string | null;
  payment_id: string;
  /** Magic link the receptionist can resend manually if WhatsApp failed. */
  welcome_link: string;
  init_point: string | null;
  sandbox_init_point?: string | null;
  amount_mxn: number;
}

export interface ExtendMembershipBody {
  user_id: string;
  plan?: PlanCode;
  billing_cycle?: BillingCycle;
  payment_method: PaymentMethod;
}

export interface ExtendMembershipResponse {
  user_id: string;
  membership_id: string | null;
  payment_id: string;
  init_point: string | null;
  amount_mxn: number;
}

export interface EnrollCourseBody {
  user_id: string;
  course_id: string;
  payment_method: PaymentMethod;
}

export interface EnrollCourseResponse {
  user_id: string;
  course_id: string;
  payment_id: string;
  init_point: string | null;
  amount_mxn: number;
}

export interface PosSaleBody {
  items: { sku: string; qty: number }[];
  user_id?: string;
  payer_email?: string;
  payment_method: PaymentMethod;
  notes?: string;
}

export interface PosSaleResponse {
  payment: { id: string; amount: number; status: string };
  total_mxn: number;
  receipt_url: string | null;
  init_point: string | null;
  sandbox_init_point: string | null;
}

export const staffPosApi = {
  searchMembers: (q: string) =>
    api
      .get<{ items: StaffMemberSearchResult[] }>('/staff/members/search', {
        params: { q },
      })
      .then((r) => r.data.items),

  productsMenu: () =>
    api.get<PosMenu>('/pos/products-menu').then((r) => r.data),

  sale: (body: PosSaleBody) =>
    api.post<PosSaleResponse>('/pos/sale', body).then((r) => r.data),

  registerMember: (body: RegisterMemberBody) =>
    api
      .post<RegisterMemberResponse>('/staff/register-member', body)
      .then((r) => r.data),

  extendMembership: (body: ExtendMembershipBody) =>
    api
      .post<ExtendMembershipResponse>('/staff/extend-membership', body)
      .then((r) => r.data),

  enrollCourse: (body: EnrollCourseBody) =>
    api
      .post<EnrollCourseResponse>('/staff/enroll-course', body)
      .then((r) => r.data),
};
