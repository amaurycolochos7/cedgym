# BOLA / Cross-tenant test kit

Scripts para validar el PR `security/tenant-guard-phase-1` contra staging
(o local con docker-compose). **No commiteados al PR de seguridad** — viven
fuera de él para que los iteres sin mover el branch principal.

## Contenido

- `seed-bola-fixtures.mjs` — siembra workspace B + admins + atletas + un pago + una medición
  con marcadores `e2e-bola` (idempotente; tiene `--cleanup`).
- `run-bola-tests.sh` — corre A1–A3, B1–B16, R1–R6 con curl. Sale 0 si todo pasa.
- `PR_BODY.md` — cuerpo del PR para pegar en GitHub web si `gh` no está autenticado.
- `.bola-fixtures.json` — output del seed (gitignorear si te molesta).

## Requisitos

- `node ≥ 20`, `pnpm`
- `psql` corriendo (Postgres con el schema actual)
- `bash`, `curl`, `jq`
- `DATABASE_URL` exportado (apunta al Postgres de staging o local)

## Uso end-to-end

### 1. Levantar staging (opción local con docker-compose)

```bash
# Servicios de infra
docker compose up -d db redis

# Generar Prisma client
pnpm --filter @cedgym/db generate
cd packages/db && npx prisma db push && cd ../..

# Seed inicial (workspace A + admin@cedgym.mx)
node apps/api/src/seed.js

# Levantar API contra el branch security/tenant-guard-phase-1
git checkout security/tenant-guard-phase-1
pnpm --filter @cedgym/api dev
```

API queda en `http://localhost:3001`.

### 2. Sembrar fixtures BOLA

```bash
# Genera la fixture file que consume el test runner
DATABASE_URL="postgresql://cedgym:cedgym_dev_pass@localhost:5433/cedgym" \
  node scripts/security/seed-bola-fixtures.mjs > scripts/security/.bola-fixtures.json

# Verificar que se creó
cat scripts/security/.bola-fixtures.json | jq .
```

Output esperado: JSON con `workspace_a`, `workspace_b`, `admin_a/b`, `athlete_a/b`,
`payment_a_id`, `payment_b_id`, `measurement_b_id`.

### 3. Correr los tests

```bash
# Apuntar al API local
API_URL=http://localhost:3001 bash scripts/security/run-bola-tests.sh

# O contra staging remoto
API_URL=https://api-staging.cedgym.mx bash scripts/security/run-bola-tests.sh
```

Imprime una línea por caso con `[PASS]` o `[FAIL]`. Sale con código `0` si
todo pasa, `1` si hay fallos.

### 4. Limpiar después

```bash
DATABASE_URL=... node scripts/security/seed-bola-fixtures.mjs --cleanup
rm scripts/security/.bola-fixtures.json
```

## ¿Qué prueba cada caso?

| Caso | Descripción | Status esperado |
|---|---|---|
| A1 | ADMIN_A lee atleta de su propio gym | 200 |
| A2 | ADMIN_A edita atleta de su propio gym | 200 |
| A3a | ADMIN_A suspende atleta propio | 200 |
| A3b | ADMIN_A reactiva atleta propio | 200 |
| **B1** | ADMIN_A lee atleta de OTRO gym | **404** |
| **B2** | ADMIN_A edita atleta de OTRO gym | **404** |
| **B3** | ADMIN_A suspende atleta de OTRO gym | **404** |
| **B4** | ADMIN_A reactiva atleta de OTRO gym | **404** |
| **B5** | ADMIN_A edita staff de OTRO gym | **404** |
| **B6** | ADMIN_A lee pago de OTRO gym | **404** |
| **B7** | Listado de pagos de ADMIN_A no incluye pagos de B | 0 leaks |
| **B8** | ADMIN_A lee mediciones de OTRO gym | **404** |
| B9 | Sin token | 401 |
| B11 | ADMIN intenta escalar staff a SUPERADMIN | 403 |
| B12 | PATCH con `role` en body NO escala (mass-assign) | role inalterado |
| B13 | PATCH con body vacío | 400 NO_CHANGES |
| B14 | ADMIN intenta auto-eliminarse | 400 CANNOT_DELETE_SELF |
| B15 | Atleta lee SU propio pago | 200 |
| B16 | Atleta intenta leer pago ajeno | 403/404 |
| R1 | Atleta lista sus pagos | 200 |
| R2 | Atleta lista sus mediciones | 200 |
| R3 | Atleta crea auto-medición | 200 |
| R4 | Atleta intenta medir a otro | 403 |
| R6 | ADMIN_A lista staff de su gym | 200 |

## Verificación adicional del audit log (manual)

Después de correr los tests, conectarse a Postgres:

```bash
psql "$DATABASE_URL" -c "
SELECT action, actor_id, target_id, created_at
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '5 minutes'
  AND action IN ('member.viewed','member.updated','member.suspended',
                 'member.reactivated','staff.updated','staff.deleted',
                 'payment.viewed','payments.exported_csv',
                 'measurements.viewed_by_staff')
ORDER BY created_at DESC;
"
```

Debe mostrar al menos las acciones disparadas por A1–A3 (`member.viewed`,
`member.updated`, `member.suspended`, `member.reactivated`).

**No debe haber rows con `member.viewed` cuyo `target_id` pertenezca a workspace B**
(eso sería evidencia de que un BOLA pasó silenciosamente).

## Si algún caso falla

1. NO mergear el PR.
2. Capturar el output completo del runner.
3. Reportarlo. Yo lo reproduzco y arreglo en el mismo branch
   `security/tenant-guard-phase-1` con un commit fix-up.
4. Re-correr el runner. Cuando todo pase, recién ahí merge.
