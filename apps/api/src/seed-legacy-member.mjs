// Crea un socio que simula el caso "ya completó el wizard viejo".
// Su perfil tiene los campos básicos del wizard de antes pero NO los
// campos nuevos (motivación, gustos, dislikes, supplementos…).
// El portal debe mostrarle el banner ámbar "Actualiza tu perfil".

import { prisma } from '@cedgym/db';
import bcrypt from 'bcryptjs';

const EMAIL = 'legacy-tester@cedgym.local';
const PASSWORD = 'LegacyTest2026!!';
const PHONE = '+526142223344';

async function main() {
  const workspace = await prisma.workspace.findFirst({ select: { id: true } });
  if (!workspace) throw new Error('No workspace. Run apps/api/src/seed.js first.');

  const password_hash = await bcrypt.hash(PASSWORD, 10);

  // Perfil "legacy": campos del wizard viejo (5 pasos) que se proyectan
  // a routine_profile y nutrition_profile vía projectLegacyToSeparate.
  // SIN los campos nuevos del wizard v2.
  const legacyProfile = {
    age: 28,
    gender: 'FEMALE',
    height_cm: 165,
    weight_kg: 62,
    user_type: 'ADULT',
    objective: 'MUSCLE_GAIN',
    level: 'INTERMEDIATE',
    activity_level: 'moderate',
    days_per_week: 4,
    session_duration_min: 60,
    injuries: [],
    available_equipment: [],
    dietary_restrictions: [],
    allergies: [],
    notes: '',
  };

  // Proyección manual a los nuevos blobs (igual que el backend hace
  // con cuentas migradas) para que el banner detecte "tiene perfil
  // legacy proyectado pero no campos nuevos".
  const routineProfile = {
    age: legacyProfile.age,
    gender: legacyProfile.gender,
    height_cm: legacyProfile.height_cm,
    weight_kg: legacyProfile.weight_kg,
    user_type: legacyProfile.user_type,
    objective: legacyProfile.objective,
    level: legacyProfile.level,
    activity_level: legacyProfile.activity_level,
    days_per_week: legacyProfile.days_per_week,
    session_duration_min: legacyProfile.session_duration_min,
    location: 'GYM',
  };
  const nutritionProfile = {
    age: legacyProfile.age,
    gender: legacyProfile.gender,
    height_cm: legacyProfile.height_cm,
    weight_kg: legacyProfile.weight_kg,
    activity_level: legacyProfile.activity_level,
    objective: legacyProfile.objective,
  };

  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        workspace_id: workspace.id,
        name: 'Legacy',
        full_name: 'Legacy Tester',
        email: EMAIL,
        phone: PHONE,
        gender: 'FEMALE',
        birth_date: new Date('1997-03-21'),
        role: 'ATHLETE',
        password_hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        phone_verified_at: new Date(),
        // Marcado COMO completo (porque "completó" el wizard viejo).
        profile_completed: true,
        inscription_paid_at: new Date(),
        fitness_profile: legacyProfile,
        routine_profile: routineProfile,
        nutrition_profile: nutritionProfile,
      },
    });
    console.log('Created legacy user:', user.id);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        phone_verified_at: new Date(),
        profile_completed: true,
        inscription_paid_at: user.inscription_paid_at ?? new Date(),
        fitness_profile: legacyProfile,
        routine_profile: routineProfile,
        nutrition_profile: nutritionProfile,
      },
    });
    console.log('Reused legacy user:', user.id);
  }

  // Membresía PRO activa (no necesitamos ELITE para validar el banner).
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.membership.upsert({
    where: { user_id: user.id },
    create: {
      workspace_id: workspace.id,
      user_id: user.id,
      plan: 'PRO',
      status: 'ACTIVE',
      starts_at: now,
      expires_at: expiresAt,
      price_mxn: 990,
      billing_cycle: 'MONTHLY',
      auto_renew: false,
    },
    update: {
      plan: 'PRO',
      status: 'ACTIVE',
      starts_at: now,
      expires_at: expiresAt,
    },
  });

  console.log('\n──────────────────────────────────────');
  console.log('Tester LEGACY (perfil del wizard viejo):');
  console.log('  email:    ', EMAIL);
  console.log('  whatsapp: ', '6142223344  (los 10 dígitos)');
  console.log('  password: ', PASSWORD);
  console.log('  plan:     ', 'PRO');
  console.log('Esperado: banner ámbar "Mejoramos tu perfil…"');
  console.log('──────────────────────────────────────\n');

  await prisma.$disconnect();
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
