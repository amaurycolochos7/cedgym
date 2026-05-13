// ─────────────────────────────────────────────────────────────────
// AI-generated routines.
//
// Mounted by @fastify/autoload at /ai/routines (via `autoPrefix`).
//
// Authenticated endpoints (JWT):
//   POST /ai/routines/generate   — generate & persist a new routine
//   GET  /ai/routines/me         — active routine for the caller
//   GET  /ai/routines/me/history — all routines (active + inactive)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { generateJSON } from '../lib/openai.js';
import { assertAIQuota } from '../lib/ai-quota.js';
import { searchExerciseVideosBatch } from '../lib/youtube.js';
import { select_routine_template } from '../coach-templates/loader.js';
import {
    isCoachTemplatesV1Enabled,
    buildRoutinePromptFromTemplate,
    deterministicRoutineFromTemplate,
} from '../lib/coach-templates-prompt.js';
import { validate_routine_response, buildRetryUserPrompt } from '../lib/template-validator.js';

export const autoPrefix = '/ai/routines';

// ── Validation schemas ────────────────────────────────────────────
const FITNESS_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'];
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LOCATIONS = ['GYM', 'HOME', 'BOTH'];

// Tipo de usuario según la filosofía del Coach Samuel:
//   ADULT    — adulto general (18-55)
//   SENIOR   — adulto mayor (55+) — baja carga, alto control
//   KID      — niño/juvenil (6-17) — funcional + peso corporal
//   ATHLETE  — deportista de disciplina específica (fútbol, americano, etc.)
const USER_TYPES = ['ADULT', 'SENIOR', 'KID', 'ATHLETE'];

// Disciplinas del gym (si user_type=ATHLETE o quiere enfoque específico).
// Orden: deportes principales primero (los del catálogo destacado del
// wizard), luego otras disciplinas. Los strings son los enums que viajan
// en wire format; las etiquetas humanas viven en DISCIPLINE_LABELS abajo.
const DISCIPLINES = [
    // Principales
    'FOOTBALL_SOCCER',
    'FOOTBALL_US',
    'BASKETBALL',
    'TENNIS',
    'SWIMMING',
    'BASEBALL',
    'VOLLEYBALL',
    // Otros
    'BOXING',
    'KARATE',
    'GOLF',
    'CROSSFIT',
    'POWERLIFTING',
    'HYROX',
    'STRENGTH',
    'FUNCTIONAL',
];

// Etiqueta humana para el prompt — la IA entiende mejor "natación" que
// "SWIMMING". Mantenemos los enums como wire format pero proyectamos al
// español al construir el prompt.
const DISCIPLINE_LABELS = {
    FOOTBALL_SOCCER: 'fútbol soccer',
    FOOTBALL_US:     'fútbol americano',
    BASKETBALL:      'básquetbol',
    TENNIS:          'tenis',
    SWIMMING:        'natación',
    BASEBALL:        'béisbol',
    VOLLEYBALL:      'voleibol',
    BOXING:          'boxeo',
    KARATE:          'karate (artes marciales)',
    GOLF:            'golf',
    CROSSFIT:        'CrossFit',
    POWERLIFTING:    'powerlifting',
    HYROX:           'HYROX',
    STRENGTH:        'fuerza / hipertrofia',
    FUNCTIONAL:      'entrenamiento funcional',
};

const generateBody = z.object({
    objective: z.enum(FITNESS_GOALS).optional(),
    level: z.enum(LEVELS).optional(),
    user_type: z.enum(USER_TYPES).optional(),
    discipline: z.enum(DISCIPLINES).optional(),
    // Location y días son opcionales — si no vienen, el endpoint usa
    // los valores del routine_profile del socio (o falla con 400 si
    // tampoco están ahí). Esto deja al frontend mandar body vacío como
    // "regenerar con mi perfil sin tocar nada".
    location: z.enum(LOCATIONS).optional(),
    days_per_week: z.number().int().min(2).max(6).optional(),
    available_equipment: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    injuries: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    session_duration_min: z.number().int().min(15).max(180).optional(),
    notes: z.string().trim().max(2000).optional(),
});

// Schema the model must return. Kept loose on exercise_id because
// invented exercises come back as null; we re-map ids ourselves.
const aiResponseSchema = z.object({
    routine: z.object({
        name: z.string().min(1).max(200),
        goal: z.enum(FITNESS_GOALS),
        location: z.enum(LOCATIONS),
        days_per_week: z.number().int().min(2).max(7),
    }),
    days: z.array(
        z.object({
            day_of_week: z.number().int().min(0).max(6),
            title: z.string().min(1).max(200),
            notes: z.string().nullable().optional(),
            exercises: z.array(
                z.object({
                    exercise_id: z.string().nullable().optional(),
                    exercise_name: z.string().min(1).max(200),
                    video_url: z.string().nullable().optional(),
                    sets: z.number().int().min(1).max(20),
                    reps: z.string().min(1).max(32),
                    rest_sec: z.number().int().min(0).max(600),
                    notes: z.string().nullable().optional(),
                })
            ).min(1).max(30),
        })
    ).min(1).max(7),
});

// ── Prompt builders ───────────────────────────────────────────────
//
// El system prompt clona la voz y método del Coach M.A. Samuel Oswaldo
// Rodríguez Jeffery (CED·GYM, Chihuahua). Tricampeón internacional de
// powerlifting, campeón nacional ONEFA, entrenador con +20 años en
// alto rendimiento. Las frases-firma vienen de sus Excels de rutinas.
const SYSTEM_PROMPT = `Eres el Coach M.A. Samuel Oswaldo Rodríguez Jeffery de CED·GYM en Chihuahua, México. Tricampeón internacional de powerlifting y campeón nacional de football americano con las Águilas UACH. Tienes más de 20 años formando atletas de alto rendimiento.

Generas rutinas personalizadas para los socios del gym. Respondes SOLO con JSON válido siguiendo el esquema exacto proporcionado. NO repites otra rutina genérica — TODA decisión (volumen, intensidad, ejercicios, calentamiento) tiene que justificarse contra el perfil del socio.

TU MÉTODO (respeta siempre):
- "No te preocupes por cargar mucho, preocúpate por hacerlo bien." — la técnica viene primero, el peso después.
- Sube controlado y aprieta 1 segundo en la contracción.
- Movimiento controlado sin impulso — nada de aventar pesos.
- Progresión: aumentar peso cada serie (formato "15,12,10,8" con peso subiendo) o "10 pesadas / 10 livianas" para técnica.
- Compuestos primero (sentadilla, peso muerto, press banco, remo), aislamiento después.
- Piernas: siempre incluir trabajo isométrico y pliométrico (sentadilla isométrica, saltos desplantes) cuando el nivel lo permita.
- Core al final del día (100 reps de abdominales o equivalente).

CALENTAMIENTO POR DÍA (regla DURA — la bicicleta NO es default universal):
El primer ejercicio de cada día debe ACTIVAR el grupo muscular que se va a trabajar ese día. Ejemplos:
- Día de PECHO/EMPUJE: rotaciones de hombro + lagartijas ligeras + press con barra/mancuerna vacía 12 reps. NO bicicleta.
- Día de ESPALDA/JALÓN: face pulls con banda + dominada asistida 8 reps + hiperextensiones 15 reps. NO bicicleta.
- Día de HOMBRO: rotaciones externas con banda + Y-T-W en banco inclinado + laterales con peso ligero.
- Día de PIERNA/CUÁDRICEPS/FEMORAL/GLÚTEO: movilidad de cadera + sentadilla con peso corporal 20 reps + zancadas caminando 10/lado. La bicicleta ESTÁTICA 5-10 min sí aplica aquí porque calienta tobillo y rodilla.
- Día de BRAZO (bíceps + tríceps): rotaciones de muñeca + curl con peso ligero 15 reps + extensiones tríceps con banda.
- Día FUNCIONAL/CARDIO: jumping jacks + skipping en sitio + cuerda 3 min.
- Día CORE: respiración 360 + dead bug 10/lado + hollow hold 20s.
La bicicleta SOLO se usa: día de pierna, día funcional, o cuando el socio explícitamente pidió cardio integrado.

DIFERENCIACIÓN POR OBJETIVO (NO entregues la misma rutina para todos):
- WEIGHT_LOSS: 40-60% del volumen es circuito/superset. Reps 15-25, descansos 30-45s. Termina cada día con 8-12 min de cardio HIIT o LISS según preferencia. Densidad > carga máxima.
- MUSCLE_GAIN: hipertrofia clásica. Reps 8-15, formato "15,12,10,8" subiendo peso, descansos 60-90s. Aislamiento al final con drop set en última serie cuando sea avanzado.
- STRENGTH: bajo volumen, alta carga. Reps 3-6, formato "10,8,6,3,2,1", descansos 120-180s. Compuestos pesados. Sin circuitos.
- ENDURANCE: reps altas (15-25+), descansos cortos (20-40s), tempo controlado o circuitos. Mayor volumen total, menor carga.
- MAINTENANCE: balance entre los anteriores. Reps 10-15, descansos 60-75s.
- GENERAL_FITNESS: full body con compuestos + funcional + core. Reps 10-15, descansos 60-90s.

DIFERENCIACIÓN POR NIVEL (volumen, complejidad y técnicas avanzadas):
- BEGINNER: 4-6 ejercicios por día. Compuestos básicos en máquina (más seguros). Reps 10-15. Descansos 75-90s. Una progresión simple por serie. NADA de drop sets, supersets, rest-pause ni tempos complejos.
- INTERMEDIATE: 6-8 ejercicios por día. Mezcla peso libre + máquina. Reps 8-15. Descansos 60-90s. Puedes meter 1 superset por día y 1 drop set en última serie de aislamiento.
- ADVANCED: 7-10 ejercicios por día. Predominio de peso libre. Técnicas pro EXIGIDAS (mínimo 2 distintas por día):
    · Drop sets en última serie de aislamiento
    · Supersets antagonistas (ej. press banco + remo, curl + tríceps)
    · Rest-pause (8 reps + 15s + AMRAP)
    · Tempos controlados ("3-1-1-0" o "tempo 4 abajo")
    · Cluster sets (3+3+3 con 15s entre mini-sets)
    · Pre-fatiga (aislamiento ANTES del compuesto)
  Reps mixtas (5-15 según el ejercicio). Descansos variables. Volumen alto.

ADAPTACIÓN POR TIPO DE USUARIO:
- ADULT (18-55): rutinas clásicas según objetivo + nivel arriba.
- SENIOR (55+): máquinas > peso libre, baja carga, alta técnica, mayor descanso, énfasis en movilidad y core. Sin saltos ni cargas máximas.
- KID (6-17): entrenamiento funcional y peso corporal principalmente. Nada de cargas pesadas. Coordinación, agilidad y diversión.
- ATHLETE: rutina específica para su deporte. Adaptaciones por deporte:
  · fútbol soccer → explosividad, cambios de dirección, sprints cortos, fuerza unilateral de pierna, core anti-rotación.
  · fútbol americano → fuerza compuesta pesada + pliometría + acondicionamiento estilo HYROX. Cuello/trapecio. Sprints de 10-40 yardas.
  · básquetbol → salto vertical (sentadilla + pliometría), core, hombro estable, cambio de dirección.
  · tenis → rotación de tronco, hombro (manguito rotador), antebrazo/pinza, footwork lateral, single-leg balance.
  · natación → dorsales + jalones (lat pulldown, pull-ups, remo), hombro 360° con manguito rotador, core anti-extensión, cardio bajo impacto, MUCHA movilidad torácica/hombro. Evita compresión axial pesada (squats de carga máxima) en semanas de competencia.
  · béisbol → rotación explosiva de tronco (med ball throws), cadena posterior y cadera, hombro/codo SIN sobrecarga (volumen moderado, técnica limpia), agilidad lateral, antebrazo/agarre. Cuidar codo de pitcher: cero ejercicios que estresen flexión de codo bajo carga máxima.
  · voleibol → salto vertical (sentadilla, pliometría, peso muerto rumano), hombro (push press, manguito rotador), core anti-rotación, agilidad reactiva, fuerza unilateral de pierna.
  · powerlifting → SBD específico (sentadilla, banca, peso muerto), reps 1-5, descansos 3-5 min, accesorios mínimos.
  · boxeo → rotacional + cardio, hombros, core anti-rotación, footwork.
  · CrossFit/HYROX/funcional → metcon, levantamientos olímpicos, gymnastics.

CONTEXTO/MOTIVACIÓN DEL SOCIO:
- Si el socio te dice POR QUÉ entrena (boda, competencia, recuperación), la rutina entera tiene que reflejarlo. Por ej. "verme bien sin camisa para julio" → priorizar pecho/espalda/brazo en el orden de los días, déficit de volumen en pierna si la fecha está cerca, integrar cardio.
- Si declara grupos prioritarios → más frecuencia y volumen ahí.
- Si declara grupos a desenfatizar → 1 sola sesión a la semana de mantenimiento, no enfatices.
- Si declara qué NO le gusta → respétalo SIEMPRE. Si no le gusta correr largo, cero LISS de 30+ min; usa HIIT corto. Si no le gusta sentadilla, usa hack squat/prensa.
- Si declara experiencia previa que le funcionó → replica el patrón. Si declara lo que NO le funcionó → evítalo.

DURACIÓN DE LA SESIÓN:
- session_duration_min < 35 min: 4-5 ejercicios. Sin trabajo isométrico extra.
- 35-50 min: 5-7 ejercicios.
- 50-75 min: 7-9 ejercicios.
- 75-100 min: 9-11 ejercicios.
- > 100 min: 10-13 ejercicios. Solo justificable para nivel avanzado o athletes.
Calcula tiempo total = sum(sets × (tiempo_serie_aprox + rest_sec)) y queda DENTRO de la duración pedida.

TONO: mexicano norteño, directo, de coach que lleva al atleta de la mano. Nada de inglés innecesario. Cuando pongas notas en los ejercicios, usa frases cortas tipo "sube lento y aprieta arriba", "espalda recta", "codos pegados al cuerpo".

SEGURIDAD: si hay lesiones declaradas, NUNCA asignes ejercicios que las empeoren. Sustituye con alternativas seguras.`;

// Mapas humanos para las enums — el LLM entiende mejor texto literal
// que strings tipo "FOOTBALL_US". Mantienen el wire format igual.
const TRAINING_STYLE_LABELS = {
    HEAVY: 'pesado / pocas reps (powerlifting style)',
    HYPERTROPHY: 'volumen e hipertrofia (8-15 reps con foco en aislamiento)',
    CIRCUITS: 'circuitos / metcon (densidad y resistencia)',
    MIXED: 'mixto — alterna estilos según el día',
};
const MUSCLE_LABELS = {
    CHEST: 'pecho',
    BACK: 'espalda',
    SHOULDERS: 'hombro',
    ARMS: 'brazo (bíceps + tríceps)',
    GLUTES: 'glúteo',
    QUADS: 'cuádriceps',
    HAMSTRINGS: 'femoral',
    CALVES: 'pantorrilla',
    CORE: 'core / abdomen',
    FULL_BODY: 'cuerpo completo',
};
const TIME_OF_DAY_LABELS = {
    MORNING: 'mañana (entrena temprano, calentamiento más largo)',
    MIDDAY: 'mediodía',
    AFTERNOON: 'tarde',
    EVENING: 'noche (vienes después del trabajo, calentamiento dinámico breve)',
    VARIES: 'horario variable',
};
// Cada label le dice a la IA QUÉ hacer distinto cuando ve esta meta.
// No son sinónimos — son instrucciones concretas para el programador.
const GOAL_TYPE_LABELS = {
    AESTHETICS: 'estética general — verse mejor, sin meta concreta',
    DEFINITION: 'definición / cortar grasa — déficit calórico, alto volumen, cardio integrado, supersets',
    BULKING: 'volumen / ganar masa — superávit calórico, bajos reps con mucho descanso, compuestos pesados',
    RECOMP: 'recomposición — mismo peso pero menos grasa y más músculo. Pesa + cardio moderado',
    BODYBUILDING: 'fisiculturismo (subir tarima) — split clásico de 5+ días, aislamiento extremo, técnicas pro obligadas (drop sets, supersets antagonistas), pose practice',
    POWERLIFTING_GOAL: 'PRs en SBD — sentadilla, banca y peso muerto. Reps 1-5, descansos 3-5 min, accesorios mínimos',
    HYROX_GOAL: 'carrera HYROX — combinar fuerza funcional + cardio (sled push/pull, burpees broad jump, wall balls, farmer carry, sandbag, ski erg, rower, lunges, run intervals)',
    CROSSFIT_GOAL: 'CrossFit — WODs, AMRAPs, EMOMs, gymnastics + olympic lifting',
    CALISTHENICS: 'skills de calistenia — pull-up, muscle up, dominadas con peso, handstand, planche, dragon flag. Bajos reps, alta calidad, progresiones',
    MARATHON: 'corredor — pesa + running. Pierna 1x/sem, fuerza compuesta, mucha movilidad de cadera/tobillo, core fuerte',
    PERFORMANCE: 'rendimiento deportivo general',
    HEALTH: 'salud general — sin meta estética concreta, prioridad bienestar',
    POSTURE: 'postura y dolor crónico — fortalecer cadena posterior, espalda alta, glúteo, core. Cero ejercicios que comprometan zona dolorida',
    ENERGY: 'energía y vitalidad — sesiones más cortas, fuerza moderada, cero overtraining, recuperación clave',
    POST_INJURY: 'recuperación de lesión — carga progresiva, sin movimientos que comprometan la zona, énfasis movilidad',
    POST_PARTUM: 'post-parto — fortalecer suelo pélvico, core profundo, transverso abdominal. Carga progresiva, cero saltos las primeras semanas',
    EVENT: 'evento específico (boda, vacaciones) — agresividad del plan según la fecha',
    COMPETITION: 'competencia',
};
const YEARS_TRAINING_LABELS = {
    NONE: 'nunca había entrenado',
    LT_1: 'menos de 1 año',
    '1_2': '1 a 2 años',
    '3_5': '3 a 5 años',
    GT_5: 'más de 5 años',
};

function joinLabels(values, dict) {
    if (!Array.isArray(values) || values.length === 0) return null;
    return values.map((v) => dict[v] || String(v).toLowerCase()).join(', ');
}

function buildUserPrompt({
    days_per_week,
    objective,
    level,
    user_type,
    discipline,
    location,
    session_duration_min,
    available_equipment,
    injuries,
    notes,
    exerciseLibrary,
    firstName,
    // Campos nuevos del perfil extendido — todos opcionales.
    years_training,
    training_style,
    priority_muscles,
    deprioritized_muscles,
    likes,
    dislikes,
    time_of_day,
    mobility_limitations,
    motivation,
    goal_type,
    goal_deadline,
    past_experience,
}) {
    const libJson = JSON.stringify(
        exerciseLibrary.map((e) => ({
            id: e.id,
            name: e.name,
            muscle_group: e.muscle_group,
            equipment: e.equipment,
            level: e.level,
        }))
    );
    const hasEquipment = available_equipment && available_equipment.length > 0;
    const equipmentStr = hasEquipment
        ? available_equipment.join(', ')
        : (location === 'HOME' ? 'NINGUNO — solo peso corporal' : '(no aplica)');
    const injuriesStr = (injuries && injuries.length > 0)
        ? injuries.join(', ')
        : '(ninguna)';
    const mobilityStr = mobility_limitations && mobility_limitations.length > 0
        ? mobility_limitations.join(', ')
        : '(ninguna)';
    const likesStr = (likes && likes.length > 0) ? likes.join(', ') : null;
    const dislikesStr = (dislikes && dislikes.length > 0) ? dislikes.join(', ') : null;
    const priorityStr = joinLabels(priority_muscles, MUSCLE_LABELS);
    const deprioritizedStr = joinLabels(deprioritized_muscles, MUSCLE_LABELS);
    // Hard rule block injected only for HOME with no declared equipment.
    // Without it the AI casually pencils in "press de pierna en máquina",
    // "mancuernas", "bicicleta estática" — gear the member doesn't have.
    // The library filter already excludes those rows, but the model can
    // still INVENT exercises with exercise_id=null, which bypasses the
    // filter entirely. So we say it explicitly in plain Spanish.
    const homeStrictBlock =
        location === 'HOME' && !hasEquipment
            ? `\n\nMODO CASA SIN EQUIPO (estricto):
- El socio NO tiene mancuernas, ni barras, ni máquinas, ni bandas, ni bicicleta/elíptica/cinta, ni step, ni TRX, ni pesas rusas.
- TODOS los ejercicios deben ser de PESO CORPORAL (lagartijas, sentadillas libres, desplantes, plancha, mountain climbers, burpees, brincos, abdominales, escaladores, etc.) o usar objetos cotidianos del hogar (mochila cargada, botellas con agua, silla, pared, toalla).
- PROHIBIDO: "press en banco con mancuernas", "sentadilla goblet", "prensa de piernas", "remo con mancuerna", "curl con mancuerna", "bicicleta estática", "press hombro con mancuernas", "peso muerto rumano con mancuernas", "saltar la cuerda" (asume que tampoco tiene cuerda), o cualquier ejercicio que requiera una pieza de equipo.
- PARA CARDIO/CALENTAMIENTO en casa sin equipo: usa "trote en sitio", "jumping jacks", "high knees", "skipping en sitio", "saltos de tijera", "shadow boxing".
- Si crees que el ejercicio "queda raro" sin pesa, AUMENTA reps/series o agrega tempo (ej. "sentadilla 4 segundos abajo, sube en 1") en vez de meter equipo.`
            : '';
    const notesStr = notes && notes.trim() ? notes.trim() : '(sin notas)';
    const disciplineStr = discipline
        ? (DISCIPLINE_LABELS[discipline] || discipline)
        : '(no aplica)';
    const firstNameStr = firstName && firstName.trim() ? firstName.trim() : '(sin nombre)';

    // Bloque de "intención del socio" — lo metemos al principio del
    // prompt porque es la información que más fácil ignora la IA si la
    // dejamos al final. Solo aparecen líneas para campos no vacíos.
    const intentLines = [];
    if (motivation && motivation.trim()) {
        intentLines.push(`- En sus propias palabras: "${motivation.trim()}"`);
    }
    if (goal_type) {
        intentLines.push(`- Tipo de meta: ${GOAL_TYPE_LABELS[goal_type] || goal_type}`);
    }
    if (goal_deadline && goal_deadline.trim()) {
        intentLines.push(`- Fecha objetivo: ${goal_deadline.trim()} (ajusta agresividad del plan según urgencia)`);
    }
    if (past_experience && past_experience.trim()) {
        intentLines.push(`- Experiencia previa: "${past_experience.trim()}" (replica lo que funcionó, evita lo que falló)`);
    }
    if (likesStr) intentLines.push(`- Le gusta: ${likesStr}`);
    if (dislikesStr) intentLines.push(`- NO le gusta (RESPÉTALO): ${dislikesStr}`);
    if (priorityStr) intentLines.push(`- Grupos musculares PRIORITARIOS (más frecuencia y volumen): ${priorityStr}`);
    if (deprioritizedStr) intentLines.push(`- Grupos a desenfatizar (1 sesión/semana de mantenimiento): ${deprioritizedStr}`);
    const intentBlock = intentLines.length > 0
        ? `\n\nINTENCIÓN DEL SOCIO (este es el "para qué" — toda decisión debe respetarlo):\n${intentLines.join('\n')}`
        : '';

    const yearsStr = years_training ? YEARS_TRAINING_LABELS[years_training] : null;
    const styleStr = training_style ? TRAINING_STYLE_LABELS[training_style] : null;
    const timeStr = time_of_day ? TIME_OF_DAY_LABELS[time_of_day] : null;

    return `Genera una rutina semanal de ${days_per_week} días para este socio.

PERFIL:
- Nombre del socio: ${firstNameStr}
- Tipo de usuario: ${user_type} (ADULT=adulto 18-55, SENIOR=55+, KID=6-17, ATHLETE=deportista)
- Disciplina/Deporte: ${disciplineStr}
- Objetivo: ${objective}
- Nivel: ${level}${yearsStr ? ` (experiencia: ${yearsStr})` : ''}
- Estilo preferido de entrenamiento: ${styleStr || '(no especificado — usa lo que mejor encaje con el objetivo)'}
- Ubicación: ${location} (GYM = acceso completo a máquinas + pesos + cardio; HOME = solo lo que tenga en casa; BOTH = alterna)
- Duración por sesión: ${session_duration_min} minutos (calibra el número de ejercicios A ESTA duración)
- Hora del día: ${timeStr || '(no especificada)'}
- Equipo disponible en casa: ${equipmentStr}
- Lesiones/restricciones: ${injuriesStr}
- Limitaciones de movilidad: ${mobilityStr}
- Notas adicionales: ${notesStr}${intentBlock}${homeStrictBlock}

BIBLIOTECA DE EJERCICIOS DEL COACH (usa SIEMPRE estos nombres cuando el ejercicio esté en la lista — son los nombres que el Coach Samuel usa con sus atletas. Solo inventa si realmente no hay equivalente):
${libJson}

REGLAS DEL MÉTODO CED·GYM:
- CALENTAMIENTO ESPECÍFICO AL DÍA (regla DURA):
  · Día PECHO/EMPUJE → arranca con activación de hombro (rotaciones con banda, Y-T-W) + lagartijas ligeras + press con barra/mancuerna vacía. NO bicicleta.
  · Día ESPALDA/JALÓN → face pulls con banda + dominadas asistidas suaves + hiperextensiones 15 reps. NO bicicleta.
  · Día HOMBRO → rotaciones externas con banda + Y-T-W en banco inclinado + laterales con peso ligero.
  · Día PIERNA/CUÁDRICEPS/FEMORAL/GLÚTEO → sí aplica bicicleta 8-15 min porque calienta tobillo y rodilla, además de movilidad de cadera + sentadilla peso corporal 20 reps.
  · Día BRAZO → rotaciones de muñeca + curl ligero 15 reps + extensiones tríceps con banda.
  · Día FUNCIONAL/CARDIO → jumping jacks + skipping en sitio + cuerda 3 min.
  · Día CORE → respiración 360 + dead bug 10/lado + hollow hold 20s.
  · EN HOME sin equipo: nunca pongas "bicicleta" — usa trote en sitio, jumping jacks o cardio de peso corporal.
- SIEMPRE cierra cada día con 100 repeticiones de abdominales (o equivalente core si el day_of_week ya es día de core).
- Alterna grupos musculares — nunca entrenar el mismo grupo 2 días seguidos.
- Incluye 1 día de descanso mínimo si days_per_week < 7.
- Compuestos primero (sentadilla, peso muerto, press banco, remo), aislamiento después.
- En piernas, incluye al menos 1 ejercicio isométrico (sentadilla isométrica, desplante isométrico) y 1 pliométrico (saltos desplantes, saltos sentadilla) si el nivel lo permite.
- Por rep scheme (debe diferir según objetivo):
  * MUSCLE_GAIN: 8-15 reps, descansos 60-90s, formato tipo "15,12,10,8 aumentando de peso". Aislamiento al final.
  * STRENGTH: 3-6 reps, descansos 120-180s, formato tipo "10,8,6,3,2,1".
  * WEIGHT_LOSS: 15-25 reps, descansos 30-45s, ESTRUCTURA EN CIRCUITOS (40-60% del volumen). Termina con 8-12 min HIIT/LISS.
  * ENDURANCE: 15-25+ reps, descansos 20-40s, alta densidad.
  * MAINTENANCE / GENERAL_FITNESS: 10-15 reps, descansos 60-75s, mezcla compuestos + funcional.
- Por nivel (técnicas avanzadas obligatorias para ADVANCED):
  * BEGINNER: 4-6 ejercicios/día, máquinas, progresión simple. NADA de drop sets/supersets/rest-pause.
  * INTERMEDIATE: 6-8 ejercicios/día. Puedes meter 1 superset + 1 drop set por día.
  * ADVANCED: 7-10 ejercicios/día. Mínimo 2 técnicas pro distintas por día (drop set, superset antagonista, rest-pause, tempo "3-1-1-0", cluster set, pre-fatiga). Si no incluyes técnicas avanzadas para un socio ADVANCED, la rutina está mal calibrada.
- Si hay lesiones, ADAPTA siempre: ej. lumbalgia → no peso muerto convencional, usar peso muerto rumano ligero o hip thrust. Rodilla → no sentadilla profunda, usar prensa o sentadilla goblet parcial.
- Si el socio declaró cosas que NO le gustan (ej. correr, sentadilla, estiramientos), respétalo — busca alternativas.
- Si declaró grupos prioritarios, asígnales más frecuencia: 2x semana si es posible. Si declaró grupos a desenfatizar, 1 sola sesión corta de mantenimiento.

ADAPTACIÓN POR USER_TYPE:
- SENIOR: cambia todo peso libre por máquinas cuando posible, descansos más largos (90-120s), reps 12-15, sin saltos ni cargas máximas.
- KID: rutina de funcional + peso corporal. Nada de barras con peso. Mucha coordinación (escalera, vallas, mountain climbers), core, y ejercicios divertidos.
- ATHLETE: prioriza el deporte. Fútbol soccer → explosividad + cambios de dirección. Fútbol americano → fuerza + pliometría + HYROX. Básquet → salto vertical + core. Tenis → rotación + hombro. Natación → dorsales + jalones + hombro 360° + cardio bajo impacto. Béisbol → rotación explosiva + cadera + agarre, cuidando codo. Voleibol → salto vertical + hombro + agilidad reactiva. Powerlifting → SBD específico.

EN CADA EJERCICIO, la nota (notes) debe ser una frase corta estilo coach mexicano: "sube lento y aprieta arriba", "espalda recta", "codos pegados al cuerpo", "aumenta peso en la última serie". Máximo 10 palabras.

EN EL TITLE DEL DÍA, usa formato tipo Excel del Coach: "Pecho + Tríceps", "Espalda + Hombro", "Pierna (Cuádriceps + Femoral)", "Entrenamiento Funcional".

EN EL NOMBRE DE LA RUTINA ("routine.name"):
- SIEMPRE incluye el nombre del socio si está disponible (no es "(sin nombre)").
- Refleja el objetivo y los días a la semana en el nombre.
- Si el socio es ATHLETE con una disciplina concreta, menciónala en el nombre (no uses "ATHLETE" crudo — usa el deporte en español: "fútbol", "football americano", "powerlifting", etc.).
- Ejemplos válidos: "Rutina de Amaury — hipertrofia 4 días", "Plan de fuerza de Luis — 5 días", "Fútbol americano — rutina de Mario (4 días)", "Pérdida de grasa de Ana — 3 días".
- NUNCA uses nombres genéricos como "Rutina general fitness" o "Plan estándar" — queremos que el socio sienta que es para él.

SCHEMA JSON (respondes EXACTAMENTE esto, nada más):
{
  "routine": {
    "name": "string — nombre personalizado según las reglas de arriba",
    "goal": "WEIGHT_LOSS | MUSCLE_GAIN | MAINTENANCE | STRENGTH | ENDURANCE | GENERAL_FITNESS",
    "location": "GYM | HOME | BOTH",
    "days_per_week": number
  },
  "days": [
    {
      "day_of_week": 0-6 (Mon=0),
      "title": "string (ej 'Empuje — pecho + hombros')",
      "notes": "string (tip del coach de 1 línea)",
      "exercises": [
        {
          "exercise_id": "id del Exercise si viene de la biblioteca, null si es inventado",
          "exercise_name": "string",
          "video_url": "string | null (del Exercise si tiene)",
          "sets": number,
          "reps": "string (ej '10' o '8-12' o '30s' o 'AMRAP')",
          "rest_sec": number,
          "notes": "string | null"
        }
      ]
    }
  ]
}`;
}

// ── Helpers ───────────────────────────────────────────────────────

// Merge body + routine_profile (nuevo) + fitness_profile (legacy).
// Precedencia: body > routine_profile > fitness_profile > defaults.
//
// Por qué: el body manda los toggles que el socio elige al hacer click
// "Generar rutina" (location/días/duración pueden diferir de su perfil
// guardado, ej. "esta semana sí entreno en casa"). El perfil guardado
// es el contexto base — incluye toda la motivación, gustos, etc.
function mergeProfile(body, routineProfile, legacyProfile) {
    const rp = routineProfile && typeof routineProfile === 'object' ? routineProfile : {};
    const fp = legacyProfile && typeof legacyProfile === 'object' ? legacyProfile : {};
    return {
        // Campos clásicos (se enviaban en el body antes — se mantienen).
        objective:         body.objective         ?? rp.objective         ?? fp.objective ?? fp.goal ?? 'GENERAL_FITNESS',
        level:             body.level             ?? rp.level             ?? fp.level     ?? 'BEGINNER',
        user_type:         body.user_type         ?? rp.user_type         ?? fp.user_type ?? 'ADULT',
        discipline:        body.discipline        ?? rp.discipline        ?? fp.discipline ?? null,
        // Location y días: si no vienen en el body, fallback al perfil.
        // El handler valida más abajo que estos terminen no-null.
        location:          body.location          ?? rp.location          ?? fp.location ?? null,
        days_per_week:     body.days_per_week     ?? rp.days_per_week     ?? fp.days_per_week ?? null,
        available_equipment: body.available_equipment ?? rp.available_equipment ?? fp.available_equipment ?? [],
        injuries:          body.injuries          ?? rp.injuries          ?? fp.injuries ?? [],
        session_duration_min: body.session_duration_min ?? rp.session_duration_min ?? fp.session_duration_min ?? 60,
        notes:             body.notes             ?? rp.notes             ?? fp.notes ?? '',

        // Campos nuevos del perfil extendido — solo en routine_profile.
        years_training:        rp.years_training        ?? null,
        training_style:        rp.training_style        ?? null,
        priority_muscles:      rp.priority_muscles      ?? [],
        deprioritized_muscles: rp.deprioritized_muscles ?? [],
        likes:                 rp.likes                 ?? [],
        dislikes:              rp.dislikes              ?? [],
        time_of_day:           rp.time_of_day           ?? null,
        mobility_limitations:  rp.mobility_limitations  ?? [],
        motivation:            rp.motivation            ?? '',
        goal_type:             rp.goal_type             ?? null,
        goal_deadline:         rp.goal_deadline         ?? '',
        past_experience:       rp.past_experience       ?? '',
    };
}

// Loads the exercise library for the workspace. For HOME, filter by
// equipment subset (exercise.equipment is a string[] on the model —
// we treat empty equipment as "bodyweight" always allowed).
async function loadExerciseLibrary(prisma, { workspace_id, location, available_equipment }) {
    const rows = await prisma.exercise.findMany({
        where: { workspace_id, is_active: true },
        orderBy: [{ muscle_group: 'asc' }, { name: 'asc' }],
        take: 500,
    });

    if (location !== 'HOME') return rows;

    const allowed = new Set(
        (available_equipment || [])
            .map((e) => String(e).toLowerCase())
            .concat(['bodyweight', 'none', ''])
    );
    return rows.filter((ex) => {
        const eq = (ex.equipment || []).map((e) => String(e).toLowerCase());
        if (eq.length === 0) return true; // bodyweight-friendly
        return eq.every((e) => allowed.has(e));
    });
}

// Serialize a routine with its nested days + exercises.
async function loadRoutineFull(prisma, routineId) {
    return prisma.routine.findUnique({
        where: { id: routineId },
        include: {
            days: {
                orderBy: { order_index: 'asc' },
                include: {
                    exercises: {
                        orderBy: { order_index: 'asc' },
                        include: { exercise: true },
                    },
                },
            },
        },
    });
}

// ═══════════════════════════════════════════════════════════════════
export default async function aiRoutinesRoutes(fastify) {
    const { prisma } = fastify;

    // ── POST /ai/routines/generate ────────────────────────────────
    fastify.post(
        '/generate',
        {
            preHandler: [fastify.authenticate],
            config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
        },
        async (req, reply) => {
            const parsed = generateBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const userId = req.user.sub || req.user.id;

            // Enforce plan-tier quota BEFORE spending OpenAI tokens.
            await assertAIQuota(prisma, userId, 'ROUTINE');

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    workspace_id: true,
                    fitness_profile: true,
                    routine_profile: true,
                    name: true,
                    full_name: true,
                    gender: true,
                },
            });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            const merged = mergeProfile(parsed.data, user.routine_profile, user.fitness_profile);
            // Validación dura post-merge: location y días tienen que
            // resolverse de algún lado (body o perfil). Si el socio
            // todavía no llenó el wizard y el frontend no manda nada,
            // 400 con un mensaje accionable.
            if (!merged.location || !merged.days_per_week) {
                throw err(
                    'PROFILE_INCOMPLETE',
                    'Completa tu perfil de rutina (ubicación y días por semana) antes de generar.',
                    400,
                );
            }
            const firstName = (user.full_name || user.name || '').trim().split(/\s+/)[0] || '';

            // ── Templated path (feature-flagged) ───────────────────────
            // When COACH_TEMPLATES_V1=true we pick an official Coach
            // template, build a constrained prompt that forces the AI to
            // personalize WITHIN slots (no inventing days/exercises),
            // validate the response, and fall back to the deterministic
            // template payload on any structural drift.
            // NOTE (future migration): we'd ideally persist `template_id`
            // on the Routine model. The user explicitly asked NOT to add
            // schema migrations yet, so we only return the metadata in
            // the response and keep `source: 'AI_GENERATED'` as today.
            const useTemplates = isCoachTemplatesV1Enabled();
            let tpl = null;
            let templateValidation = null; // { ok, errors }
            let usedTemplateFallback = false;

            if (useTemplates) {
                tpl = select_routine_template({
                    ...merged,
                    gender: user.gender,
                    firstName,
                });
                if (!tpl) {
                    // Defensive: selector should never return null when
                    // the catalog is non-empty. If it does, we fall back
                    // to the legacy free-form path below.
                    req.log.warn(
                        '[ai-routines] COACH_TEMPLATES_V1=true but selector returned null — falling back to legacy path',
                    );
                }
            }

            // 1. Load exercise library (filtered by equipment for HOME)
            const library = await loadExerciseLibrary(prisma, {
                workspace_id: user.workspace_id,
                location: merged.location,
                available_equipment: merged.available_equipment,
            });

            // 2. Build prompt + call OpenAI
            let data;
            let aiGenerationId;
            let costUsd;
            let durationMs;
            let templateAttempts = 0;

            if (useTemplates && tpl) {
                // ── FASE 3: strict gate with 1 retry ───────────────
                // attempt 1 → validate → if !ok, retry with feedback
                // attempt 2 → validate → if !ok, throw 422.
                // OpenAI exceptions still degrade to deterministic to
                // preserve uptime (the validator vs the network are
                // distinct failure modes).
                const { system, user: userPromptOriginal, schema } = buildRoutinePromptFromTemplate(tpl, {
                    firstName,
                    level: merged.level,
                    injuries: merged.injuries,
                    // Contexto extendido — la IA usa esto para refinar
                    // notas y pequeños ajustes (rest_sec, énfasis) sin
                    // poder cambiar la estructura del template.
                    motivation:           merged.motivation,
                    goal_type:            merged.goal_type,
                    goal_deadline:        merged.goal_deadline,
                    likes:                merged.likes,
                    dislikes:             merged.dislikes,
                    priority_muscles:     merged.priority_muscles,
                    deprioritized_muscles: merged.deprioritized_muscles,
                    mobility_limitations: merged.mobility_limitations,
                    training_style:       merged.training_style,
                    years_training:       merged.years_training,
                });

                let userPromptCurrent = userPromptOriginal;
                let lastValidation = null;
                let aiOpenAIThrew = false;
                costUsd = 0;
                durationMs = 0;

                for (templateAttempts = 1; templateAttempts <= 2; templateAttempts++) {
                    let result;
                    try {
                        result = await generateJSON({
                            prisma,
                            system,
                            user: userPromptCurrent,
                            schema,
                            kind: 'ROUTINE',
                            workspace_id: user.workspace_id,
                            user_id: user.id,
                        });
                    } catch (e) {
                        // OpenAI failed — degrade to deterministic (preserve uptime).
                        req.log.warn(
                            { err: e?.message, template_id: tpl.id, attempt: templateAttempts },
                            '[ai-routines] OpenAI threw; using deterministic fallback',
                        );
                        data = deterministicRoutineFromTemplate(tpl, { firstName });
                        aiGenerationId = null;
                        costUsd = 0;
                        durationMs = 0;
                        usedTemplateFallback = true;
                        aiOpenAIThrew = true;
                        templateValidation = { ok: false, errors: [`openai_throw: ${e?.message || 'unknown'}`] };
                        break;
                    }
                    // Sum cost / duration across attempts.
                    costUsd      += Number(result.costUsd || 0);
                    durationMs   += Number(result.durationMs || 0);
                    aiGenerationId = result.aiGenerationId; // last attempt's id

                    const v = validate_routine_response(result.data, tpl);
                    lastValidation = v;
                    if (v.ok) {
                        data = result.data;
                        templateValidation = v;
                        usedTemplateFallback = false;
                        break;
                    }
                    // Validation failed — prep retry only if attempt remaining.
                    if (templateAttempts < 2) {
                        req.log.warn(
                            { template_id: tpl.id, attempt: templateAttempts, errors: v.errors.slice(0, 5) },
                            '[ai-routines] validation failed, retrying with feedback',
                        );
                        userPromptCurrent = buildRetryUserPrompt(userPromptOriginal, v.errors, 'routine');
                    }
                }

                // After the loop: if data is set we proceed. If not (and
                // OpenAI didn't throw), validator failed twice → 422.
                if (!data && !aiOpenAIThrew) {
                    throw err(
                        'AI_VALIDATION_FAILED',
                        `La IA no respetó el template tras 2 intentos: ${(lastValidation?.errors || []).slice(0, 3).join('; ')}`,
                        422,
                    );
                }
            } else {
                const userPrompt = buildUserPrompt({
                    days_per_week: merged.days_per_week,
                    objective: merged.objective,
                    level: merged.level,
                    user_type: merged.user_type,
                    discipline: merged.discipline,
                    location: merged.location,
                    session_duration_min: merged.session_duration_min,
                    available_equipment: merged.available_equipment,
                    injuries: merged.injuries,
                    notes: merged.notes,
                    exerciseLibrary: library,
                    firstName,
                    // Campos extendidos — alimentan el bloque "intención
                    // del socio" del prompt. Si vienen vacíos, las líneas
                    // simplemente no aparecen.
                    years_training: merged.years_training,
                    training_style: merged.training_style,
                    priority_muscles: merged.priority_muscles,
                    deprioritized_muscles: merged.deprioritized_muscles,
                    likes: merged.likes,
                    dislikes: merged.dislikes,
                    time_of_day: merged.time_of_day,
                    mobility_limitations: merged.mobility_limitations,
                    motivation: merged.motivation,
                    goal_type: merged.goal_type,
                    goal_deadline: merged.goal_deadline,
                    past_experience: merged.past_experience,
                });

                const result = await generateJSON({
                    prisma,
                    system: SYSTEM_PROMPT,
                    user: userPrompt,
                    schema: aiResponseSchema,
                    kind: 'ROUTINE',
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                });
                data = result.data;
                aiGenerationId = result.aiGenerationId;
                costUsd = result.costUsd;
                durationMs = result.durationMs;
            }

            // 3. Re-map AI-returned exercise_ids to real Exercise rows.
            //    If the model hallucinated an id, null it out and fall
            //    back to exercise_name_snapshot.
            const libIds = new Set(library.map((e) => e.id));
            const libById = new Map(library.map((e) => [e.id, e]));

            // 3b. Resolve a YouTube demo video for every exercise in
            //     parallel, BEFORE opening the DB transaction. Avoids
            //     holding a transaction open on a flaky scraper call.
            //     youtube-sr caches in-memory so repeats are free.
            //
            //     We run this for BOTH legacy and templated paths now —
            //     producto pidió que el templated mode también traiga
            //     videos. Si el lookup falla (red/scraper), cada ejercicio
            //     simplemente queda con video_url = null y seguimos.
            const exerciseNames = [];
            for (const d of data.days) {
                for (const ex of d.exercises) {
                    if (ex.exercise_name) exerciseNames.push(ex.exercise_name);
                }
            }
            let videoMap = new Map();
            try {
                videoMap = await searchExerciseVideosBatch(exerciseNames);
            } catch (e) {
                req.log.warn({ err: e.message }, '[ai-routines] video lookup batch failed');
            }
            const resolveVideoUrl = (exerciseName) => {
                if (!exerciseName) return null;
                const key = exerciseName
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[̀-ͯ]/g, '')
                    .replace(/[^a-z0-9\s-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const hit = videoMap.get(key);
                return hit?.url ?? null;
            };

            // 4. Transaction: deactivate previous active routines +
            //    create the new one with its days/exercises.
            const routine = await prisma.$transaction(async (tx) => {
                await tx.routine.updateMany({
                    where: { user_id: user.id, is_active: true },
                    data: { is_active: false, ended_at: new Date() },
                });

                // Los METADATOS de la rutina guardada vienen del INPUT
                // del socio (merged = body > routine_profile > defaults),
                // NO del template. Antes copiábamos de data.routine.*
                // que viene del template seleccionado — eso causaba que
                // un socio pidiendo WEIGHT_LOSS / 4d / HOME terminara
                // con goal=MUSCLE_GAIN, days=5, location=GYM porque el
                // template más cercano (Hombre 2025 5d MuscleGain) era
                // lo único que matcheaba al relajar constraints.
                // El name lo mantenemos del template si existe (es más
                // descriptivo que un nombre genérico), o caemos a uno
                // derivado del input.
                const objectiveLabel = {
                    WEIGHT_LOSS: 'Pérdida de grasa',
                    MUSCLE_GAIN: 'Hipertrofia',
                    MAINTENANCE: 'Mantenimiento',
                    STRENGTH: 'Fuerza',
                    ENDURANCE: 'Resistencia',
                    GENERAL_FITNESS: 'Fitness general',
                }[merged.objective] || merged.objective;
                const newRoutine = await tx.routine.create({
                    data: {
                        workspace_id: user.workspace_id,
                        user_id: user.id,
                        name: data.routine.name || `Rutina ${objectiveLabel} — ${firstName}`,
                        goal: merged.objective,
                        location: merged.location,
                        days_per_week: merged.days_per_week,
                        source: 'AI_GENERATED',
                        ai_generation_id: aiGenerationId,
                        is_active: true,
                        started_at: new Date(),
                    },
                });

                for (let dIdx = 0; dIdx < data.days.length; dIdx++) {
                    const d = data.days[dIdx];
                    const day = await tx.routineDay.create({
                        data: {
                            routine_id: newRoutine.id,
                            day_of_week: d.day_of_week,
                            title: d.title,
                            notes: d.notes ?? null,
                            order_index: dIdx,
                        },
                    });
                    const exerciseRows = d.exercises.map((ex, eIdx) => {
                        const realId = ex.exercise_id && libIds.has(ex.exercise_id)
                            ? ex.exercise_id
                            : null;
                        const libRow = realId ? libById.get(realId) : null;
                        // Priority for video_url:
                        //   1. resolved YouTube demo from the batch search
                        //   2. what the AI returned (usually null anyway)
                        //   3. curated video on the matched library row
                        const resolved = resolveVideoUrl(ex.exercise_name);
                        return {
                            routine_day_id: day.id,
                            exercise_id: realId,
                            exercise_name_snapshot: ex.exercise_name,
                            video_url: resolved ?? ex.video_url ?? libRow?.video_url ?? null,
                            sets: ex.sets,
                            reps: ex.reps,
                            rest_sec: ex.rest_sec,
                            order_index: eIdx,
                            notes: ex.notes ?? null,
                        };
                    });
                    if (exerciseRows.length > 0) {
                        await tx.routineExercise.createMany({ data: exerciseRows });
                    }
                }

                return newRoutine;
            });

            // Optional DB tracking write — gated by a SECOND flag so we
            // can ship code BEFORE the migration runs in prod. When
            // COACH_TEMPLATES_TRACKING_DB=true and the migration
            // 20260428220000_add_coach_templates_tracking has been
            // applied, this populates the new columns. Best-effort:
            // a failure (e.g. missing columns) just logs a warning and
            // does NOT roll back the routine that we already committed.
            if (
                useTemplates && tpl &&
                String(process.env.COACH_TEMPLATES_TRACKING_DB || '').toLowerCase() === 'true'
            ) {
                try {
                    await prisma.$executeRawUnsafe(
                        'UPDATE "routines" SET "template_id" = $1, "template_used_fallback" = $2 WHERE id = $3',
                        tpl.id,
                        usedTemplateFallback,
                        routine.id,
                    );
                } catch (e) {
                    req.log.warn(
                        { err: e?.message, routine_id: routine.id, template_id: tpl.id },
                        '[ai-routines] template tracking write failed — has the coach-templates-tracking migration been applied?',
                    );
                }
            }

            const full = await loadRoutineFull(prisma, routine.id);
            const responsePayload = {
                routine: full,
                ai: {
                    generation_id: aiGenerationId,
                    cost_usd: costUsd,
                    duration_ms: durationMs,
                },
            };
            if (useTemplates && tpl) {
                responsePayload.template = {
                    id: tpl.id,
                    source: tpl.source,
                    validation_ok: templateValidation ? templateValidation.ok : true,
                    validation_errors:
                        templateValidation && !templateValidation.ok
                            ? templateValidation.errors
                            : null,
                    used_fallback: usedTemplateFallback,
                    attempts: templateAttempts,
                };
            }

            // Recordatorio WA 1h después: la automation `routine.generated`
            // tiene delay_minutes: 60. Fire-and-forget — no rompe el
            // response al socio si el bus está abajo.
            await fireEvent('routine.generated', {
                workspaceId: req.user.workspace_id,
                userId,
                routineId: routine.id,
            });

            return reply.status(201).send(responsePayload);
        }
    );

    // ── GET /ai/routines/me ──────────────────────────────────────
    fastify.get(
        '/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const routine = await prisma.routine.findFirst({
                where: { user_id: userId, is_active: true },
                orderBy: { created_at: 'desc' },
                include: {
                    days: {
                        orderBy: { order_index: 'asc' },
                        include: {
                            exercises: {
                                orderBy: { order_index: 'asc' },
                                include: { exercise: true },
                            },
                        },
                    },
                },
            });
            return { routine };
        }
    );

    // ── GET /ai/routines/me/history ──────────────────────────────
    fastify.get(
        '/me/history',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const routines = await prisma.routine.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                include: {
                    days: {
                        orderBy: { order_index: 'asc' },
                        include: {
                            exercises: {
                                orderBy: { order_index: 'asc' },
                            },
                        },
                    },
                },
                take: 50,
            });
            return { routines };
        }
    );
}
