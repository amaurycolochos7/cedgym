/**
 * Thin typed wrappers around trainer-portal endpoints. All calls go through
 * the shared axios instance (`lib/api.ts`) so JWT refresh + auth headers are
 * applied automatically.
 *
 * Endpoint owners:
 *   - /trainer/me/*            live in apps/api/src/routes/trainer.js
 *   - /products/me/authored    lives in apps/api/src/routes/products.js
 *   - POST /products           lives in apps/api/src/routes/products.js
 *   - PATCH /products/:id      lives in apps/api/src/routes/products.js
 */
import { api } from './api';

/* =========================================================================
 * Types (frontend-side; server is source of truth)
 * =========================================================================*/

export interface TrainerDashboardResponse {
  published_products: number;
  sales_mtd: number;
  sales_mtd_mxn?: number;
  pending_payout_mxn: number;
  athletes_count: number;
  sales_last_30_days: { day: string; amount_mxn: number; count: number }[];
}

export interface TrainerProduct {
  id: string;
  workspace_id?: string;
  type: string;
  title: string;
  slug: string;
  description: string;
  cover_url?: string | null;
  sport?: string | null;
  level: string;
  duration_weeks?: number | null;
  price_mxn: number;
  sale_price_mxn?: number | null;
  author_id: string;
  revenue_split?: number;
  content: unknown;
  pdf_url?: string | null;
  video_urls?: string[];
  published: boolean;
  featured?: boolean;
  rating_avg?: number;
  rating_count?: number;
  sales_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TrainerSale {
  purchase_id: string;
  product: { id: string; title: string; slug: string };
  user: {
    id: string;
    name: string;
    full_name?: string | null;
    email: string;
  };
  price_paid_mxn: number;
  author_payout_mxn: number;
  purchased_at: string;
  status?: string;
}

export interface TrainerSalesResponse {
  totals: {
    gross_mxn: number;
    my_payout_mxn: number;
    gym_revenue_mxn: number;
    pending_payout_mxn: number;
    paid_payout_mxn: number;
  };
  sales: TrainerSale[];
  products_summary: {
    id: string;
    title: string;
    rating_avg: number;
    rating_count: number;
    sales_count: number;
  }[];
}

export interface TrainerAthlete {
  id: string;
  name: string;
  full_name?: string | null;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  source: 'product';
  last_interaction_at?: string | null;
  total_spent_mxn: number;
}

export interface CreateProductBody {
  type: 'ROUTINE' | 'NUTRITION_PLAN' | 'EBOOK' | 'VIDEO_COURSE' | 'BUNDLE';
  title: string;
  slug?: string;
  description: string;
  cover_url?: string;
  sport?: string;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  duration_weeks?: number;
  price_mxn: number;
  sale_price_mxn?: number | null;
  content: unknown;
  pdf_url?: string;
  video_urls?: string[];
}

export type UpdateProductBody = Partial<CreateProductBody>;

/* =========================================================================
 * API
 * =========================================================================*/

export const trainerApi = {
  dashboard: () =>
    api.get<TrainerDashboardResponse>('/trainer/me/dashboard').then((r) => r.data),

  products: () =>
    api
      .get<{ products: TrainerProduct[] }>('/products/me/authored')
      .then((r) => r.data.products),

  getProduct: (id: string) =>
    api
      .get<{ product: TrainerProduct }>(`/products/${id}?as=author`)
      .then((r) => r.data.product)
      .catch(async () => {
        // Fallback — some products lookup-by-slug only. Use authored list.
        const all = await trainerApi.products();
        const hit = all.find((p) => p.id === id);
        if (!hit) throw new Error('Producto no encontrado');
        return hit;
      }),

  sales: (params?: { from?: string; to?: string; product_id?: string }) =>
    api
      .get<TrainerSalesResponse>('/trainer/me/sales', { params })
      .then((r) => r.data),

  athletes: () =>
    api
      .get<{ athletes: TrainerAthlete[] }>('/trainer/me/athletes')
      .then((r) => r.data.athletes),

  createProduct: (body: CreateProductBody) =>
    api
      .post<{ product: TrainerProduct }>('/products', body)
      .then((r) => r.data.product),

  updateProduct: (id: string, body: UpdateProductBody) =>
    api
      .patch<{ product: TrainerProduct }>(`/products/${id}`, body)
      .then((r) => r.data.product),
};
