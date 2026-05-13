/**
 * Helper compartido para construir el `initial` del FitnessProfileWizard.
 *
 * Bug que evita: el user tiene full_name/birth_date/gender en columnas
 * dedicadas de la tabla `users` (los pone al registrarse), pero también
 * tiene fitness_profile/routine_profile/nutrition_profile como JSON
 * blobs. Si solo mergeamos los blobs, esos 4 campos canónicos quedan
 * fuera y el wizard los pide otra vez aunque ya estén guardados.
 *
 * Política: los 4 campos del seed (full_name, birth_date, age, gender)
 * SIEMPRE ganan sobre lo que esté en los JSON blobs. Los blobs pueden
 * tener valores viejos / vacíos / incompletos — el user record es la
 * fuente de verdad para esos campos.
 */

export interface MeUserLike {
  full_name?: string | null;
  name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  fitness_profile?: Record<string, unknown> | null;
  routine_profile?: Record<string, unknown> | null;
  nutrition_profile?: Record<string, unknown> | null;
}

/**
 * Construye el objeto `initial` que se le pasa al wizard. Mergea los 3
 * profile JSONs y luego mete encima los 4 campos canónicos del user.
 * Devuelve null si no hay absolutamente nada que pre-llenar.
 *
 * Si `extraMerge` viene, se aplica DESPUÉS de los blobs y ANTES del
 * seed (para que el seed siga ganando — es el caso del rename de
 * nutrition_profile.objective → nutrition_objective en /portal/perfil).
 */
export function buildFitnessProfileInitial(
  u: MeUserLike | null | undefined,
  extraMerge: Record<string, unknown> = {},
): Record<string, unknown> | null {
  if (!u) return null;

  // 1) Profile JSONs (orden importa: el más "reciente" sobreescribe).
  const blobs: Record<string, unknown> = {
    ...(u.fitness_profile ?? {}),
    ...(u.routine_profile ?? {}),
    ...(u.nutrition_profile ?? {}),
    ...extraMerge,
  };

  // 2) Seed con los campos canónicos del user record.
  const seed: Record<string, unknown> = {};

  if (u.full_name && u.full_name.trim()) {
    seed.full_name = u.full_name.trim();
  } else if (u.name && u.name.trim()) {
    seed.full_name = u.name.trim();
  }

  if (u.birth_date) {
    const dob = new Date(u.birth_date);
    if (!Number.isNaN(dob.getTime())) {
      seed.birth_date = dob.toISOString().slice(0, 10);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const beforeBirthday =
        today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
      if (beforeBirthday) age -= 1;
      if (age >= 6 && age <= 99) seed.age = age;
    }
  }

  if (u.gender) {
    // El user model usa MALE/FEMALE/OTHER/PREFER_NOT_SAY; el wizard
    // solo entiende MALE/FEMALE/OTHER. Colapsamos PREFER_NOT_SAY a OTHER.
    const g = u.gender === 'PREFER_NOT_SAY' ? 'OTHER' : u.gender;
    seed.gender = g;
  }

  // 3) Seed AL FINAL — gana sobre los blobs en sus 4 campos.
  const merged: Record<string, unknown> = { ...blobs, ...seed };

  return Object.keys(merged).length ? merged : null;
}
