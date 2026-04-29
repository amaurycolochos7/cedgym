# Coach Templates — Schema

Templates del Coach Samuel cargados desde disco al boot. Hay dos tiers:

- **`source: "COACH_EXCEL"`** — transcripción literal de los Excels reales del coach
  (`rutina hombre 2025`, `Catia Perez` / Francia Pavón glúteo, `DIETA PATY HERRERA`).
  El selector los **prefiere siempre** sobre los GENERIC.
- **`source: "GENERIC"`** — fallback que cubre casos donde no hay Excel real
  (HOME, SENIOR). Sólo se eligen cuando ningún Excel encaja.

## `coach-templates/routines/<slug>.json`

```jsonc
{
  "id": "rt-hombre-real-5d-musclegain",
  "name": "Rutina Hombre 2025 — Coach Samuel (5 días)",
  "description": "...",
  "source": "COACH_EXCEL",                 // COACH_EXCEL | GENERIC
  "coach_signature": "No te preocupes por cargar mucho, preocúpate por hacerlo bien.",

  "objective": "MUSCLE_GAIN",               // FITNESS_GOALS de ai-routines.js
  "user_type": "ADULT",                     // ADULT | SENIOR | KID | ATHLETE
  "level": "INTERMEDIATE",                  // BEGINNER | INTERMEDIATE | ADVANCED
  "days_per_week": 5,                       // 2..6
  "location": "GYM",                        // GYM | HOME | BOTH
  "discipline": null,                       // null o DISCIPLINES
  "gender": "MALE",                         // MALE | FEMALE | null (agnóstico)

  "days": [
    {
      "day_of_week": 0,                     // 0=Lun .. 6=Dom
      "title": "Pecho y Tríceps",
      "notes": "Calienta 20 min en bicicleta antes de pisar el peso.",
      "exercises": [
        {
          "exercise_name": "Press de banco",
          "sets": 4,
          "reps": "15,12,10,8",             // string libre — Coach Samuel usa "10 pesadas / 10 livianas", "1 min", etc.
          "rest_sec": 90,
          "notes": "aumenta peso cada serie"
        }
      ]
    }
  ]
}
```

## `coach-templates/meals/<slug>.json`

```jsonc
{
  "id": "mp-paty-herrera-5m-musclegain",
  "name": "Dieta Paty Herrera — Coach Samuel (5 comidas)",
  "description": "...",
  "source": "COACH_EXCEL",
  "coach_signature": "Tomar 3 litros de agua diarios.",

  "objective": "MUSCLE_GAIN",
  "meals_per_day": 5,                       // 3 | 4 | 5
  "country": "MX",
  "gender": "FEMALE",                       // MALE | FEMALE | null
  "calories_target_kcal": 2000,
  "macros": { "protein_g": 170, "carbs_g": 220, "fats_g": 60 },
  "restrictions": [],

  "meals": [
    {
      "day_of_week": 0,
      "meal_type": "BREAKFAST",             // BREAKFAST | SNACK_AM | LUNCH | SNACK_PM | DINNER
      "name": "Al despertar + Desayuno (claras, atún y avena)",
      "description": "1. Al despertar...\n2. ...",
      "ingredients": ["5 claras de huevo", "60g atún en agua", "..."],
      "calories": 720,
      "protein_g": 60,
      "carbs_g": 95,
      "fats_g": 12,
      "prep_time_min": 25,
      "order_index": 0
    }
  ]
}
```

## Reglas de selección

**Regla de producto**: el selector **nunca devuelve null** mientras el
catálogo no esté vacío. Si no hay match exacto, relaja constraints en
capas hasta encontrar el COACH_EXCEL más cercano.

### Capas de relajación (routines)

| Capa | Constraints que aún deben coincidir |
|------|-------------------------------------|
| L1   | objective, gender, location, discipline, user_type, level, days_per_week |
| L2   | drop **level** |
| L3   | drop **user_type** |
| L4   | drop **days_per_week** (la cercanía cuenta en el tie-break) |
| L5   | drop **discipline** |
| L6   | drop **location** |
| L7   | drop **gender** |
| L8   | drop **objective** — último recurso, picks "el COACH_EXCEL más cercano" |

### Capas de relajación (meals)

| Capa | Constraints que aún deben coincidir |
|------|-------------------------------------|
| L1   | objective, gender, country, meals_per_day |
| L2   | drop **meals_per_day** (cercanía en tie-break) |
| L3   | drop **country** |
| L4   | drop **objective** |
| L5   | drop **gender** — último recurso |

### Tie-break dentro de un layer (menor gana)

1. `source`: `COACH_EXCEL` (0) < `GENERIC` (1) — siempre se prefiere coach
2. distancia de `days_per_week` (routines) o `calories_target` + `meals_per_day` (meals)
3. `id` alfabético

## Catálogo actual

**Routines (4):**

| id                                                | source       | gender | objective       | user_type | days | location |
|---------------------------------------------------|--------------|--------|-----------------|-----------|------|----------|
| `rt-hombre-real-5d-musclegain`                    | COACH_EXCEL  | MALE   | MUSCLE_GAIN     | ADULT     | 5    | GYM      |
| `rt-mujer-gluteo-5d-musclegain`                   | COACH_EXCEL  | FEMALE | MUSCLE_GAIN     | ADULT     | 5    | GYM      |
| `rt-musclegain-3d-adult-intermediate-home`        | GENERIC      | null   | MUSCLE_GAIN     | ADULT     | 3    | HOME     |
| `rt-generalfitness-3d-senior-beginner`            | GENERIC      | null   | GENERAL_FITNESS | SENIOR    | 3    | GYM      |

**Meals (3):**

| id                              | source       | gender | objective    | meals_per_day | kcal |
|---------------------------------|--------------|--------|--------------|---------------|------|
| `mp-cs-diet-base-unisex`        | COACH_EXCEL  | null   | MAINTENANCE  | 4             | 2200 |
| `mp-paty-herrera-5m-musclegain` | COACH_EXCEL  | null   | MUSCLE_GAIN  | 5             | 2000 |
| `mp-weightloss-4m-mx`           | GENERIC      | null   | WEIGHT_LOSS  | 4             | 1800 |
