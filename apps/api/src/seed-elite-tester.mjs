// One-shot helper para crear un socio ELITE de prueba en local.
// Ejecutar:
//   cd apps/api
//   DATABASE_URL=... node src/seed-elite-tester.mjs

import { prisma } from '@cedgym/db';
import bcrypt from 'bcryptjs';

const TESTER_EMAIL = 'elite-tester@cedgym.local';
const TESTER_PASSWORD = 'EliteTest2026!!';
const TESTER_FULL_NAME = 'Elite Tester';
// Formato actual MX (sin el "1" después de 52). Es lo que el form
// del frontend genera al normalizar 10 dígitos.
const TESTER_PHONE = '+526141112233';

async function main() {
  // Tomamos el workspace por defecto (el único en local).
  const workspace = await prisma.workspace.findFirst({
    select: { id: true, slug: true, name: true, plan: true },
  });
  if (!workspace) throw new Error('No workspace in DB. Run apps/api/src/seed.js first.');

  // Si ya existe el usuario, lo reusamos. Idempotente para reejecutar.
  let user = await prisma.user.findUnique({ where: { email: TESTER_EMAIL } });
  const password_hash = await bcrypt.hash(TESTER_PASSWORD, 10);

  if (!user) {
    user = await prisma.user.create({
      data: {
        workspace_id: workspace.id,
        name: 'Elite',
        full_name: TESTER_FULL_NAME,
        email: TESTER_EMAIL,
        phone: TESTER_PHONE,
        gender: 'MALE',
        birth_date: new Date('1992-08-15'),
        role: 'ATHLETE',
        password_hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        phone_verified_at: new Date(),
        // Sin perfiles aún — la idea es que el wizard se complete
        // después del primer login.
        profile_completed: false,
        // Eximido del fee de inscripción (ya pagada en cuentas
        // pre-cutover). Sin esto el portal pediría primero la
        // inscripción antes de dejar comprar membresía.
        inscription_paid_at: new Date(),
      },
    });
    console.log('Created user:', user.id);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        phone_verified_at: new Date(),
        inscription_paid_at: user.inscription_paid_at ?? new Date(),
      },
    });
    console.log('Reused user:', user.id);
  }

  // Membership ELITE activa por 30 días.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.membership.upsert({
    where: { user_id: user.id },
    create: {
      workspace_id: workspace.id,
      user_id: user.id,
      plan: 'ELITE',
      status: 'ACTIVE',
      starts_at: now,
      expires_at: expiresAt,
      price_mxn: 1935,
      billing_cycle: 'MONTHLY',
      auto_renew: false, // local — no Stripe
    },
    update: {
      plan: 'ELITE',
      status: 'ACTIVE',
      starts_at: now,
      expires_at: expiresAt,
      price_mxn: 1935,
    },
  });
  console.log('Membership ELITE active until', expiresAt.toISOString());

  console.log('\n──────────────────────────────────────');
  console.log('Login con:');
  console.log('  email:    ', TESTER_EMAIL);
  console.log('  password: ', TESTER_PASSWORD);
  console.log('  phone:    ', TESTER_PHONE);
  console.log('  plan:     ', 'ELITE (rutinas + meal plans ilimitados)');
  console.log('──────────────────────────────────────\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
