// One-shot cleanup para una Membership zombie (TRIAL sin pago confirmado).
//
// Ejecutar:
//   cd apps/api
//   DATABASE_URL=... node src/cleanup-zombie-membership.mjs jesus.montana07@gmail.com
//
// Idempotente: si la Membership no existe, no hace nada.
// NO toca pagos — solo borra la fila de Membership.

import { prisma } from '@cedgym/db';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Uso: node src/cleanup-zombie-membership.mjs <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, full_name: true, name: true, email: true },
  });
  if (!user) {
    console.error(`No existe user con email ${email}`);
    process.exit(1);
  }

  const membership = await prisma.membership.findUnique({
    where: { user_id: user.id },
  });
  if (!membership) {
    console.log(`User ${email} no tiene Membership. Nada que limpiar.`);
    return;
  }

  // Guardrail: solo borramos si NO tiene pagos APPROVED de tipo MEMBERSHIP.
  // Si los tiene, esto NO es una membresía zombie y abortamos.
  const approvedCount = await prisma.payment.count({
    where: {
      user_id: user.id,
      type: 'MEMBERSHIP',
      status: 'APPROVED',
    },
  });
  if (approvedCount > 0) {
    console.error(
      `ABORT: ${email} tiene ${approvedCount} pago(s) MEMBERSHIP APPROVED. ` +
        'No es una membresía zombie. Revisa manualmente.',
    );
    process.exit(2);
  }

  console.log('Membership a borrar:', {
    plan: membership.plan,
    status: membership.status,
    starts_at: membership.starts_at,
    expires_at: membership.expires_at,
    stripe_subscription_id: membership.stripe_subscription_id,
  });

  // MembershipFreeze tiene FK a Membership — si llega a haber, las
  // limpiamos primero (poco probable en una zombie, pero por completitud).
  await prisma.membershipFreeze.deleteMany({
    where: { membership_id: membership.id },
  });
  await prisma.membership.delete({ where: { id: membership.id } });

  console.log(`OK: Membership de ${user.full_name || user.name || email} eliminada.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
