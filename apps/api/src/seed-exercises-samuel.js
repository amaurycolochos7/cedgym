// ─────────────────────────────────────────────────────────────────
// Seed del Coach Samuel Oswaldo — ejercicios extraídos de los
// Excels del cliente (Catia Perez.xlsx, rutina hombre 2025.xlsx).
//
// Uso: pnpm --filter @cedgym/api seed:exercises:samuel
//
// Este script REEMPLAZA los ejercicios genéricos por la biblioteca
// real del Coach, conservando sus nombres tal cual los usa, sets/reps
// exactos y notas de ejecución firma ("sube controlado y aprieta
// arriba 1 segundo", "no te preocupes por cargar mucho", etc.).
//
// Idempotente: usa findFirst + update/create por (workspace_id, slug).
// ─────────────────────────────────────────────────────────────────

import { prisma } from '@cedgym/db';

// Limpia acentos rotos y normaliza a minúsculas limpias.
function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

// Title-case conservando acrónimos (TRX, ABS).
function prettify(s) {
  const acronyms = new Set(['TRX', 'ABS', 'T', '21']);
  return s
    .toLowerCase()
    .replace(/(^|\s|\/)([a-zñáéíóú])/g, (m) => m.toUpperCase())
    .split(' ')
    .map((w) => (acronyms.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join(' ')
    .trim();
}

// Heurística: si los reps incluyen "min", "segundo", "isometric" → iso.
// Si el nombre tiene "press", "sentadilla", "peso muerto", "remo" → compound.
function inferLevel(name, repsStr) {
  const n = name.toLowerCase();
  if (/isometric|isometrico|1\s*min|30s/i.test(repsStr) && /plank|sentadilla|puente/.test(n)) {
    return 'BEGINNER';
  }
  if (/peso muerto|clean|thruster|hack|press militar|dominada|pull-up|barbell|barra/.test(n)) {
    return 'INTERMEDIATE';
  }
  if (/sumo|olimpic|snatch|jerk|burpee|clean and press|man maker/.test(n)) {
    return 'ADVANCED';
  }
  return 'INTERMEDIATE';
}

// Mapea etiquetas de día a MuscleGroup enum.
const GROUP_MAP = {
  'Pecho': 'CHEST',
  'Pecho Y Triceps': 'CHEST',
  'Espalda': 'BACK',
  'Espalda Y Hombro': 'BACK',
  'Pierna': 'LEGS',
  'Cuadriceps': 'LEGS',
  'Femoral Y Pompi': 'LEGS',
  'Hombro': 'SHOULDERS',
  'Brazo': 'ARMS',
  'Brazo, Antebrazo Y Trapecio': 'ARMS',
  'Entrenamiento Funcional': 'FULL_BODY',
};

// Heurística para agrupar un ejercicio cuyo día compartido sea ambiguo
// (pecho + tríceps → pecho si tiene "banco/fly", tríceps si tiene "patada/press frances").
function refineGroup(exerciseName, dayGroup) {
  const n = exerciseName.toLowerCase();
  if (dayGroup === 'CHEST') {
    if (/(patada|press frances|pres frances|push|pull down|fondos|pull-?down|frances)/i.test(n)) {
      return 'ARMS'; // tríceps
    }
    return 'CHEST';
  }
  if (dayGroup === 'BACK') {
    if (/(press militar|latera|frontal|circulos|shoulder|deltoides)/i.test(n)) {
      return 'SHOULDERS';
    }
    return 'BACK';
  }
  if (dayGroup === 'LEGS') {
    if (/(pantorrilla|gemelos)/i.test(n)) return 'LEGS';
    if (/(abs|abdominal|plank|hiperextension)/i.test(n)) return 'CORE';
    return 'LEGS';
  }
  if (dayGroup === 'ARMS') {
    if (/(abdominal|abs)/i.test(n)) return 'CORE';
    return 'ARMS';
  }
  return dayGroup;
}

// Detecta equipo implícito en el nombre del ejercicio.
function inferEquipment(name) {
  const n = name.toLowerCase();
  const eq = [];
  if (/mancuerna|mancuera|mancuernas/.test(n)) eq.push('dumbbell');
  if (/barra/.test(n)) eq.push('barbell');
  if (/polea|poleas|polleas/.test(n)) eq.push('cable');
  if (/prensa/.test(n)) eq.push('machine');
  if (/maquina|máquina|hack/.test(n)) eq.push('machine');
  if (/trx/.test(n)) eq.push('trx');
  if (/banco|paralelas|predicador/.test(n)) eq.push('bench');
  if (/bicicleta/.test(n)) eq.push('bike');
  if (/llanta|marro|escalera|vallas|vayas/.test(n)) eq.push('functional');
  if (/cuerda/.test(n)) eq.push('jump_rope');
  if (/plank|flexion|flexiones|mountain climber|saltos|burpee|yoguis|supinacion|pronacion|coordinacion/.test(n)) {
    eq.push('bodyweight');
  }
  if (eq.length === 0) eq.push('bodyweight');
  return [...new Set(eq)];
}

// Biblioteca extraída de los Excels del cliente.
// Cada entrada: { name, dayGroup, sets_reps, coachNote? }
const EXERCISES = [
  // ============ PECHO (hombre + mujer) ============
  { name: 'Press de Banco', dayGroup: 'CHEST', sets_reps: '15,12,10,8' },
  { name: 'Press de Banco Inclinado', dayGroup: 'CHEST', sets_reps: '15,12,10,8' },
  { name: 'Press de Banco Declinado con Mancuernas', dayGroup: 'CHEST', sets_reps: '4x15' },
  { name: 'Press de Banco Declinado', dayGroup: 'CHEST', sets_reps: '4x15' },
  { name: 'Flys', dayGroup: 'CHEST', sets_reps: '4x25' },
  { name: 'Preck Deck', dayGroup: 'CHEST', sets_reps: '4x15' },

  // ============ TRÍCEPS (extraídos del día Pecho+Tríceps) ============
  { name: 'Fondos en Banco', dayGroup: 'CHEST', sets_reps: '4-15', coachNote: 'Codos pegados al cuerpo' },
  { name: 'Fondos en Banco Paralelos', dayGroup: 'CHEST', sets_reps: '4-20' },
  { name: 'Push 3 Posiciones', dayGroup: 'CHEST', sets_reps: '4x10' },
  { name: 'Patada de Mula', dayGroup: 'CHEST', sets_reps: '4x15' },
  { name: 'Patada de Mula con TRX', dayGroup: 'CHEST', sets_reps: '4x15 aumentando el peso' },
  { name: 'Press Francés', dayGroup: 'CHEST', sets_reps: '15,12,10,8 aumentando de peso', coachNote: 'Codos fijos, no abras brazos' },
  { name: 'Pull Down', dayGroup: 'CHEST', sets_reps: '15,12,10,8' },

  // ============ PIERNA / CUÁDRICEPS ============
  { name: 'Sentadilla', dayGroup: 'LEGS', sets_reps: '15,12,10,8 subiendo de peso' },
  { name: 'Sentadilla Frontal', dayGroup: 'LEGS', sets_reps: '4-15' },
  { name: 'Sentadilla Isométrica', dayGroup: 'LEGS', sets_reps: '3x1min', coachNote: 'Talones arriba' },
  { name: 'Sentadilla Hack', dayGroup: 'LEGS', sets_reps: '3x25' },
  { name: 'Sentadilla con Barra', dayGroup: 'LEGS', sets_reps: '10,8,6,3,2,1', coachNote: 'Haz una falla al final con peso ligero' },
  { name: 'Sentadilla Profunda con Propio Peso', dayGroup: 'LEGS', sets_reps: '100 reps' },
  { name: 'Desplantes', dayGroup: 'LEGS', sets_reps: '4x20' },
  { name: 'Desplante Búlgaro', dayGroup: 'LEGS', sets_reps: '4x12' },
  { name: 'Desplante Isométrico', dayGroup: 'LEGS', sets_reps: '4-1min', coachNote: 'Con cada pierna' },
  { name: 'Desplantes Laterales', dayGroup: 'LEGS', sets_reps: '3x8' },
  { name: 'Saltos Desplantes', dayGroup: 'LEGS', sets_reps: '4x20' },
  { name: 'Saltos Haciendo Sentadilla', dayGroup: 'LEGS', sets_reps: '4x10' },
  { name: 'Steps con Mancuernas', dayGroup: 'LEGS', sets_reps: '3-1min' },
  { name: 'Prensa Piernas Juntas', dayGroup: 'LEGS', sets_reps: '4x15' },
  { name: 'Prensa Piernas Abierta y Cerrada', dayGroup: 'LEGS', sets_reps: '4-10' },
  { name: 'Prensa Piernas Cerradas', dayGroup: 'LEGS', sets_reps: '15,12,10,8 aumentando peso' },
  { name: 'Extensiones de Cuádriceps', dayGroup: 'LEGS', sets_reps: '10 pesadas 10 livianas', coachNote: 'Sube controlado y aprieta arriba 1 segundo' },
  { name: 'Abductores', dayGroup: 'LEGS', sets_reps: '3x8' },
  { name: 'Aductores', dayGroup: 'LEGS', sets_reps: '3x8' },

  // ============ FEMORAL Y GLÚTEOS ============
  { name: 'Peso Muerto Sumo', dayGroup: 'LEGS', sets_reps: '3x15' },
  { name: 'Peso Muerto Rígido', dayGroup: 'LEGS', sets_reps: '4-20', coachNote: 'Trabaja glúteos, femorales y cadera' },
  { name: 'Reverencias (Good Morning)', dayGroup: 'LEGS', sets_reps: '4-12', coachNote: 'Espalda recta, baja el torso hacia adelante' },
  { name: 'Curl de Pierna Acostado', dayGroup: 'LEGS', sets_reps: '10 pesadas 10 livianas' },
  { name: 'Curl de Pierna de Pie', dayGroup: 'LEGS', sets_reps: '4-20' },
  { name: 'Curl de Pierna Boca Abajo', dayGroup: 'LEGS', sets_reps: '4-15' },
  { name: 'Curl Femoral Sentado', dayGroup: 'LEGS', sets_reps: '10 pesadas 10 livianas' },
  { name: 'Puentes (Hip Thrust)', dayGroup: 'LEGS', sets_reps: '15,12,10,8 aumentando de peso' },
  { name: 'Patada Atrás y Lateral con Polea', dayGroup: 'LEGS', sets_reps: '4-12' },
  { name: 'Patada de Mula para Glúteo', dayGroup: 'LEGS', sets_reps: '10 pesadas 10 livianas' },
  { name: 'Pantorrilla 3 Posiciones', dayGroup: 'LEGS', sets_reps: '4x25' },
  { name: 'Pantorrilla', dayGroup: 'LEGS', sets_reps: '4-15' },
  { name: 'Hiperextensiones', dayGroup: 'LEGS', sets_reps: '4-25', coachNote: 'Enfocado en zona lumbar y glúteo' },

  // ============ ESPALDA ============
  { name: 'Remo en Máquina', dayGroup: 'BACK', sets_reps: '6 pesadas 12 livianas 4 series' },
  { name: 'Remo en Barra T', dayGroup: 'BACK', sets_reps: '10 pesadas 10 livianas 4 series' },
  { name: 'Jalón al Frente', dayGroup: 'BACK', sets_reps: '4-15' },
  { name: 'Jalón Invertido', dayGroup: 'BACK', sets_reps: '4-15' },
  { name: 'Jalón con Ángulo', dayGroup: 'BACK', sets_reps: '4-15' },

  // ============ HOMBRO ============
  { name: 'Press Militar en Aparato', dayGroup: 'SHOULDERS', sets_reps: '4-15' },
  { name: 'Press Militar con Mancuernas', dayGroup: 'SHOULDERS', sets_reps: '4-15' },
  { name: 'Laterales', dayGroup: 'SHOULDERS', sets_reps: '4-15' },
  { name: 'Laterales Poliquin', dayGroup: 'SHOULDERS', sets_reps: '4-15' },
  { name: 'Laterales con Polea Alta', dayGroup: 'SHOULDERS', sets_reps: '4-15', coachNote: 'Movimiento controlado sin impulso' },
  { name: 'Frontal con Disco', dayGroup: 'SHOULDERS', sets_reps: '4-15' },
  { name: 'Círculos con Mancuerna', dayGroup: 'SHOULDERS', sets_reps: '4-15', coachNote: 'Adelante y atrás' },

  // ============ BRAZO (BÍCEPS) ============
  { name: 'Curl de Bíceps', dayGroup: 'ARMS', sets_reps: '4-15' },
  { name: 'Curl 21', dayGroup: 'ARMS', sets_reps: '4-15', coachNote: '7 reps abajo, 7 arriba, 7 completos' },
  { name: 'Curl Martillo', dayGroup: 'ARMS', sets_reps: '4-15', coachNote: 'Palmas mirando hacia adentro' },
  { name: 'Curl Martillo en 21', dayGroup: 'ARMS', sets_reps: '4-15' },
  { name: 'Curl Predicador', dayGroup: 'ARMS', sets_reps: '4-15', coachNote: 'Brazos apoyados sin despegar' },
  { name: 'Curl Predicador 3 Posiciones', dayGroup: 'ARMS', sets_reps: '4-15' },
  { name: 'Curl Concentrado', dayGroup: 'ARMS', sets_reps: '4-15', coachNote: 'Sube lento y aprieta arriba' },

  // ============ ANTEBRAZO ============
  { name: 'Supinación', dayGroup: 'ARMS', sets_reps: '4-15' },
  { name: 'Pronación', dayGroup: 'ARMS', sets_reps: '4-20' },
  { name: 'Isométrico Sosteniendo Mancuernas', dayGroup: 'ARMS', sets_reps: '4x1:30 min' },

  // ============ CORE ============
  { name: 'Abdominales', dayGroup: 'CORE', sets_reps: '100 reps' },
  { name: 'Plank', dayGroup: 'CORE', sets_reps: '4x1 min' },
  { name: 'Abs Wheels', dayGroup: 'CORE', sets_reps: '100 reps' },
  { name: 'Abs Mesedoras', dayGroup: 'CORE', sets_reps: '100 reps' },
  { name: 'Abs Libros', dayGroup: 'CORE', sets_reps: '100 reps' },

  // ============ FUNCIONAL ============
  { name: 'Voltear la Llanta', dayGroup: 'FULL_BODY', sets_reps: '3x15' },
  { name: 'Golpeo con Marro', dayGroup: 'FULL_BODY', sets_reps: '3x20' },
  { name: 'Coordinación con Escalera', dayGroup: 'FULL_BODY', sets_reps: '10 ejercicios diferentes' },
  { name: 'Yoguis con Vallas', dayGroup: 'FULL_BODY', sets_reps: '3x10', coachNote: 'De frente, de lado y en desliz' },
  { name: 'Mountain Climbers', dayGroup: 'FULL_BODY', sets_reps: '4x1 min' },
  { name: 'Burpees', dayGroup: 'FULL_BODY', sets_reps: '3x15' },

  // ============ CARDIO ============
  { name: 'Bicicleta Estática', dayGroup: 'CARDIO', sets_reps: '20 min', coachNote: 'Usa como calentamiento' },
  { name: 'Remadora', dayGroup: 'CARDIO', sets_reps: '15 min' },
  { name: 'Elíptica', dayGroup: 'CARDIO', sets_reps: '20 min' },
  { name: 'Caminadora Inclinada', dayGroup: 'CARDIO', sets_reps: '20 min al 10%' },
  { name: 'Esquí (SkiErg)', dayGroup: 'CARDIO', sets_reps: '10 min' },
  { name: 'Saltar Cuerda', dayGroup: 'CARDIO', sets_reps: '10x1 min' },
  { name: 'Correr', dayGroup: 'CARDIO', sets_reps: '30 min ritmo moderado' },
];

// Default sets/rest/reps derivation from sets_reps string.
function deriveDefaults(sets_reps) {
  const s = sets_reps.toLowerCase();
  let default_sets = 4;
  let default_reps = s;
  let default_rest_sec = 60;

  // Match "3x15", "4X15", "4-15", etc.
  const m = s.match(/(\d+)\s*[x\-]\s*(\d+.*?)$/i);
  if (m) {
    default_sets = parseInt(m[1], 10);
    default_reps = m[2].trim();
  } else if (/^\d+[\s,]/.test(s)) {
    // "15,12,10,8" or "10,8,6,3,2,1" — drop sets, save the ramp as reps
    default_sets = s.split(',').length;
    default_reps = s;
  } else if (/min/.test(s)) {
    default_reps = s;
    default_rest_sec = 45;
  } else if (/^\d+\s*reps?/.test(s)) {
    default_sets = 1;
    default_reps = s;
  }

  // Rest: iso/cardio less rest, heavy compounds more rest
  if (/1\s*min|30s|iso/.test(s)) default_rest_sec = 45;
  if (/pesadas|pesado|heavy/.test(s)) default_rest_sec = 120;
  if (/peso muerto|sentadilla con barra/.test(s)) default_rest_sec = 120;

  return { default_sets, default_reps, default_rest_sec };
}

async function run() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'ced-gym' } });
  if (!ws) {
    throw new Error(
      'Workspace "ced-gym" no encontrado. Corre primero `pnpm --filter @cedgym/api seed`.'
    );
  }
  console.log(`Workspace: ${ws.name} (${ws.id})`);

  let created = 0;
  let updated = 0;
  const slugsSeen = new Set();

  for (const ex of EXERCISES) {
    const muscle_group = refineGroup(prettify(ex.name), ex.dayGroup);
    const name = prettify(ex.name);
    let slug = slugify(ex.name);
    // Evita colisión del slug en el set local (por si "Abdominales" aparece
    // varias veces) añadiendo sufijo de muscle_group cuando ya exista.
    if (slugsSeen.has(slug)) {
      slug = `${slug}-${muscle_group.toLowerCase()}`;
    }
    slugsSeen.add(slug);

    const level = inferLevel(ex.name, ex.sets_reps);
    const equipment = inferEquipment(ex.name);
    const { default_sets, default_reps, default_rest_sec } = deriveDefaults(ex.sets_reps);

    // Descripción: usa la nota del coach si viene, si no compón una estándar.
    const description = ex.coachNote
      ? `${ex.coachNote}.`
      : `Ejercicio de ${muscle_group.toLowerCase()} del programa del Coach Samuel. Ejecuta con técnica controlada.`;

    // Video de búsqueda como placeholder — el admin subirá sus propios videos.
    const video_url = `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' tecnica')}`;

    const existing = await prisma.exercise.findFirst({
      where: { workspace_id: ws.id, slug },
    });

    const data = {
      workspace_id: ws.id,
      name,
      slug,
      muscle_group,
      equipment,
      level,
      video_url,
      description,
      default_sets,
      default_reps,
      default_rest_sec,
      is_active: true,
    };

    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.exercise.create({ data });
      created++;
    }
  }

  const total = await prisma.exercise.count({ where: { workspace_id: ws.id } });
  console.log(
    `\n✅ Seed completado — ${created} creados, ${updated} actualizados. ` +
    `Total en biblioteca: ${total} ejercicios.`
  );
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
