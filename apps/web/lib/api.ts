import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, AuthResponse } from './schemas';

/* =========================================================================
 * Token storage (localStorage + document.cookie for middleware)
 * =========================================================================*/

const ACCESS_KEY = 'cedgym_access_token';
const REFRESH_KEY = 'cedgym_refresh_token';
const SESSION_COOKIE = 'cedgym_session';
const ROLE_COOKIE = 'cedgym_role';

export const tokenStore = {
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: { access: string; refresh?: string }) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_KEY, tokens.access);
    if (tokens.refresh) {
      window.localStorage.setItem(REFRESH_KEY, tokens.refresh);
    }
    // Mirror to a non-HttpOnly cookie so Next.js middleware can see session.
    // NOTE: when backend is wired this should become an HttpOnly cookie set
    // by the API; this mirror is only for SPA-local gating.
    document.cookie = `${SESSION_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  },
  /**
   * Mirror the logged-in user's role into a non-HttpOnly cookie so the
   * edge middleware can gate /admin/* and /staff/* without a round-trip.
   * This is explicitly a "hack" — the real API should set this as an
   * HttpOnly signed cookie when JWTs are issued.
   */
  setRole(role: string | undefined | null) {
    if (typeof window === 'undefined') return;
    if (role) {
      document.cookie = `${ROLE_COOKIE}=${role}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    } else {
      document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  },
  getRoleFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp(`${ROLE_COOKIE}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  },
};

/* =========================================================================
 * Axios instance
 * =========================================================================*/

const baseURL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // envía refresh cookie al API
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token && config.headers) {
    config.headers.set?.('Authorization', `Bearer ${token}`);
  }
  return config;
});

/* Refresh lock so parallel 401s trigger only one refresh round-trip. */
let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  try {
    const { data } = await axios.post<AuthResponse>(
      `${baseURL}/auth/refresh`,
      { refresh_token: refresh },
      {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
      },
    );
    tokenStore.set({
      access: data.access_token,
      refresh: data.refresh_token,
    });
    return data.access_token;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      refreshing = refreshing ?? tryRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers?.set?.('Authorization', `Bearer ${newToken}`);
        return api.request(original);
      }
      // Refresh failed — sesión expirada. Limpiamos y forzamos re-login.
      tokenStore.clear();
      if (typeof window !== 'undefined') {
        const current = window.location.pathname + window.location.search;
        // Evita loop si ya estamos en /login
        if (!current.startsWith('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(current)}&expired=1`;
        }
      }
    }
    return Promise.reject(normalizeError(error));
  },
);

/**
 * Turn any thrown value into our flat `ApiError` shape so forms have a
 * single, predictable `.message` field to render.
 *
 * Call-sites routinely re-normalize inside `onError` handlers, and the
 * axios response interceptor also rejects with an already-normalized
 * `ApiError`. Both cases must fall through cleanly — otherwise the UI
 * was showing "Error desconocido" on any server error because the
 * second pass lost the original payload.
 */
export function normalizeError(err: unknown): ApiError {
  // Pass-through: already normalized by the response interceptor (or by
  // a caller further up the stack).
  if (isApiError(err)) return err;

  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    // The Fastify API returns `{ error: { code, message }, statusCode }`
    // (see errPayload() in apps/api/src/lib/errors.js). Some older
    // handlers return the flat `{ message, code }` shape, so we support
    // both to keep this resilient during the migration.
    const body = err.response?.data as
      | {
          message?: string;
          code?: string;
          details?: unknown;
          error?: { code?: string; message?: string };
        }
      | undefined;
    const nestedCode = body?.error?.code;
    const nestedMessage = body?.error?.message;

    // Network/offline: no response at all → give a user-friendly hint
    // rather than the raw axios string like "Network Error".
    const networkFallback =
      status === 0
        ? 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
        : 'Ocurrió un error. Intenta de nuevo en unos segundos.';

    return {
      status,
      code: body?.code ?? nestedCode,
      message:
        body?.message ??
        nestedMessage ??
        (err.message && err.message !== 'Network Error'
          ? err.message
          : networkFallback),
      details: body?.details,
    };
  }
  if (err instanceof Error) {
    return { status: 0, message: err.message };
  }
  return {
    status: 0,
    message: 'Ocurrió un error inesperado. Intenta de nuevo.',
  };
}

function isApiError(v: unknown): v is ApiError {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { message?: unknown }).message === 'string' &&
    typeof (v as { status?: unknown }).status === 'number' &&
    !(v instanceof Error) &&
    !axios.isAxiosError(v)
  );
}

/* =========================================================================
 * Auth API
 * =========================================================================*/

/**
 * OTP purpose the backend zod schema accepts. We surface a tight union
 * here so callers don't have to import the server types. Must stay in
 * sync with `resendSchema` in apps/api/src/routes/auth.js.
 */
export type OtpPurpose =
  | 'REGISTER'
  | 'PASSWORD_RESET'
  | 'LOGIN_2FA'
  | 'PHONE_CHANGE';

export const authApi = {
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => api.post<AuthResponse>('/auth/register', input).then((r) => r.data),

  // The backend route is `/auth/verify-register` (see routes/auth.js).
  // It issues access+refresh tokens on success and flips the user to ACTIVE.
  verifyOtp: (input: { phone: string; code: string }) =>
    api
      .post<AuthResponse>('/auth/verify-register', input)
      .then((r) => r.data),

  // `purpose` is REQUIRED by the backend zod schema. Defaults to REGISTER
  // so existing call-sites (verify page) keep working without a change.
  resendOtp: (input: { phone: string; purpose?: OtpPurpose }) =>
    api
      .post<{ ok: true }>('/auth/otp/resend', {
        phone: input.phone,
        purpose: input.purpose ?? 'REGISTER',
      })
      .then((r) => r.data),

  login: (input: { identifier: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', input).then((r) => r.data),

  me: () => api.get<{ user: import('./schemas').User }>('/auth/me').then((r) => r.data),

  forgotPassword: (input: { phone: string }) =>
    api
      .post<{ ok: true }>('/auth/password/forgot', input)
      .then((r) => r.data),

  // Backend zod schema expects `new_password` (snake_case). We accept
  // `password` at the call-site for ergonomic parity with the form, and
  // remap here.
  resetPassword: (input: {
    phone: string;
    code: string;
    password: string;
  }) =>
    api
      .post<{ ok: true }>('/auth/password/reset', {
        phone: input.phone,
        code: input.code,
        new_password: input.password,
      })
      .then((r) => r.data),

  // Magic-link reset. Reads (ref, token) out of the URL the admin
  // generated in /admin/miembros/:id/reset-password and asks the user
  // for the new password — no OTP code to type.
  resetPasswordViaLink: (input: {
    ref: string;
    token: string;
    password: string;
  }) =>
    api
      .post<{ success: true }>('/auth/password/reset-via-link', {
        ref: input.ref,
        token: input.token,
        new_password: input.password,
      })
      .then((r) => r.data),

  // Backend mounts this at PATCH /auth/complete-profile (not POST /auth/profile).
  // Body keys on the server use snake_case; we translate here so the FE
  // form can stay in camelCase.
  completeProfile: (
    input: import('./schemas').CompleteProfileInput,
  ) =>
    api
      .patch<{ success: true; user: import('./schemas').User }>(
        '/auth/complete-profile',
        {
          full_name: input.fullName,
          birth_date: input.birthDate,
          gender: mapGenderToApi(input.gender),
        },
      )
      .then((r) => r.data),
};

// FE enum is Spanish lowercase; backend enum is SCREAMING_SNAKE. Keep
// the translation local to the API layer so forms stay user-friendly.
function mapGenderToApi(g: import('./schemas').Gender): string {
  switch (g) {
    case 'masculino':
      return 'MALE';
    case 'femenino':
      return 'FEMALE';
    case 'otro':
      return 'OTHER';
    case 'prefiero_no_decir':
      return 'PREFER_NOT_SAY';
    default:
      return 'OTHER';
  }
}

/* =========================================================================
 * Products / Marketplace API
 * =========================================================================*/

import type {
  Badge,
  ChatConversation,
  ChatMessage,
  ClassSession,
  DashboardSummary,
  Measurement,
  Membership,
  PaymentHistoryItem,
  Product,
  ProductPurchase,
  ProductReview,
  QrTokenResponse,
} from './schemas';

export interface ProductListParams {
  sport?: string;
  level?: string;
  kind?: string;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  featured?: boolean;
  limit?: number;
  page?: number;
}

export const productsApi = {
  list: (params: ProductListParams = {}) =>
    api
      .get<{ items: Product[]; total: number; page: number; pageSize: number }>(
        '/products',
        {
          params: {
            ...params,
            featured: params.featured ? 1 : undefined,
          },
        },
      )
      .then((r) => r.data),

  get: (slugOrId: string) =>
    api
      .get<{ product: Product }>(`/products/${slugOrId}`)
      .then((r) => r.data.product),

  myPurchases: () =>
    api
      .get<{ items: ProductPurchase[] }>('/products/me/purchases')
      .then((r) => r.data.items),

  purchase: (id: string) =>
    api
      .get<{ purchase: ProductPurchase }>(`/products/me/purchases/${id}`)
      .then((r) => r.data.purchase),

  review: (productId: string, input: import('./schemas').ReviewInput) =>
    api
      .post<{ review: ProductReview }>(
        `/products/${productId}/reviews`,
        input,
      )
      .then((r) => r.data.review),
};

/* =========================================================================
 * Checkout / Promocodes API
 * =========================================================================*/

export interface CheckoutStartBody {
  productId?: string;
  membershipPlan?: string;
  cycle?: string;
  promocode?: string;
}

export interface CheckoutStartResponse {
  init_point: string;
  sandbox_init_point?: string;
  preference_id: string;
  amount_mxn: number;
  discount_mxn: number;
  total_mxn: number;
}

export const checkoutApi = {
  validatePromo: (body: {
    code: string;
    productId?: string;
    plan?: string;
  }) =>
    api
      .post<{
        valid: boolean;
        discount_mxn: number;
        discount_pct?: number;
        message?: string;
      }>('/promocodes/validate', body)
      .then((r) => r.data),

  start: (body: CheckoutStartBody) =>
    api
      .post<CheckoutStartResponse>('/checkout/start', body)
      .then((r) => r.data),

  summary: (
    kind: 'product' | 'membership' | 'course',
    id: string,
    cycle?: string,
  ) =>
    api
      .get<{
        title: string;
        subtitle?: string;
        cover_url?: string;
        price_mxn: number;
        original_price_mxn?: number;
        kind: string;
      }>('/checkout/summary', { params: { kind, id, cycle } })
      .then((r) => r.data),
};

/* =========================================================================
 * Portal / User / QR / Membership
 * =========================================================================*/

export const portalApi = {
  dashboard: () =>
    api.get<DashboardSummary>('/users/me/dashboard').then((r) => r.data),

  badges: () =>
    api.get<{ items: Badge[] }>('/users/me/badges').then((r) => r.data.items),

  qrToken: () =>
    api.get<QrTokenResponse>('/checkins/me/qr-token').then((r) => r.data),

  membership: () =>
    api
      .get<{ membership: Membership | null }>('/memberships/me')
      .then((r) => r.data.membership),

  paymentHistory: () =>
    api
      .get<{ items: PaymentHistoryItem[] }>('/memberships/me/payments')
      .then((r) => r.data.items),

  freezeMembership: (input: import('./schemas').FreezeMembershipInput) =>
    api.post<{ ok: true }>('/memberships/me/freeze', input).then((r) => r.data),

  measurements: () =>
    api
      .get<{ items: Measurement[] }>('/measurements/me')
      .then((r) => r.data.items),

  uploadProgressPhoto: (file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return api
      .post<{ url: string }>('/measurements/me/photos', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  exportData: () =>
    api
      .get<Blob>('/users/me/export', { responseType: 'blob' })
      .then((r) => r.data),

  deleteAccount: () =>
    api.delete<{ ok: true }>('/users/me').then((r) => r.data),

  updateProfile: (input: Record<string, unknown>) =>
    api.patch<{ ok: true }>('/users/me', input).then((r) => r.data),

  changePassword: (input: { current: string; next: string }) =>
    api
      .post<{ ok: true }>('/users/me/password', input)
      .then((r) => r.data),

  toggle2FA: (on: boolean) =>
    api
      .post<{ ok: true }>('/users/me/2fa', { enable: on })
      .then((r) => r.data),
};

/* =========================================================================
 * Classes
 * =========================================================================*/

export const classesApi = {
  list: (params: { from?: string; to?: string } = {}) =>
    api
      .get<{ items: ClassSession[] }>('/classes', { params })
      .then((r) => r.data.items),

  myBookings: () =>
    api
      .get<{ items: ClassSession[] }>('/classes/me/bookings')
      .then((r) => r.data.items),

  book: (classId: string) =>
    api.post<{ ok: true }>(`/classes/${classId}/book`).then((r) => r.data),

  cancel: (classId: string) =>
    api.delete<{ ok: true }>(`/classes/${classId}/book`).then((r) => r.data),
};

/* =========================================================================
 * Chat
 * =========================================================================*/

export const chatApi = {
  conversations: () =>
    api
      .get<{ items: ChatConversation[] }>('/chat/conversations')
      .then((r) => r.data.items),

  messages: (conversationId: string, params: { before?: string } = {}) =>
    api
      .get<{ items: ChatMessage[] }>(
        `/chat/conversations/${conversationId}/messages`,
        { params },
      )
      .then((r) => r.data.items),

  send: (conversationId: string, body: string) =>
    api
      .post<{ message: ChatMessage }>(
        `/chat/conversations/${conversationId}/messages`,
        { body },
      )
      .then((r) => r.data.message),

  markRead: (conversationId: string) =>
    api
      .post<{ ok: true }>(
        `/chat/conversations/${conversationId}/read`,
        {},
      )
      .then((r) => r.data),
};

/* =========================================================================
 * Courses (enrolled)
 * =========================================================================*/

export const coursesApi = {
  myCourses: () =>
    api
      .get<{
        items: {
          id: string;
          name: string;
          cover_url?: string;
          progress_pct: number;
          next_session_at?: string;
          weeks_total: number;
          weeks_done: number;
        }[];
      }>('/courses/me')
      .then((r) => r.data.items),
};
