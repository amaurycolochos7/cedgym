## Contexto

Cierra el BOLA cross-tenant detectado en la auditoría de Fase 1. Antes de este PR, un ADMIN/SUPERADMIN podía leer/modificar/eliminar usuarios, pagos y mediciones de **otros gimnasios** simplemente conociendo el `id`. Este PR introduce la capa central `lib/tenant-guard.js` y la aplica a las 4 rutas más expuestas.

## Cambios (5 archivos, +453 / -58)

**Nuevo**
- `apps/api/src/lib/tenant-guard.js` — capa central. Exporta:
  - `assertWorkspaceAccess(req)` — extrae workspace del JWT, sin fallback al default.
  - `loadInWorkspace(prisma, model, where, workspaceId, options)` — `findFirst` con workspace forzado.
  - `requireSameWorkspace(prisma, model, id, workspaceId, options)` — throw 404 si no pertenece.
  - `assertOwnerOrWorkspaceRole(req, resource, allowedRoles)` — owner o staff-en-mismo-workspace.
  - `canAccessCrossTenant(role)` — single switch (hoy: `false` para todo rol).
  - `ensureUserInWorkspace(prisma, userId, workspaceId)` — utilidad para `/admin/measurements/:userId`.

**Refactor**
- `apps/api/src/routes/admin-members.js` — GET / PATCH / suspend / reactivate de `/admin/miembros/:id` ahora scoped + audit.
- `apps/api/src/routes/admin-staff.js` — GET (sin fallback), POST (workspace explícito + bcrypt 12), PATCH (scoped + allowlist + role guard), DELETE (scoped + self-delete bloqueado).
- `apps/api/src/routes/payments.js` — GET `/payments/:id` ahora usa `assertOwnerOrWorkspaceRole`. GET `/admin/payments` filtra workspace forzado + audit en CSV export.
- `apps/api/src/routes/measurements.js` — POST cross-user, DELETE admin path, GET `/admin/measurements/:userId` ahora validan que el target user pertenece al workspace del actor.

## Decisión de diseño

**SUPERADMIN sigue scoped por workspace.** Si el día de mañana se necesita acceso cross-tenant para soporte/billing/fraude, se crea un rol `PLATFORM_OWNER` y se cambia SOLO el cuerpo de `canAccessCrossTenant()`. Sin tocar 50 rutas. Hoy: el switch retorna `false` para todos.

## Endpoints blindados (13 en total)

| Método | Ruta | Audit action |
|---|---|---|
| GET | /admin/miembros/:id | member.viewed |
| PATCH | /admin/miembros/:id | member.updated |
| POST | /admin/miembros/:id/suspend | member.suspended |
| POST | /admin/miembros/:id/reactivate | member.reactivated |
| GET | /admin/staff | — |
| POST | /admin/staff | staff.created |
| PATCH | /admin/staff/:id | staff.updated |
| DELETE | /admin/staff/:id | staff.deleted |
| GET | /payments/:id | payment.viewed (solo cuando staff) |
| GET | /admin/payments | payments.exported_csv (en CSV) |
| POST | /measurements (cross-user) | measurement.created_by_staff |
| DELETE | /measurements/:id | measurement.deleted_by_staff |
| GET | /admin/measurements/:userId | measurements.viewed_by_staff |

## Test plan

⚠️ **No mergear sin correr los casos B1–B16 + R1–R8 contra staging.** El detalle está en `scripts/security/run-bola-tests.sh` (separado, fuera de este PR).

Sintetizado: dos workspaces (A=ced-gym, B=gym-test), un admin por workspace, un atleta por workspace. ADMIN_A intenta operar sobre recursos de B → debe recibir 404 en TODOS los casos.

## Behavior changes

- Cross-tenant ahora retorna **404** (antes: a veces 200 leak, a veces 403). Frontend que branchea por status puede requerir ajuste cosmético.
- `PATCH` con body vacío retorna **400 NO_CHANGES** (antes: 200 silencioso).
- `assertWorkspaceAccess` rechaza sesiones sin `workspace_id` → posibles 403 transitorios para JWT viejos. Mitigación: `UPDATE refresh_tokens SET revoked_at=NOW()` en el deploy si hay duda.

## Deuda técnica que NO cierra este PR

6 endpoints sub de admin-members siguen usando `?? fastify.defaultWorkspaceId` (no son BOLA — filtran también por user_id — pero el patrón es inconsistente). Quedan para PR siguiente junto con admin-products, admin-exercises, courses, listings, reports, audit y chat.

## Out of scope

NO incluye fixes de la Fase 1 restantes:
- Secretos en .env y JWT_SECRET fallback (Fase 0)
- Bucket público en MinIO (selfies)
- file-type validation en uploads
- Mercado Pago webhook hardening
- WhatsApp bot QR público
- Helmet / CSP / rate limiting de login

Cada uno irá en su propio PR.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
