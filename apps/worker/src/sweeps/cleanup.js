// ─────────────────────────────────────────────────────────────────
// Cleanup sweep — corre cada CLEANUP_SWEEP_MS (default 60 min).
// Hoy hace dos cosas:
//   1. Borra AutomationJob rows con status=DONE más viejos que 30
//      días. FAILED se preservan para inspección.
//   2. Borra filas zombie de memberships — TRIAL con expires_at
//      vencido. Estas nacen de POST /memberships/checkout-stripe
//      como placeholders pre-pago con una grace de 1 hora. Si el
//      webhook invoice.payment_succeeded llega en esa ventana,
//      sobrescribe la fila a ACTIVE+30d y se salva. Si no llega
//      (checkout abandonado o pago rechazado), la fila queda
//      expirada y este sweep la elimina, dejando al usuario en
//      "sin membresía" — estado claro para el admin (que puede
//      usar "Asignar plan a miembro") y honesto para el sistema
//      (porque el socio efectivamente nunca pagó).
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

export async function runCleanupSweep() {
    const cutoff = dayjs().subtract(30, 'day').toDate();
    const { count: jobs } = await prisma.automationJob.deleteMany({
        where: {
            status: 'DONE',
            updated_at: { lt: cutoff },
        },
    });

    const { count: zombies } = await prisma.membership.deleteMany({
        where: {
            status: 'TRIAL',
            expires_at: { lt: new Date() },
        },
    });

    return { deleted: jobs, zombie_memberships: zombies };
}

export default { runCleanupSweep };
