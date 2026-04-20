# @cedgym/web

Frontend Next.js 14 de CED·GYM. App Router + TypeScript + Tailwind + shadcn-style UI.
Incluye el flujo completo de autenticación (registro en 3 pasos con OTP WhatsApp,
login, recuperación de contraseña).

## Stack

- Next.js 14 (App Router)
- TypeScript estricto
- Tailwind CSS + `tailwindcss-animate`
- React Hook Form + Zod
- TanStack Query v5
- Axios (con interceptor de refresh de JWT)
- `sonner` para toasts
- `lucide-react` para íconos
- Font **Outfit** vía `next/font/google`

## Estructura

```
apps/web/
├── app/
│   ├── layout.tsx                   # root: font Outfit + providers
│   ├── globals.css
│   ├── page.tsx                     # home placeholder
│   ├── (auth)/
│   │   ├── layout.tsx               # card glassmorphism 480px
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx        # paso 1
│   │   ├── verify/page.tsx          # paso 2 (OTP 6 dígitos)
│   │   ├── complete-profile/page.tsx# paso 3 (saltable)
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── dashboard/page.tsx           # placeholder post-login
│   └── checkout/[id]/page.tsx       # placeholder
├── components/
│   ├── ui/
│   │   ├── button.tsx               # variants: primary / secondary / ghost / outline / destructive / link
│   │   ├── input.tsx
│   │   ├── form.tsx                 # Field, Label, FormError
│   │   ├── otp-input.tsx            # 6 boxes accesibles
│   │   ├── phone-input.tsx          # prefix +52 fijo
│   │   └── logo.tsx                 # wordmark + smile curve
│   └── providers.tsx                # QueryClient + Auth + Toaster
├── lib/
│   ├── api.ts                       # axios + tokenStore + authApi
│   ├── auth.tsx                     # AuthProvider + useAuth()
│   ├── schemas.ts                   # zod + tipos User, AuthResponse, ApiError
│   └── utils.ts                     # cn, lsSetJSON, ageFromISO, formatMMSS
├── middleware.ts                    # protege /dashboard /checkout /portal
├── tailwind.config.ts
├── postcss.config.js
├── next.config.mjs
├── tsconfig.json
├── package.json
└── .env.local.example
```

## Desarrollo local

```bash
# desde la raíz del monorepo
pnpm install
cp apps/web/.env.local.example apps/web/.env.local

# arrancar web + api en paralelo
pnpm dev

# o sólo web
pnpm --filter @cedgym/web dev
```

Abre http://localhost:3000.

## Variables de entorno

| Key                          | Descripción                                   |
| ---------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_API_URL`        | URL base del API (`@cedgym/api`).             |
| `NEXT_PUBLIC_MP_PUBLIC_KEY`  | Public key de Mercado Pago (fase siguiente).  |

## Flujos clave

### Registro → compra de producto

1. Desde `/`, el botón "Comprar rutina X" lleva a
   `/register?redirect=/checkout/product-123&product=powerlifting-12w`.
2. `/register` persiste el intent en `localStorage`
   (`post_register_redirect`, TTL 24h) y muestra el banner "Completa tu
   registro para comprar *Powerlifting 12 Weeks*".
3. Al enviar, redirige a `/verify?phone=...`.
4. `/verify` valida el OTP, guarda el JWT, lee el redirect almacenado y,
   como empieza con `/checkout/`, abre un modal de bienvenida antes de
   enviar al usuario a `/checkout/product-123?welcome=1`.

### Protección de rutas

`middleware.ts` bloquea `/dashboard`, `/checkout/*`, `/portal/*` si no hay
cookie de sesión (`cedgym_session`). Esta cookie es un mirror no-HttpOnly
que la SPA escribe cuando guarda el JWT. Cuando el backend devuelva una
cookie real HttpOnly, ajustar el nombre en `middleware.ts` y quitar el
mirror en `lib/api.ts`.

### Contacto de emergencia condicional

`lib/schemas.ts::completeProfileSchema` usa un `superRefine` para exigir
contacto de emergencia cuando la edad calculada es menor de 18 años. La UI
también bloquea el botón "Saltar por ahora" en ese caso.

## Pendientes / Fases siguientes

- Migración completa del landing (`redesign.html`) a componentes.
- Páginas de marketplace / membresía / portal del atleta.
- Integración real de Mercado Pago en `/checkout/[id]`.
- Cambiar el mirror cookie por la cookie HttpOnly del backend y remover
  el almacenamiento de JWT en localStorage.
