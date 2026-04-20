import { z } from 'zod';

/* =========================================================================
 * Shared primitives
 * =========================================================================*/

/** Mexican phone input format: 10 digits; we always prefix +52 on submit. */
export const mxPhoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Ingresa 10 dígitos sin espacios');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electrónico inválido');

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Incluye al menos una letra mayúscula')
  .regex(/[0-9]/, 'Incluye al menos un número');

export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'El código debe tener 6 dígitos');

/* =========================================================================
 * Auth schemas
 * =========================================================================*/

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nombre demasiado corto').max(80),
  email: emailSchema,
  phone: mxPhoneSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Ingresa tu teléfono o correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  phone: mxPhoneSchema,
  code: otpSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({
  phone: mxPhoneSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    phone: mxPhoneSchema,
    code: otpSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* =========================================================================
 * Complete profile
 * =========================================================================*/

export const genderEnum = z.enum([
  'masculino',
  'femenino',
  'otro',
  'prefiero_no_decir',
]);
export type Gender = z.infer<typeof genderEnum>;

export const relationshipEnum = z.enum([
  'padre',
  'madre',
  'hermano',
  'pareja',
  'amigo',
  'tutor',
  'otro',
]);
export type Relationship = z.infer<typeof relationshipEnum>;

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(2, 'Nombre requerido'),
  relationship: relationshipEnum,
  phone: mxPhoneSchema,
  medical_notes: z.string().trim().max(500).optional(),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const completeProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Nombre completo requerido'),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
    gender: genderEnum,
    emergencyContact: emergencyContactSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const today = new Date();
    const d = new Date(v.birthDate);
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
    if (age < 18 && !v.emergencyContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContact'],
        message: 'Contacto de emergencia requerido para menores de 18 años',
      });
    }
  });
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

/* =========================================================================
 * Checkout + Promo schemas
 * =========================================================================*/

export const promocodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'Código demasiado corto')
    .max(24, 'Código demasiado largo'),
});
export type PromocodeInput = z.infer<typeof promocodeSchema>;

export const checkoutBillingCycleEnum = z.enum([
  'monthly',
  'quarterly',
  'yearly',
]);
export type BillingCycle = z.infer<typeof checkoutBillingCycleEnum>;

/* =========================================================================
 * Measurements (read-only on FE; added for shape)
 * =========================================================================*/

export const measurementSchema = z.object({
  id: z.string(),
  date: z.string(),
  weight_kg: z.number().optional(),
  body_fat_pct: z.number().optional(),
  waist_cm: z.number().optional(),
  chest_cm: z.number().optional(),
  hip_cm: z.number().optional(),
  arm_cm: z.number().optional(),
  thigh_cm: z.number().optional(),
  note: z.string().optional(),
});
export type Measurement = z.infer<typeof measurementSchema>;

/* =========================================================================
 * Class booking schema
 * =========================================================================*/

export const classBookingSchema = z.object({
  classId: z.string().min(1),
});
export type ClassBookingInput = z.infer<typeof classBookingSchema>;

/* =========================================================================
 * Review schema
 * =========================================================================*/

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(4, 'Mínimo 4 caracteres').max(80),
  body: z.string().trim().min(10, 'Mínimo 10 caracteres').max(1000),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/* =========================================================================
 * Freeze membership
 * =========================================================================*/

export const freezeReasonEnum = z.enum([
  'lesion',
  'viaje',
  'trabajo',
  'economico',
  'otro',
]);

export const freezeMembershipSchema = z.object({
  reason: freezeReasonEnum,
  days: z.number().int().min(7).max(30),
  note: z.string().max(280).optional(),
});
export type FreezeMembershipInput = z.infer<typeof freezeMembershipSchema>;

/* =========================================================================
 * Change password / phone
 * =========================================================================*/

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Ingresa tu contraseña actual'),
    next: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changePhoneSchema = z.object({
  phone: mxPhoneSchema,
  code: otpSchema.optional(),
});
export type ChangePhoneInput = z.infer<typeof changePhoneSchema>;

/* =========================================================================
 * API response types
 * =========================================================================*/

export type UserRole =
  | 'ATHLETE'
  | 'RECEPTIONIST'
  | 'TRAINER'
  | 'ADMIN'
  | 'SUPERADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  verified: boolean;
  profile_completed?: boolean;
  avatar_url?: string;
  created_at: string;
  role?: UserRole;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token?: string;
}

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
}

/* =========================================================================
 * Domain types (marketplace / portal)
 * =========================================================================*/

export type ProductKind =
  | 'ROUTINE'
  | 'NUTRITION_PLAN'
  | 'COURSE'
  | 'MEMBERSHIP';

export type ProductLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ProductAuthor {
  id: string;
  name: string;
  avatar_url?: string;
  bio?: string;
}

export interface ProductReview {
  id: string;
  user_name: string;
  user_avatar?: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description?: string;
  kind: ProductKind;
  sport?: string;
  level?: ProductLevel;
  cover_url?: string;
  price_mxn: number;
  weeks?: number;
  featured?: boolean;
  rating_avg?: number;
  rating_count?: number;
  author?: ProductAuthor;
  reviews?: ProductReview[];
  preview_weeks?: ProductWeek[];
  purchased?: boolean;
  purchase_id?: string;
}

export interface ProductExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  rest_sec?: number;
  video_url?: string;
  notes?: string;
}

export interface ProductDay {
  id: string;
  day_index: number;
  title: string;
  exercises: ProductExercise[];
}

export interface ProductWeek {
  id: string;
  week_index: number;
  title?: string;
  locked?: boolean;
  days: ProductDay[];
}

export interface ProductPurchase {
  id: string;
  product: Product;
  purchased_at: string;
  progress_pct?: number;
  current_week?: number;
  weeks: ProductWeek[];
}

/* =========================================================================
 * Membership / Dashboard / QR
 * =========================================================================*/

export interface Membership {
  id: string;
  plan_name: string;
  plan_code: 'starter' | 'pro' | 'elite' | string;
  cycle: BillingCycle;
  price_mxn: number;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'frozen' | 'expired' | 'cancelled';
  days_remaining: number;
  days_total: number;
  renewal_price_mxn?: number;
  renewal_discount_pct?: number;
  renewal_eligible?: boolean;
}

export interface PaymentHistoryItem {
  id: string;
  date: string;
  concept: string;
  method: string;
  amount_mxn: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
}

export interface StreakInfo {
  current_streak_days: number;
  longest_streak_days: number;
  next_badge?: { name: string; target_days: number };
}

export interface Badge {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  earned: boolean;
  earned_at?: string;
  progress_pct?: number;
}

export interface CheckinPoint {
  date: string;
  count: number;
}

export interface DashboardSummary {
  streak: StreakInfo;
  xp: number;
  level: number;
  monthly_checkins: number;
  checkins_30d: CheckinPoint[];
  next_booked_class?: {
    id: string;
    name: string;
    starts_at: string;
    coach_name?: string;
  };
}

export interface QrTokenResponse {
  token: string;
  expires_at: string;
}

/* =========================================================================
 * Classes
 * =========================================================================*/

export interface ClassSession {
  id: string;
  name: string;
  coach_name?: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  booked_by_me?: boolean;
  cancellable_until?: string;
}

/* =========================================================================
 * Chat
 * =========================================================================*/

export interface ChatConversation {
  id: string;
  title: string;
  peer_name: string;
  peer_avatar?: string;
  last_message_preview?: string;
  last_message_at?: string;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  attachment_url?: string;
  created_at: string;
  is_mine?: boolean;
}
