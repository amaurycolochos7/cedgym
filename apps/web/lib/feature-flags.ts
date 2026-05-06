// Build-time UI feature flags.
//
// These do NOT affect the backend — XP/level/badges still get awarded
// in the DB. Flipping a flag back to `true` re-enables the corresponding
// surfaces without any other changes.

// Gamification UI: page /portal/logros, XP column in admin members
// table, XP row in member detail. Pausada hasta que el flujo completo
// (XP correcto, badges automáticos, level-up) esté arreglado en el
// backend — ver apps/api/src/routes/checkins.js → bumpGamification()
// vs onCheckinCompleted().
export const GAMIFICATION_UI_ENABLED = false;
