/**
 * Thin typed wrappers around admin + staff endpoints. All calls go through
 * the shared axios instance (`lib/api.ts`) so JWT refresh + auth headers are
 * applied automatically.
 *
 * Every endpoint here follows the contract documented in ULTRAPLAN.md
 * (API blueprint). Where the backend has not yet shipped an endpoint, it's
 * marked with TODO and the call will surface as a 404 at runtime.
 */
import { api } from './api';
import { planDisplayName } from './utils';

/* =========================================================================
 * Types (frontend-side; server is source of truth)
 * =========================================================================*/

export interface AdminKpis {
  active_members: number;
  active_members_delta?: number;
  revenue_mtd: number;
  revenue_mtd_delta?: number;
  checkins_today: number;
  checkins_today_delta?: number;
  signups_mtd: number;
  signups_mtd_delta?: number;
  expiring_7d: number;
}

export interface RevenuePoint {
  bucket: string;
  amount_mxn: number;
}

export interface RetentionPoint {
  month: string;
  renewals_pct: number;
}

export interface CheckinHeatCell {
  day: number; // 0..6 (Mon=0)
  hour: number; // 0..23
  count: number;
}

export interface ChurnRiskMember {
  id: string;
  name: string;
  phone: string;
  expected_checkins: number;
  actual_checkins: number;
  attendance_pct: number;
  plan_name?: string;
  expires_at?: string;
}

export interface AdminMember {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: 'active' | 'frozen' | 'expired' | 'cancelled';
  plan_code?: string;
  plan_name?: string;
  expires_at?: string;
  last_checkin_at?: string;
  xp?: number;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminMembershipPlan {
  id: string;
  // Backend plan codes are UPPERCASE ('STARTER' | 'PRO' | 'ELITE').
  // `code` is only present when the admin endpoint exposes it — the
  // public /memberships/plans response does not, so we look up
  // `plan.id` (which equals the code) for the PATCH path.
  code?: 'STARTER' | 'PRO' | 'ELITE' | string;
  name: string;
  monthly_price_mxn: number;
  quarterly_price_mxn: number;
  // Backend zod schema uses `annual_price_mxn` (PATCH /admin/memberships/plans/:code).
  annual_price_mxn: number;
  features?: string[];
  enabled: boolean;
}

export interface MealPlanAddonPrice {
  price_mxn: number;
  default_price_mxn?: number;
  currency: string;
}

export interface AdminCourse {
  id: string;
  name: string;
  description?: string;
  sport?: string;
  trainer_id?: string;
  trainer_name?: string;
  capacity: number;
  price_mxn: number;
  starts_at?: string;
  ends_at?: string;
  schedule?:
    | { days: number[]; hour: string; duration_min: number }
    | { rows: { day: number; hour: string; duration_min: number }[] }
    | Record<string, unknown>;
  published: boolean;
  enrolled_count?: number;
}

export interface AdminPayment {
  id: string;
  user_id: string;
  user_name?: string | null;
  type:
    | 'MEMBERSHIP'
    | 'COURSE'
    | 'DIGITAL_PRODUCT'
    | 'SUPPLEMENT'
    | 'MEAL_PLAN_ADDON'
    | 'OTHER';
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELED'
    | 'REFUNDED';
  amount_mxn: number;
  // Only present when a promo was applied: `base_amount_mxn` is the
  // pre-discount price, `discount_mxn` the delta, `promo_code` the
  // code used. UI renders a strike-through + badge when these exist.
  base_amount_mxn?: number | null;
  discount_mxn?: number | null;
  promo_code?: string | null;
  // Method is a loose string; can be a card brand ('visa', 'master'…),
  // 'CARD', 'CASH', 'TRANSFER', 'TERMINAL', 'COURTESY_PROMO',
  // 'COMPLIMENTARY', or null.
  method?: string | null;
  mp_payment_id?: string | null;
  mp_status_detail?: string | null;
  reference?: string | null;
  description?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  kind: string;
  author_id?: string;
  author_name?: string;
  price_mxn: number;
  published: boolean;
  featured?: boolean;
  rejected?: boolean;
  rejected_reason?: string;
  cover_url?: string;
  description?: string;
  type?: 'ROUTINE' | 'NUTRITION_PLAN' | 'EBOOK' | 'VIDEO_COURSE' | 'BUNDLE';
  sport?: string;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  duration_weeks?: number | null;
  sale_price_mxn?: number | null;
  content?: ProductContent | Record<string, unknown>;
  video_urls?: string[];
  pdf_url?: string | null;
  sales_count?: number;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  price_mxn: number;
  cost_mxn?: number | null;
  stock: number;
  min_stock?: number;
  image_url?: string;
  description?: string | null;
  enabled: boolean;
}

// ─── Product content (routine editor JSON shape) ─────────────────
export interface RoutineExercise {
  name: string;
  sets?: number;
  reps?: string;
  notes?: string;
}
export interface RoutineDay {
  label?: string;
  exercises: RoutineExercise[];
}
export interface RoutineWeek {
  label?: string;
  days: RoutineDay[];
}
export interface ProductContent {
  weeks?: RoutineWeek[];
  [k: string]: unknown;
}

export interface AdminProductCreateInput {
  type: 'ROUTINE' | 'NUTRITION_PLAN' | 'EBOOK' | 'VIDEO_COURSE' | 'BUNDLE';
  title: string;
  description: string;
  sport?: string;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  duration_weeks?: number | null;
  price_mxn: number;
  sale_price_mxn?: number | null;
  cover_url?: string | null;
  content?: ProductContent | Record<string, unknown>;
  pdf_url?: string | null;
  video_urls?: string[];
  author_id?: string;
  published?: boolean;
  featured?: boolean;
}

export type AutomationActionType =
  | 'whatsapp.send_template'
  | 'push.notify'
  | 'email.send';

export interface Automation {
  id: string;
  name: string;
  trigger_event: string;
  filter?: Record<string, unknown>;
  delay_minutes: number;
  action_type: AutomationActionType;
  template_id?: string;
  enabled: boolean;
  created_at: string;
  last_run_at?: string;
  runs_24h?: number;
  failures_24h?: number;
}

export interface AutomationJob {
  id: string;
  automation_id: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  created_at: string;
  finished_at?: string;
  user_id?: string;
  user_name?: string;
  error?: string;
  payload?: Record<string, unknown>;
}

export interface MessageTemplate {
  id: string;
  code: string;
  name: string;
  channel: 'whatsapp' | 'push' | 'email';
  body: string;
  variables?: string[];
  updated_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_DAYS';
  value: number;
  applies_to: 'MEMBERSHIP' | 'PRODUCT' | 'ANY';
  max_uses?: number;
  used_count?: number;
  expires_at?: string;
  enabled: boolean;
}

export interface WhatsAppStatus {
  status: 'DISCONNECTED' | 'STARTING' | 'CONNECTED';
  phone_number?: string;
  last_activity_at?: string;
  qr_png_base64?: string;
}

export interface GymSettings {
  name: string;
  logo_url?: string;
  timezone: string;
  opening_hours?: Record<string, { open: string; close: string } | null>;
  mp_connected?: boolean;
  mp_public_key?: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'RECEPTIONIST' | 'TRAINER' | 'ADMIN' | 'SUPERADMIN';
  enabled: boolean;
}

// ─── Exercises ───────────────────────────────────────────────────
// String-literal unions (not Prisma enum types) so the frontend does
// not have to pull a runtime dependency on @prisma/client.
export type ExerciseMuscleGroup =
  | 'CHEST'
  | 'BACK'
  | 'LEGS'
  | 'SHOULDERS'
  | 'ARMS'
  | 'CORE'
  | 'FULL_BODY'
  | 'CARDIO';

export type ExerciseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface AdminExercise {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  muscle_group: ExerciseMuscleGroup;
  equipment: string[];
  level: ExerciseLevel;
  video_url: string | null;
  thumbnail_url: string | null;
  description: string | null;
  default_sets: number;
  default_reps: string;
  default_rest_sec: number;
  variant_easier_id: string | null;
  variant_harder_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminExerciseInput {
  name: string;
  slug?: string;
  muscle_group: ExerciseMuscleGroup;
  equipment: string[];
  level: ExerciseLevel;
  video_url?: string | null;
  thumbnail_url?: string | null;
  description?: string | null;
  default_sets?: number;
  default_reps?: string;
  default_rest_sec?: number;
  variant_easier_id?: string | null;
  variant_harder_id?: string | null;
  is_active?: boolean;
}

export interface ExerciseStats {
  by_muscle: Record<ExerciseMuscleGroup, number>;
  by_level: Record<ExerciseLevel, number>;
  total: number;
}

export interface ExerciseBulkImportResult {
  created: number;
  updated: number;
  errors: { index: number; error: string }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/* =========================================================================
 * Admin endpoints
 * =========================================================================*/

export const adminApi = {
  // Dashboard — mapea la respuesta del backend al shape que esperan los
  // componentes de la UI. El backend devuelve objetos con metadata +
  // array anidado; la UI pide arrays simples.
  kpis: () =>
    api.get<any>('/admin/dashboard/overview').then((r) => {
      const d = r.data ?? {};
      return {
        active_members: d.active_members ?? 0,
        revenue_mtd: d.revenue_mtd ?? d.total_revenue_mtd ?? 0,
        checkins_today: d.checkins_today ?? 0,
        signups_mtd: d.new_members_mtd ?? d.signups_mtd ?? 0,
        expiring_7d: d.expiring_7d ?? 0,
      } as AdminKpis;
    }),

  revenueSeries: (range: 'day' | 'week' | 'month') => {
    const groupBy = range === 'day' ? 'day' : range === 'week' ? 'week' : 'month';
    return api
      .get<any>('/admin/dashboard/revenue', { params: { groupBy } })
      .then((r) => {
        const series = r.data?.series ?? [];
        return series.map(
          (p: any): RevenuePoint => ({
            bucket: p.bucket,
            amount_mxn: Number(p.revenue_mxn ?? p.amount_mxn ?? 0),
          }),
        );
      });
  },

  retentionSeries: () =>
    api.get<any>('/admin/dashboard/retention').then((r) => {
      const d = r.data ?? {};
      // El backend actual devuelve un solo agregado {retention_rate,...}.
      // Lo envolvemos como 1 punto para que la UI no rompa.
      if (Array.isArray(d)) return d as RetentionPoint[];
      return [
        {
          month: d.period ?? 'periodo',
          renewals_pct: Math.round((d.retention_rate ?? 0) * 100),
        },
      ];
    }),

  checkinHeatmap: () =>
    api.get<any>('/admin/dashboard/heatmap').then((r) => {
      const matrix = r.data?.matrix ?? [];
      // Si el backend devuelve una matriz [day][hour], aplanamos a cells.
      if (Array.isArray(matrix) && Array.isArray(matrix[0])) {
        const cells: CheckinHeatCell[] = [];
        matrix.forEach((row: number[], day: number) => {
          row.forEach((count: number, hour: number) => {
            if (count > 0) cells.push({ day, hour, count });
          });
        });
        return cells;
      }
      return (matrix as CheckinHeatCell[]) ?? [];
    }),

  churnRisk: () =>
    api.get<any>('/admin/dashboard/churn-risk').then((r) => {
      const users = r.data?.users ?? [];
      const expected = r.data?.expected_checkins ?? 12;
      return users.map(
        (u: any): ChurnRiskMember => ({
          id: u.user_id ?? u.id,
          name: u.name ?? '—',
          phone: u.phone ?? '',
          expected_checkins: expected,
          actual_checkins: Number(u.check_ins ?? 0),
          attendance_pct: Math.round((Number(u.checkin_ratio ?? 0)) * 100),
          plan_name: planDisplayName(u.plan),
          expires_at: u.expires_at,
        }),
      );
    }),

  failedJobsCount: () =>
    api
      .get<any>('/admin/automations/jobs/failed-count')
      .then((r) => ({ count: Number(r.data?.count ?? 0) }))
      .catch(() => ({ count: 0 })),

  // Members — backend path is /admin/miembros (Spanish). We translate
  // UI-level {q,page,page_size} → API {search,limit,offset} and flatten
  // the nested `membership.*` into the AdminMember shape the UI expects.
  listMembers: (params: {
    q?: string;
    status?: string;
    plan?: string;
    page?: number;
    page_size?: number;
  }) => {
    const limit = params.page_size ?? 30;
    const page = params.page ?? 1;
    const offset = Math.max(0, (page - 1) * limit);
    const apiParams: Record<string, any> = {
      limit,
      offset,
      ...(params.q && { search: params.q }),
      ...(params.status && { status: params.status }),
      ...(params.plan && { plan: params.plan }),
    };
    return api
      .get<{ items: any[]; total: number; limit: number; offset: number }>(
        '/admin/miembros',
        { params: apiParams },
      )
      .then((r) => ({
        items: (r.data?.items ?? []).map(
          (u: any): AdminMember => ({
            id: u.id,
            name: u.full_name || u.name || '—',
            phone: u.phone ?? '',
            email: u.email ?? undefined,
            status: (u.membership?.status ?? u.status ?? 'expired').toLowerCase() as
              | 'active'
              | 'frozen'
              | 'expired'
              | 'cancelled',
            plan_code: u.membership?.plan,
            plan_name: planDisplayName(u.membership?.plan),
            expires_at: u.membership?.expires_at,
            last_checkin_at: u.last_checkin_at,
            xp: u.xp,
            created_at: u.created_at,
          }),
        ),
        total: r.data?.total ?? 0,
        page,
        page_size: limit,
      }));
  },
  getMember: (id: string) =>
    api.get<AdminMember & Record<string, unknown>>(`/admin/miembros/${id}`).then((r) => r.data),
  createMember: (input: {
    name: string;
    phone: string;
    email?: string;
    plan_code?: string;
  }) => api.post<AdminMember>('/admin/miembros', input).then((r) => r.data),
  suspendMember: (id: string) =>
    api.post(`/admin/miembros/${id}/suspend`).then((r) => r.data),
  reactivateMember: (id: string) =>
    api.post(`/admin/miembros/${id}/reactivate`).then((r) => r.data),
  resetMemberPassword: (id: string) =>
    api.post(`/admin/miembros/${id}/reset-password`).then((r) => r.data),
  deleteMember: (id: string) =>
    // Fastify rechaza DELETE con Content-Type: application/json y body
    // vacío; mandamos {} explícito para evitar FST_ERR_CTP_EMPTY_JSON_BODY.
    api.delete(`/admin/miembros/${id}`, { data: {} }).then((r) => r.data),
  memberQrPng: (id: string) =>
    api
      .get<{ url: string; token: string; expires_in: number; name?: string }>(
        `/admin/miembros/${id}/qr`,
      )
      .then((r) => r.data),
  // Carnet PDF: abrimos vía navegador con blob para poder previsualizar.
  memberCarnetPdf: async (id: string) => {
    const r = await api.get(`/admin/miembros/${id}/carnet.pdf`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(r.data as Blob);
    return { url };
  },
  sendManualWhatsapp: (id: string, body: string) =>
    api
      .post(`/admin/miembros/${id}/whatsapp`, { message: body })
      .then((r) => r.data),
  exportMembersCsv: () =>
    api
      .get<{ url: string }>('/admin/members/export.csv')
      .then((r) => r.data),

  // Memberships
  listMembershipPlans: () =>
    api.get<any>('/memberships/plans').then((r) => {
      const d: any = r.data;
      return Array.isArray(d) ? d : (d?.plans ?? d?.items ?? []);
    }),
  updateMembershipPlan: (id: string, patch: Partial<AdminMembershipPlan>) => {
    // Backend zod schema is strict and only accepts these four keys.
    // The list endpoint returns extra fields (name, tagline, features…)
    // that would fail zod's .strict() check, so we whitelist here.
    const body: Record<string, unknown> = {};
    if (typeof patch.monthly_price_mxn === 'number')
      body.monthly_price_mxn = patch.monthly_price_mxn;
    if (typeof patch.quarterly_price_mxn === 'number')
      body.quarterly_price_mxn = patch.quarterly_price_mxn;
    if (typeof patch.annual_price_mxn === 'number')
      body.annual_price_mxn = patch.annual_price_mxn;
    if (typeof patch.enabled === 'boolean') body.enabled = patch.enabled;
    return api
      .patch(`/admin/memberships/plans/${id}`, body)
      .then((r) => r.data);
  },

  // Meal-plan add-on (one-time $499 unlock). KV-backed, admin-editable.
  getMealPlanAddonPrice: () =>
    api
      .get<MealPlanAddonPrice>('/admin/addons/meal-plan/price')
      .then((r) => r.data),
  updateMealPlanAddonPrice: (priceMxn: number) =>
    api
      .patch<{ success: boolean; price_mxn: number; currency: string }>(
        '/admin/addons/meal-plan/price',
        { price_mxn: priceMxn },
      )
      .then((r) => r.data),
  // Memberships admin list reuses /admin/miembros (backend source of truth
  // for member+membership joined rows). Backend returns `items` with
  // `membership.plan/status/expires_at` nested — we flatten to the
  // AdminMember shape the table expects.
  listActiveMemberships: (params: { q?: string; plan?: string; page?: number }) => {
    const limit = 30;
    const page = params.page ?? 1;
    const offset = Math.max(0, (page - 1) * limit);
    const apiParams: Record<string, any> = {
      limit,
      offset,
      ...(params.q && { search: params.q }),
      ...(params.plan && { plan: params.plan }),
    };
    return api
      .get<{ items: any[]; total: number; limit: number; offset: number }>(
        '/admin/miembros',
        { params: apiParams },
      )
      .then((r) => ({
        items: (r.data?.items ?? []).map(
          (u: any): AdminMember => ({
            id: u.id,
            name: u.full_name || u.name || '—',
            phone: u.phone ?? '',
            email: u.email ?? undefined,
            status: (u.membership?.status ?? 'expired').toLowerCase() as
              | 'active'
              | 'frozen'
              | 'expired'
              | 'cancelled',
            plan_code: u.membership?.plan,
            plan_name: planDisplayName(u.membership?.plan),
            expires_at: u.membership?.expires_at,
            last_checkin_at: u.last_checkin_at,
            xp: u.xp,
            created_at: u.created_at,
          }),
        ),
        total: r.data?.total ?? 0,
        page,
        page_size: limit,
      }));
  },
  broadcastMembershipReminder: (memberIds: string[]) =>
    api
      .post('/admin/memberships/broadcast', { member_ids: memberIds })
      .then((r) => r.data),
  deleteMembership: (id: string, reason?: string) =>
    api
      .delete(`/admin/memberships/${id}`, {
        data: reason ? { reason } : {},
      })
      .then((r) => r.data),
  /**
   * Soft-cancel a membership (keeps the row + history for audit).
   * Sets status=CANCELED and expires_at=now so the member loses
   * access immediately but the record stays visible in reports.
   */
  cancelMembership: (id: string) =>
    api
      .patch(`/admin/memberships/${id}`, {
        status: 'CANCELED',
        expires_at: new Date().toISOString(),
        auto_renew: false,
      })
      .then((r) => r.data),
  listAuditLog: (params?: {
    limit?: number;
    action?: string;
    actor?: string;
    target?: string;
  }) =>
    api
      .get<{ items: AuditEntry[]; total: number; limit: number }>(
        '/admin/audit',
        { params },
      )
      .then((r) => r.data),

  // Courses
  listCourses: () =>
    api.get<AdminCourse[] | { courses: AdminCourse[] }>('/admin/courses').then((r) => {
      const d: any = r.data;
      if (Array.isArray(d)) return d as AdminCourse[];
      return (d?.courses ?? d?.items ?? []) as AdminCourse[];
    }),
  createCourse: (input: Partial<AdminCourse> & { name: string }) =>
    api.post<{ course: AdminCourse } | AdminCourse>('/admin/courses', input).then((r) => {
      const d: any = r.data;
      return (d?.course ?? d) as AdminCourse;
    }),
  updateCourse: (id: string, patch: Partial<AdminCourse>) =>
    api.patch<{ course: AdminCourse } | AdminCourse>(`/admin/courses/${id}`, patch).then((r) => {
      const d: any = r.data;
      return (d?.course ?? d) as AdminCourse;
    }),
  deleteCourse: (id: string) =>
    api.delete(`/admin/courses/${id}`).then((r) => r.data),
  getCourse: (id: string) =>
    api.get<AdminCourse & { enrolled: AdminMember[] }>(`/admin/courses/${id}`).then((r) => r.data),
  publishCourse: (id: string, publish: boolean) =>
    api
      .post(`/admin/courses/${id}/${publish ? 'publish' : 'unpublish'}`)
      .then((r) => r.data),
  courseEnrollments: (id: string) =>
    api
      .get<{
        total: number;
        enrollments: {
          user: { id: string; name?: string; full_name?: string; email?: string; phone?: string };
          payment_id: string;
          amount_mxn: number;
          paid_at?: string;
        }[];
      }>(`/admin/courses/${id}/enrollments`)
      .then((r) => r.data),

  // Payments
  listPayments: (params: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    user_id?: string;
    page?: number;
  }) =>
    api.get<any>('/admin/payments', { params }).then((r) => {
      const d: any = r.data;
      return {
        items: (Array.isArray(d) ? d : d?.payments ?? d?.items ?? []) as AdminPayment[],
        total: d?.total ?? 0,
        page: d?.page ?? params.page ?? 1,
        page_size: d?.limit ?? 50,
      };
    }),
  paymentsSeries: (range: 'day' | 'week' | 'month') =>
    api
      .get<RevenuePoint[]>('/admin/payments/series', { params: { range } })
      .then((r) => r.data)
      .catch(() => [] as RevenuePoint[]),
  exportPaymentsCsv: (params: Record<string, unknown>) =>
    api
      .get<{ url: string }>('/admin/payments/export.csv', { params })
      .then((r) => r.data),
  // TODO: endpoint not yet implemented on backend
  refundPayment: (id: string) =>
    api.post(`/admin/payments/${id}/refund`).then((r) => r.data),
  // Admin-only: seeds 4 demo payments (full card, discount, 100%-off,
  // add-on). Backend tags them with metadata.demo=true and wipes
  // existing demo rows before inserting so it's idempotent.
  seedDemoPayments: () =>
    api
      .post<{ created: number }>('/admin/payments/_seed_demo')
      .then((r) => r.data),

  // Marketplace approval
  listProducts: (tab: 'pending' | 'published' | 'rejected') =>
    api
      .get<Paginated<AdminProduct>>('/admin/products', { params: { tab } })
      .then((r) => r.data),
  approveProduct: (id: string) =>
    api.post(`/admin/products/${id}/approve`).then((r) => r.data),
  rejectProduct: (id: string, reason: string) =>
    api
      .post(`/admin/products/${id}/reject`, { reason })
      .then((r) => r.data),
  featureProduct: (id: string, featured: boolean) =>
    api
      .post(`/admin/products/${id}/${featured ? 'feature' : 'unfeature'}`)
      .then((r) => r.data),
  createAdminProduct: (input: AdminProductCreateInput) =>
    api
      .post<{ product: AdminProduct }>('/admin/products/create', input)
      .then((r) => r.data?.product ?? ((r.data as any) as AdminProduct)),
  updateAdminProduct: (id: string, patch: Partial<AdminProductCreateInput>) =>
    api
      .patch<{ product: AdminProduct }>(`/admin/products/${id}`, patch)
      .then((r) => r.data?.product ?? ((r.data as any) as AdminProduct)),
  topSellingProducts: () =>
    api
      .get<any>('/admin/products/top')
      .then((r) => {
        const d: any = r.data;
        return (Array.isArray(d) ? d : d?.products ?? d?.items ?? []) as AdminProduct[];
      })
      .catch(() => [] as AdminProduct[]),
  payoutsPending: () =>
    api
      .get<
        {
          trainer_id: string;
          trainer_name: string;
          amount_mxn: number;
          orders: number;
        }[]
      >('/admin/products/payouts-pending')
      .then((r) => r.data),

  // Inventory — API uses `sku` as the stable key (not a UUID id). We
  // fall back to `id` when present so the frontend can keep using an
  // identifier-agnostic shape. The list endpoint lives at `/inventory`
  // (staff + admin); admin-only writes go through `/admin/inventory/*`.
  listInventory: () =>
    api
      .get<InventoryItem[] | { items: InventoryItem[] }>('/inventory')
      .then((r) => {
        const d: any = r.data;
        const arr: InventoryItem[] = Array.isArray(d)
          ? d
          : (d?.items ?? []);
        return arr.map((it) => ({ ...it, id: it.id ?? it.sku }));
      }),
  createInventoryItem: (input: Omit<InventoryItem, 'id'>) =>
    api
      .post<{ item: InventoryItem } | InventoryItem>('/admin/inventory', input)
      .then((r) => {
        const d: any = r.data;
        const item: InventoryItem = d?.item ?? d;
        return { ...item, id: item.id ?? item.sku };
      }),
  updateInventoryItem: (sku: string, patch: Partial<InventoryItem>) =>
    api
      .patch<{ item: InventoryItem } | InventoryItem>(
        `/admin/inventory/${sku}`,
        patch,
      )
      .then((r) => {
        const d: any = r.data;
        const item: InventoryItem = d?.item ?? d;
        return { ...item, id: item.id ?? item.sku };
      }),
  adjustStock: (sku: string, delta: number, reason?: string) =>
    api
      .post<{ item: InventoryItem }>(`/admin/inventory/${sku}/stock`, {
        delta,
        reason,
      })
      .then((r) => r.data),
  inventoryAudit: (sku: string) =>
    api
      .get<{
        sku: string;
        audit: {
          at: string;
          delta: number;
          new_stock: number;
          reason?: string | null;
          source?: string;
        }[];
      }>(`/admin/inventory/${sku}/audit`)
      .then((r) => r.data),

  // Automations — backend returns { automations, total, known_triggers, actions, ... }
  // so unwrap to the array the UI expects.
  listAutomations: () =>
    api
      .get<{ automations?: Automation[] } | Automation[]>('/admin/automations')
      .then((r) => {
        const d: any = r.data;
        if (Array.isArray(d)) return d as Automation[];
        return (d?.automations ?? d?.items ?? []) as Automation[];
      }),
  getAutomation: (id: string) =>
    api.get<Automation>(`/admin/automations/${id}`).then((r) => r.data),
  createAutomation: (
    input: Omit<Automation, 'id' | 'created_at' | 'last_run_at' | 'runs_24h' | 'failures_24h'>,
  ) => api.post<Automation>('/admin/automations', input).then((r) => r.data),
  updateAutomation: (id: string, patch: Partial<Automation>) =>
    api.patch(`/admin/automations/${id}`, patch).then((r) => r.data),
  deleteAutomation: (id: string) =>
    api.delete(`/admin/automations/${id}`).then((r) => r.data),
  automationJobs: (id: string) =>
    api
      .get<AutomationJob[]>(`/admin/automations/${id}/jobs`)
      .then((r) => r.data),
  automationTriggers: () =>
    api
      .get<{ event: string; description: string }[]>(
        '/admin/automations/triggers',
      )
      .then((r) => r.data),

  // Templates
  listTemplates: () =>
    api.get<any>('/admin/templates').then((r) => {
      const d: any = r.data;
      return (Array.isArray(d) ? d : d?.templates ?? d?.items ?? []) as MessageTemplate[];
    }),
  createTemplate: (input: Omit<MessageTemplate, 'id' | 'updated_at'>) =>
    api.post<MessageTemplate>('/admin/templates', input).then((r) => r.data),
  updateTemplate: (id: string, patch: Partial<MessageTemplate>) =>
    api.patch(`/admin/templates/${id}`, patch).then((r) => r.data),
  deleteTemplate: (id: string) =>
    api.delete(`/admin/templates/${id}`).then((r) => r.data),
  previewTemplate: (id: string, context?: Record<string, unknown>) =>
    api
      .post<{ preview: string }>(`/admin/templates/${id}/preview`, {
        context,
      })
      .then((r) => r.data),

  // WhatsApp
  whatsappStatus: () =>
    api.get<WhatsAppStatus>('/admin/whatsapp/status').then((r) => r.data),
  whatsappStart: () =>
    api.post('/admin/whatsapp/start').then((r) => r.data),
  whatsappLogout: () =>
    api.post('/admin/whatsapp/logout').then((r) => r.data),
  whatsappMessages7d: () =>
    api
      .get<{ day: string; count: number }[]>('/admin/whatsapp/messages-7d')
      .then((r) => r.data),
  whatsappRecent: () =>
    api
      .get<
        {
          id: string;
          to: string;
          body: string;
          template?: string;
          status: string;
          sent_at: string;
        }[]
      >('/admin/whatsapp/recent')
      .then((r) => r.data),

  // Promocodes
  listPromocodes: () =>
    api.get<any>('/admin/promocodes').then((r) => {
      const d: any = r.data;
      return (Array.isArray(d) ? d : d?.promocodes ?? d?.items ?? []) as PromoCode[];
    }),
  createPromocode: (input: Omit<PromoCode, 'id' | 'used_count'>) =>
    api.post<PromoCode>('/admin/promocodes', input).then((r) => r.data),
  updatePromocode: (id: string, patch: Partial<PromoCode>) =>
    api.patch(`/admin/promocodes/${id}`, patch).then((r) => r.data),
  deletePromocode: (id: string) =>
    api.delete(`/admin/promocodes/${id}`).then((r) => r.data),
  promocodeStats: (id: string) =>
    api
      .get<{
        total_uses: number;
        revenue_mxn: number;
        by_day: { day: string; uses: number }[];
      }>(`/admin/promocodes/${id}/stats`)
      .then((r) => r.data),

  // Reports
  report: (kind: string, params?: Record<string, unknown>) =>
    api
      .get<{ url: string }>(`/admin/reports/${kind}`, { params })
      .then((r) => r.data),

  // Settings
  getSettings: () =>
    api.get<any>('/admin/workspace').then((r) => {
      const d: any = r.data;
      return (d?.workspace ?? d ?? {}) as GymSettings;
    }),
  updateSettings: (patch: Partial<GymSettings>) =>
    api.patch('/admin/workspace', patch).then((r) => r.data),
  listStaff: () =>
    api.get<any>('/admin/staff').then((r) => {
      const d: any = r.data;
      return (Array.isArray(d) ? d : d?.staff ?? d?.items ?? []) as StaffUser[];
    }),
  createStaff: (input: Omit<StaffUser, 'id' | 'enabled'>) =>
    api.post<StaffUser>('/admin/staff', input).then((r) => r.data),
  updateStaff: (id: string, patch: Partial<StaffUser>) =>
    api.patch(`/admin/staff/${id}`, patch).then((r) => r.data),

  // Exercises — admin CRUD over the shared Exercise library that powers
  // the AI routine builder. Backend returns the Prisma row shape
  // directly; no unwrapping needed except where noted.
  listExercises: (params?: {
    muscle_group?: ExerciseMuscleGroup;
    level?: ExerciseLevel;
    equipment?: string; // CSV
    q?: string;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const apiParams: Record<string, unknown> = {};
    if (params?.muscle_group) apiParams.muscle_group = params.muscle_group;
    if (params?.level) apiParams.level = params.level;
    if (params?.equipment) apiParams.equipment = params.equipment;
    if (params?.q) apiParams.q = params.q;
    if (params?.is_active !== undefined) apiParams.is_active = String(params.is_active);
    if (params?.page) apiParams.page = params.page;
    if (params?.limit) apiParams.limit = params.limit;
    return api
      .get<{ items: AdminExercise[]; total: number; page: number; limit: number }>(
        '/admin/exercises',
        { params: apiParams },
      )
      .then((r) => r.data);
  },
  createExercise: (input: AdminExerciseInput) =>
    api.post<AdminExercise>('/admin/exercises', input).then((r) => r.data),
  updateExercise: (id: string, patch: Partial<AdminExerciseInput>) =>
    api.patch<AdminExercise>(`/admin/exercises/${id}`, patch).then((r) => r.data),
  deleteExercise: (id: string) =>
    // Match deleteMember's explicit empty body (Fastify rejects DELETE
    // with Content-Type: application/json and no body).
    api
      .delete<{ success: boolean }>(`/admin/exercises/${id}`, { data: {} })
      .then((r) => r.data),
  bulkImportExercises: (exercises: AdminExerciseInput[]) =>
    api
      .post<ExerciseBulkImportResult>('/admin/exercises/bulk-import', { exercises })
      .then((r) => r.data),
  getExerciseStats: () =>
    api.get<ExerciseStats>('/admin/exercises/stats').then((r) => r.data),
};

/* =========================================================================
 * Staff endpoints
 * =========================================================================*/

export interface StaffCheckinResult {
  ok: boolean;
  reason?: string;
  member?: {
    id: string;
    name: string;
    avatar_url?: string;
    plan_name?: string;
    expires_at?: string;
    current_streak_days?: number;
    next_badge?: { name: string; target_days: number };
  };
}

export const staffApi = {
  scan: (token: string) =>
    api
      .post<StaffCheckinResult>('/checkins/scan', { token })
      .then((r) => r.data),
  todayCount: () =>
    api
      .get<{ count: number }>('/staff/checkins/today-count')
      .then((r) => r.data),
  recentScans: () =>
    api
      .get<
        {
          id: string;
          member_name: string;
          status: 'ok' | 'denied';
          reason?: string;
          created_at: string;
        }[]
      >('/staff/checkins/recent')
      .then((r) => r.data),
  search: (q: string) =>
    api
      .get<AdminMember[]>('/staff/members/search', { params: { q } })
      .then((r) => r.data),
  manualCheckin: (memberId: string) =>
    api
      .post<StaffCheckinResult>('/staff/checkins/manual', {
        member_id: memberId,
      })
      .then((r) => r.data),

  // POS
  posCheckout: (input: {
    items: { inventory_id: string; qty: number }[];
    method: 'CASH' | 'CARD' | 'MP_LINK';
    member_id?: string;
  }) =>
    api
      .post<{
        sale_id: string;
        total_mxn: number;
        mp_init_point?: string;
      }>('/staff/pos/sale', input)
      .then((r) => r.data),

};
