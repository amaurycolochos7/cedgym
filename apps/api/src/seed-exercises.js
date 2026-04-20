// ═══════════════════════════════════════════════════════════════
// CED-GYM — Exercise library seed.
//
// Seeds 40 generic exercises (Spanish, Mexican gym context)
// covering all MuscleGroup enum values + levels + equipment types.
//
// Idempotent: the Exercise model has @@index([workspace_id, slug])
// but NOT @@unique, so we can't use prisma.exercise.upsert with a
// composite key — we use findFirst + update/create instead.
//
// Usage: `node apps/api/src/seed-exercises.js` (from repo root)
//        or `pnpm --filter @cedgym/api seed:exercises`
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import { prisma } from '@cedgym/db';

const WORKSPACE_SLUG = 'ced-gym';

// ─── Exercise catalog ────────────────────────────────────────────
// Reps convention:
//   "8-12"  → hypertrophy
//   "5-8"   → strength
//   "30s"   → iso hold
//   "AMRAP" → cardio / conditioning
// Rest convention:
//   60s  → BEGINNER / CORE / cardio
//   90s  → INTERMEDIATE
//   120s → heavy compounds / ADVANCED
const EXERCISES = [
    // ── CHEST (4) ────────────────────────────────────────────────
    {
        name: 'Press de banca',
        slug: 'press-banca',
        muscle_group: 'CHEST',
        equipment: ['barbell', 'bench'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=press+banca+tecnica',
        description: 'Acuéstate en la banca con los pies firmes, baja la barra al pecho controlado y empuja hacia arriba sin trabar los codos.',
        default_sets: 4,
        default_reps: '6-10',
        default_rest_sec: 120,
    },
    {
        name: 'Press inclinado con mancuernas',
        slug: 'press-inclinado-mancuernas',
        muscle_group: 'CHEST',
        equipment: ['dumbbells', 'bench'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=press+inclinado+mancuernas',
        description: 'Con la banca a 30-45°, baja las mancuernas a la altura del pecho alto y empuja hacia el centro sin chocarlas.',
        default_sets: 4,
        default_reps: '8-12',
        default_rest_sec: 90,
    },
    {
        name: 'Flexiones',
        slug: 'flexiones',
        muscle_group: 'CHEST',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=flexiones+pecho+tecnica',
        description: 'Manos a la altura de los hombros, cuerpo recto desde la cabeza a los talones. Baja controlado hasta casi tocar el piso.',
        default_sets: 3,
        default_reps: '10-15',
        default_rest_sec: 60,
    },
    {
        name: 'Aperturas en polea',
        slug: 'aperturas-polea',
        muscle_group: 'CHEST',
        equipment: ['cable'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=aperturas+polea+pecho',
        description: 'De pie entre poleas altas, junta las manos al frente en arco manteniendo los codos ligeramente flexionados.',
        default_sets: 3,
        default_reps: '12-15',
        default_rest_sec: 90,
    },

    // ── BACK (5) ─────────────────────────────────────────────────
    {
        name: 'Dominadas',
        slug: 'dominadas',
        muscle_group: 'BACK',
        equipment: ['pull-up bar', 'bodyweight'],
        level: 'ADVANCED',
        video_url: 'https://youtube.com/results?search_query=dominadas+pull+ups+tecnica',
        description: 'Cuelga con agarre prono ancho, tira del cuerpo hacia arriba hasta que el mentón supere la barra y baja controlado.',
        default_sets: 4,
        default_reps: '6-10',
        default_rest_sec: 120,
    },
    {
        name: 'Remo con barra',
        slug: 'remo-barra',
        muscle_group: 'BACK',
        equipment: ['barbell'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=remo+barra+tecnica',
        description: 'Inclina el torso a 45°, espalda neutra, tira de la barra hacia el abdomen bajo contrayendo escápulas.',
        default_sets: 4,
        default_reps: '8-10',
        default_rest_sec: 120,
    },
    {
        name: 'Jalón al pecho',
        slug: 'jalon-al-pecho',
        muscle_group: 'BACK',
        equipment: ['cable', 'machine'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=jalon+al+pecho+lat+pulldown',
        description: 'Sentado con agarre prono ancho, tira de la barra al pecho alto manteniendo el torso ligeramente hacia atrás.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 90,
    },
    {
        name: 'Peso muerto rumano',
        slug: 'peso-muerto-rumano',
        muscle_group: 'BACK',
        equipment: ['barbell'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=peso+muerto+rumano+tecnica',
        description: 'Con rodillas ligeramente flexionadas, baja la barra pegada a las piernas sintiendo estiramiento de isquios.',
        default_sets: 4,
        default_reps: '8-10',
        default_rest_sec: 120,
    },
    {
        name: 'Face pulls',
        slug: 'face-pulls',
        muscle_group: 'BACK',
        equipment: ['cable'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=face+pulls+tecnica',
        description: 'Cuerda en polea alta, tira hacia la cara separando las manos y juntando escápulas. Excelente para deltoides posterior.',
        default_sets: 3,
        default_reps: '12-15',
        default_rest_sec: 60,
    },

    // ── LEGS (6) ─────────────────────────────────────────────────
    {
        name: 'Sentadilla',
        slug: 'sentadilla',
        muscle_group: 'LEGS',
        equipment: ['barbell', 'rack'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=sentadilla+barra+tecnica',
        description: 'Barra sobre trapecios, pies a la anchura de hombros. Baja hasta que muslos queden paralelos al suelo manteniendo espalda recta.',
        default_sets: 4,
        default_reps: '6-10',
        default_rest_sec: 120,
    },
    {
        name: 'Sentadilla goblet',
        slug: 'sentadilla-goblet',
        muscle_group: 'LEGS',
        equipment: ['dumbbell', 'kettlebell'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=sentadilla+goblet+tecnica',
        description: 'Sujeta una mancuerna o kettlebell pegada al pecho. Baja en sentadilla profunda manteniendo el torso erguido.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 60,
    },
    {
        name: 'Prensa 45°',
        slug: 'prensa-45',
        muscle_group: 'LEGS',
        equipment: ['machine'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=prensa+45+grados+piernas',
        description: 'Pies a la anchura de hombros en la plataforma, baja controlado hasta 90° de rodilla y empuja sin trabar.',
        default_sets: 4,
        default_reps: '10-12',
        default_rest_sec: 90,
    },
    {
        name: 'Peso muerto',
        slug: 'peso-muerto',
        muscle_group: 'LEGS',
        equipment: ['barbell'],
        level: 'ADVANCED',
        video_url: 'https://youtube.com/results?search_query=peso+muerto+deadlift+tecnica',
        description: 'Barra pegada a las espinillas, espalda neutra, levanta empujando el piso con los talones y extendiendo cadera.',
        default_sets: 4,
        default_reps: '5-8',
        default_rest_sec: 120,
    },
    {
        name: 'Zancadas con mancuernas',
        slug: 'zancadas-mancuernas',
        muscle_group: 'LEGS',
        equipment: ['dumbbells'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=zancadas+lunges+mancuernas',
        description: 'Da un paso al frente y baja hasta que ambas rodillas formen 90°. Alterna piernas manteniendo el torso vertical.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 90,
    },
    {
        name: 'Elevación de pantorrilla',
        slug: 'elevacion-pantorrilla',
        muscle_group: 'LEGS',
        equipment: ['machine', 'bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=elevacion+pantorrilla+calf+raise',
        description: 'De pie, eleva los talones al máximo contrayendo pantorrillas. Baja controlado para máximo estiramiento.',
        default_sets: 4,
        default_reps: '15-20',
        default_rest_sec: 60,
    },

    // ── SHOULDERS (4) ────────────────────────────────────────────
    {
        name: 'Press militar',
        slug: 'press-militar',
        muscle_group: 'SHOULDERS',
        equipment: ['barbell'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=press+militar+tecnica',
        description: 'De pie con barra a la altura de clavículas, empuja hacia arriba sin arquear lumbar. Activa glúteos y core.',
        default_sets: 4,
        default_reps: '6-10',
        default_rest_sec: 120,
    },
    {
        name: 'Elevaciones laterales con mancuernas',
        slug: 'elevaciones-laterales',
        muscle_group: 'SHOULDERS',
        equipment: ['dumbbells'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=elevaciones+laterales+mancuernas',
        description: 'Brazos a los lados, eleva las mancuernas hasta la altura de los hombros con codos ligeramente flexionados.',
        default_sets: 3,
        default_reps: '12-15',
        default_rest_sec: 60,
    },
    {
        name: 'Elevación frontal',
        slug: 'elevacion-frontal',
        muscle_group: 'SHOULDERS',
        equipment: ['dumbbells'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=elevacion+frontal+hombros',
        description: 'Mancuernas al frente de los muslos, elévalas hasta la altura de los ojos alternando brazos sin balancear.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 60,
    },
    {
        name: 'Encogimientos',
        slug: 'encogimientos',
        muscle_group: 'SHOULDERS',
        equipment: ['dumbbells', 'barbell'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=encogimientos+shrugs+trapecio',
        description: 'Con peso en las manos y brazos extendidos, eleva los hombros hacia las orejas contrayendo trapecios.',
        default_sets: 3,
        default_reps: '12-15',
        default_rest_sec: 60,
    },

    // ── ARMS (4) ─────────────────────────────────────────────────
    {
        name: 'Curl con barra',
        slug: 'curl-barra',
        muscle_group: 'ARMS',
        equipment: ['barbell'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=curl+barra+biceps',
        description: 'Codos pegados al torso, flexiona la barra hacia los hombros sin balancear el cuerpo. Baja controlado.',
        default_sets: 3,
        default_reps: '8-12',
        default_rest_sec: 60,
    },
    {
        name: 'Curl martillo',
        slug: 'curl-martillo',
        muscle_group: 'ARMS',
        equipment: ['dumbbells'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=curl+martillo+hammer+curl',
        description: 'Agarre neutro (palmas hacia adentro), flexiona las mancuernas manteniendo muñeca firme. Trabaja braquial y antebrazo.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 60,
    },
    {
        name: 'Extensión de tríceps en polea',
        slug: 'extension-triceps-polea',
        muscle_group: 'ARMS',
        equipment: ['cable'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=extension+triceps+polea+tricep+pushdown',
        description: 'Codos pegados al torso, extiende la polea hacia abajo contrayendo tríceps hasta extensión completa.',
        default_sets: 3,
        default_reps: '10-12',
        default_rest_sec: 60,
    },
    {
        name: 'Fondos en paralelas',
        slug: 'fondos-paralelas',
        muscle_group: 'ARMS',
        equipment: ['parallel bars', 'bodyweight'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=fondos+paralelas+dips',
        description: 'Apoyado en paralelas, baja flexionando codos hasta 90° y empuja hacia arriba. Torso vertical para tríceps, inclinado para pecho.',
        default_sets: 3,
        default_reps: '8-12',
        default_rest_sec: 90,
    },

    // ── CORE (6) ─────────────────────────────────────────────────
    {
        name: 'Plancha',
        slug: 'plancha',
        muscle_group: 'CORE',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=plancha+plank+abdomen',
        description: 'Antebrazos y puntas de pie apoyados, cuerpo recto sin hundir lumbar. Contrae glúteos y core todo el tiempo.',
        default_sets: 3,
        default_reps: '30s',
        default_rest_sec: 60,
    },
    {
        name: 'Crunch abdominal',
        slug: 'crunch-abdominal',
        muscle_group: 'CORE',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=crunch+abdominal+tecnica',
        description: 'Acostado boca arriba con rodillas flexionadas, eleva hombros del piso contrayendo abdomen. No tires del cuello.',
        default_sets: 3,
        default_reps: '15-20',
        default_rest_sec: 60,
    },
    {
        name: 'Elevación de piernas',
        slug: 'elevacion-piernas',
        muscle_group: 'CORE',
        equipment: ['bodyweight', 'pull-up bar'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=elevacion+piernas+leg+raises',
        description: 'Colgado o acostado, eleva piernas rectas hasta 90° controlando el descenso. Enfócate en el bajo abdominal.',
        default_sets: 3,
        default_reps: '10-15',
        default_rest_sec: 60,
    },
    {
        name: 'Russian twists',
        slug: 'russian-twists',
        muscle_group: 'CORE',
        equipment: ['bodyweight', 'dumbbell'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=russian+twists+oblicuos',
        description: 'Sentado con torso inclinado hacia atrás y pies elevados, rota el torso tocando el piso a ambos lados.',
        default_sets: 3,
        default_reps: '20',
        default_rest_sec: 60,
    },
    {
        name: 'Mountain climbers',
        slug: 'mountain-climbers',
        muscle_group: 'CORE',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=mountain+climbers+tecnica',
        description: 'En posición de plancha alta, lleva rodillas al pecho alternando rápidamente sin levantar la cadera.',
        default_sets: 3,
        default_reps: '30s',
        default_rest_sec: 60,
    },
    {
        name: 'Dead bug',
        slug: 'dead-bug',
        muscle_group: 'CORE',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=dead+bug+core+tecnica',
        description: 'Boca arriba con brazos y piernas flexionadas a 90°. Extiende brazo y pierna opuestos sin arquear lumbar.',
        default_sets: 3,
        default_reps: '10',
        default_rest_sec: 60,
    },

    // ── FULL BODY (5) ────────────────────────────────────────────
    {
        name: 'Burpees',
        slug: 'burpees',
        muscle_group: 'FULL_BODY',
        equipment: ['bodyweight'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=burpees+tecnica',
        description: 'Baja a plancha, flexión, regresa a cuclillas y salta con brazos arriba. Mantén ritmo constante.',
        default_sets: 4,
        default_reps: '10-15',
        default_rest_sec: 90,
    },
    {
        name: 'Thrusters',
        slug: 'thrusters',
        muscle_group: 'FULL_BODY',
        equipment: ['dumbbells', 'barbell'],
        level: 'ADVANCED',
        video_url: 'https://youtube.com/results?search_query=thrusters+crossfit+tecnica',
        description: 'Combina sentadilla frontal con press de hombros en un movimiento fluido. La inercia del squat impulsa el press.',
        default_sets: 4,
        default_reps: '8-12',
        default_rest_sec: 120,
    },
    {
        name: 'Kettlebell swings',
        slug: 'kettlebell-swings',
        muscle_group: 'FULL_BODY',
        equipment: ['kettlebell'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=kettlebell+swings+tecnica',
        description: 'Bisagra de cadera para impulsar la kettlebell al nivel de los hombros. La fuerza viene de glúteos, no de brazos.',
        default_sets: 4,
        default_reps: '15-20',
        default_rest_sec: 90,
    },
    {
        name: 'Clean and press',
        slug: 'clean-and-press',
        muscle_group: 'FULL_BODY',
        equipment: ['barbell', 'dumbbells'],
        level: 'ADVANCED',
        video_url: 'https://youtube.com/results?search_query=clean+and+press+tecnica',
        description: 'Levanta el peso del piso a los hombros (clean) y empuja sobre la cabeza (press) en secuencia explosiva.',
        default_sets: 4,
        default_reps: '5-8',
        default_rest_sec: 120,
    },
    {
        name: 'Man maker',
        slug: 'man-maker',
        muscle_group: 'FULL_BODY',
        equipment: ['dumbbells'],
        level: 'ADVANCED',
        video_url: 'https://youtube.com/results?search_query=man+maker+crossfit',
        description: 'Flexión con mancuernas, remo en plancha cada brazo, sentadilla y press. Un movimiento brutalmente completo.',
        default_sets: 3,
        default_reps: '8-10',
        default_rest_sec: 120,
    },

    // ── CARDIO (6) ───────────────────────────────────────────────
    {
        name: 'Correr',
        slug: 'correr',
        muscle_group: 'CARDIO',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=tecnica+correr+running',
        description: 'Postura erguida, zancada media, apoyo en el mediopié. Empieza con ritmo conversacional.',
        default_sets: 1,
        default_reps: 'AMRAP',
        default_rest_sec: 60,
    },
    {
        name: 'Saltar cuerda',
        slug: 'saltar-cuerda',
        muscle_group: 'CARDIO',
        equipment: ['jump rope'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=saltar+cuerda+tecnica',
        description: 'Saltos pequeños con los muñecas haciendo el movimiento, no los brazos. Mantén rodillas ligeramente flexionadas.',
        default_sets: 3,
        default_reps: '60s',
        default_rest_sec: 60,
    },
    {
        name: 'Bicicleta estática',
        slug: 'bicicleta-estatica',
        muscle_group: 'CARDIO',
        equipment: ['stationary bike'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=bicicleta+estatica+tecnica',
        description: 'Ajusta el asiento a la altura de la cadera. Pedalea con rodilla ligeramente flexionada en el punto más bajo.',
        default_sets: 1,
        default_reps: 'AMRAP',
        default_rest_sec: 60,
    },
    {
        name: 'Remo',
        slug: 'remo-cardio',
        muscle_group: 'CARDIO',
        equipment: ['rowing machine'],
        level: 'INTERMEDIATE',
        video_url: 'https://youtube.com/results?search_query=maquina+remo+rowing+tecnica',
        description: 'Secuencia: piernas, espalda, brazos. Para regresar: brazos, espalda, piernas. El 60% de la potencia viene de piernas.',
        default_sets: 1,
        default_reps: 'AMRAP',
        default_rest_sec: 90,
    },
    {
        name: 'Caminadora inclinada',
        slug: 'caminadora-inclinada',
        muscle_group: 'CARDIO',
        equipment: ['treadmill'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=caminadora+inclinada+incline+walk',
        description: 'Camina a 4-6 km/h con inclinación de 10-15%. No te sujetes de los mangos para maximizar el gasto calórico.',
        default_sets: 1,
        default_reps: 'AMRAP',
        default_rest_sec: 60,
    },
    {
        name: 'Jumping jacks',
        slug: 'jumping-jacks',
        muscle_group: 'CARDIO',
        equipment: ['bodyweight'],
        level: 'BEGINNER',
        video_url: 'https://youtube.com/results?search_query=jumping+jacks+tecnica',
        description: 'Saltos abriendo brazos arriba y piernas al mismo tiempo, luego cierra. Ritmo constante, aterrizaje suave.',
        default_sets: 3,
        default_reps: '60s',
        default_rest_sec: 60,
    },
];

async function main() {
    console.log('[seed:exercises] starting…');

    const workspace = await prisma.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
    if (!workspace) {
        throw new Error(`[seed:exercises] workspace "${WORKSPACE_SLUG}" not found — run the bootstrap seed first.`);
    }
    console.log(`[seed:exercises] workspace: ${workspace.id}`);

    let created = 0;
    let updated = 0;

    for (const ex of EXERCISES) {
        const data = {
            workspace_id: workspace.id,
            name: ex.name,
            slug: ex.slug,
            muscle_group: ex.muscle_group,
            equipment: ex.equipment,
            level: ex.level,
            video_url: ex.video_url ?? null,
            thumbnail_url: null,
            description: ex.description ?? null,
            default_sets: ex.default_sets,
            default_reps: ex.default_reps,
            default_rest_sec: ex.default_rest_sec,
            variant_easier_id: null,
            variant_harder_id: null,
            is_active: true,
        };

        // No @@unique on (workspace_id, slug) — use findFirst + create/update.
        const existing = await prisma.exercise.findFirst({
            where: { workspace_id: workspace.id, slug: ex.slug },
            select: { id: true },
        });

        if (existing) {
            await prisma.exercise.update({
                where: { id: existing.id },
                data,
            });
            updated++;
        } else {
            await prisma.exercise.create({ data });
            created++;
        }
    }

    console.log(`[seed:exercises] done — created ${created}, updated ${updated}, total ${EXERCISES.length}.`);
}

main()
    .catch((e) => {
        console.error('[seed:exercises] FAILED:', e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
