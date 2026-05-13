// One-shot cleanup para RoutineExercise rows cuyo video_url quedó mal
// porque YouTube scrape devolvió videos confundidos para nombres de
// hombro en español (clásico: "Pájaros con mancuernas" → videos de aves).
//
// El backend ya está blindado para futuras generaciones (apps/api/src/
// lib/youtube.js mapea estos nombres a videos curados antes de scrape).
// Este script limpia las rutinas que se generaron ANTES del fix.
//
// Cómo funciona: pone video_url=NULL en cualquier RoutineExercise cuyo
// nombre matchea un patrón problemático. Al volver a renderizar, el
// frontend (apps/web/components/portal/exercise-media.tsx) cae a las
// reglas curadas y muestra el video correcto — sin tocar la rutina,
// sin pedirle al socio que la regenere.
//
// Ejecutar:
//   cd apps/api
//   DATABASE_URL=... node src/cleanup-shoulder-video-urls.mjs --dry
//   DATABASE_URL=... node src/cleanup-shoulder-video-urls.mjs
//
// Idempotente: si no hay rutas afectadas, no hace nada.

import { prisma } from '@cedgym/db';

// Patrones que matchean nombres del Coach Samuel donde el YouTube
// scrape devolvía videos malos. Cubre las variantes con y sin acento.
const PATTERNS = [
    // Reverse fly mexicano — el peor caso, scraper devuelve aves
    /p[aá]jar/i,
    // Press hombro sin "militar" — scraper a veces devuelve press de pierna
    /press\s+hombro/i,
    // Movilidad de hombro con bandas — scraper devuelve videos genéricos
    /movilidad\s+(de\s+)?hombro/i,
];

async function main() {
    const dryRun = process.argv.includes('--dry');

    // Postgres regex: case-insensitive OR de todos los patrones.
    // El ~* es regex match case-insensitive de Postgres.
    const sqlPattern = '(p[aá]jar|press\\s+hombro|movilidad\\s+(de\\s+)?hombro)';

    const affected = await prisma.$queryRawUnsafe(
        `SELECT id, exercise_name_snapshot, video_url
         FROM routine_exercises
         WHERE video_url IS NOT NULL
           AND exercise_name_snapshot ~* $1
         ORDER BY exercise_name_snapshot`,
        sqlPattern,
    );

    if (affected.length === 0) {
        console.log('Nada que limpiar. 0 rutinas con video_url problemático.');
        return;
    }

    // Verificación local del patrón JS — defensa en profundidad por si
    // el regex de Postgres tuviera divergencia con los patrones JS.
    const matchesJs = affected.filter((r) =>
        PATTERNS.some((re) => re.test(r.exercise_name_snapshot)),
    );

    console.log(`Encontradas ${affected.length} filas con video_url y nombre problemático.`);
    console.log(`Confirmadas por match JS: ${matchesJs.length}.`);
    console.log('Muestra (primeras 10):');
    for (const row of matchesJs.slice(0, 10)) {
        console.log(`  - ${row.exercise_name_snapshot}  →  ${row.video_url}`);
    }

    if (dryRun) {
        console.log('\n[DRY RUN] No se aplicaron cambios. Quita --dry para ejecutar.');
        return;
    }

    const ids = matchesJs.map((r) => r.id);
    const result = await prisma.routineExercise.updateMany({
        where: { id: { in: ids } },
        data: { video_url: null },
    });

    console.log(`\nOK: ${result.count} filas actualizadas. video_url=NULL.`);
    console.log('El frontend caerá a las reglas curadas para mostrar el video correcto.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
