'use client';

/* -------------------------------------------------------------------------
 * ExerciseMedia
 *
 * Animated exercise demonstrations for the routine view. Pulls illustrated
 * frames from free-exercise-db (yuhonas/free-exercise-db on GitHub raw).
 *
 * Why this source:
 *   - No API key, no rate limit in practice (GitHub raw CDN).
 *   - Every exercise has 0.jpg + 1.jpg — we cross-fade between them to
 *     synthesize a low-key animation (no real GIF needed).
 *   - Everything is fetched on demand; nothing is stored locally.
 *
 * Strategy:
 *   1. Normalize the Spanish name (strip accents, lowercase, drop filler).
 *   2. Try a small hardcoded Spanish-to-slug map first — this covers the
 *      overwhelmingly common exercises without ever hitting the network
 *      for lookup metadata.
 *   3. If unmapped, lazily fetch the ~1 MB exercises.json index (once per
 *      session thanks to React Query's Infinity cache) and do a best-effort
 *      substring match against English names.
 *   4. On any failure, render a branded Dumbbell placeholder. Never throws.
 * -------------------------------------------------------------------------*/

import { useQuery } from '@tanstack/react-query';
import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';

type Size = 'sm' | 'md' | 'lg';

const RAW_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const INDEX_URL = `${RAW_BASE}/dist/exercises.json`;
const img = (slug: string, frame: 0 | 1) =>
  `${RAW_BASE}/exercises/${slug}/${frame}.jpg`;

const SIZE_MAP: Record<
  Size,
  { box: string; icon: string; label: string }
> = {
  sm: {
    box: 'w-20 h-20',
    icon: 'w-7 h-7',
    label: 'text-[10px]',
  },
  md: {
    box: 'w-48 h-48',
    icon: 'w-10 h-10',
    label: 'text-xs',
  },
  lg: {
    box: 'w-80 h-60',
    icon: 'w-14 h-14',
    label: 'text-sm',
  },
};

/* ------------------------------------------------------------------ */
/* Name normalization + Spanish → slug lookup                          */
/* ------------------------------------------------------------------ */

const FILLER_WORDS = new Set(['en', 'con', 'de', 'del', 'la', 'el', 'los', 'las', 'a', 'al']);

/** Strip accents, lowercase, collapse whitespace, drop filler words. */
function normalize(input: string): string {
  const stripped = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped
    .split(' ')
    .filter((w) => w && !FILLER_WORDS.has(w))
    .join(' ');
}

/**
 * Hardcoded Spanish/English → free-exercise-db slug map. Keys are already
 * normalized (see `normalize`). These slugs were verified to return 200 for
 * both 0.jpg and 1.jpg on the GitHub raw CDN.
 */
const SLUG_MAP: Record<string, string> = {
  // Chest
  'press banca': 'Barbell_Bench_Press_-_Medium_Grip',
  'press banco': 'Barbell_Bench_Press_-_Medium_Grip',
  'bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'press banca inclinado': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'press inclinado': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'press banca cerrado': 'Close-Grip_Barbell_Bench_Press',
  'press cerrado': 'Close-Grip_Barbell_Bench_Press',
  'flexiones': 'Pushups',
  'flexion': 'Pushups',
  'lagartijas': 'Pushups',
  'push ups': 'Pushups',
  'push up': 'Pushups',
  'pushups': 'Pushups',
  'fondos': 'Dips_-_Chest_Version',
  'dips': 'Dips_-_Chest_Version',
  'aperturas': 'Dumbbell_Flyes',
  'aperturas mancuernas': 'Dumbbell_Flyes',

  // Back
  'remo barra': 'Bent_Over_Barbell_Row',
  'remo barra inclinado': 'Bent_Over_Barbell_Row',
  'remo inclinado': 'Bent_Over_Barbell_Row',
  'barbell row': 'Bent_Over_Barbell_Row',
  'remo': 'Bent_Over_Barbell_Row',
  'remo mancuerna': 'Bent_Over_One-Arm_Long_Bar_Row',
  'remo t': 'T-Bar_Row_with_Handle',
  'dominadas': 'Pullups',
  'pull ups': 'Pullups',
  'pullups': 'Pullups',
  'pull up': 'Pullups',
  'jalon pecho': 'Wide-Grip_Lat_Pulldown',
  'jalon': 'Wide-Grip_Lat_Pulldown',
  'pulldown': 'Wide-Grip_Lat_Pulldown',

  // Legs
  'sentadilla': 'Barbell_Full_Squat',
  'sentadillas': 'Barbell_Full_Squat',
  'squat': 'Barbell_Full_Squat',
  'squats': 'Barbell_Full_Squat',
  'peso muerto': 'Barbell_Deadlift',
  'deadlift': 'Barbell_Deadlift',
  'deadlifts': 'Barbell_Deadlift',
  'desplantes': 'Barbell_Lunge',
  'zancadas': 'Barbell_Lunge',
  'lunges': 'Barbell_Lunge',
  'lunge': 'Barbell_Lunge',
  'hip thrust': 'Barbell_Hip_Thrust',
  'empuje cadera': 'Barbell_Hip_Thrust',
  'prensa': 'Leg_Press',
  'prensa piernas': 'Leg_Press',
  'leg press': 'Leg_Press',
  'extension cuadriceps': 'Leg_Extensions',
  'extensiones cuadriceps': 'Leg_Extensions',
  'leg extension': 'Leg_Extensions',
  'curl femoral': 'Lying_Leg_Curls',
  'femoral': 'Lying_Leg_Curls',
  'leg curl': 'Lying_Leg_Curls',
  'pantorrillas': 'Standing_Calf_Raises',
  'elevacion pantorrilla': 'Standing_Calf_Raises',
  'calf raise': 'Standing_Calf_Raises',

  // Shoulders
  'press militar': 'Barbell_Shoulder_Press',
  'shoulder press': 'Barbell_Shoulder_Press',
  'overhead press': 'Barbell_Shoulder_Press',
  'press hombros': 'Barbell_Shoulder_Press',
  'elevaciones laterales': 'Side_Lateral_Raise',
  'elevaciones lateral': 'Side_Lateral_Raise',
  'lateral raise': 'Side_Lateral_Raise',
  'elevaciones frontales': 'Front_Dumbbell_Raise',
  'front raise': 'Front_Dumbbell_Raise',
  'pajaro': 'Reverse_Flyes',
  'pajaros': 'Reverse_Flyes',
  'rear delt': 'Reverse_Flyes',
  'reverse fly': 'Reverse_Flyes',

  // Arms
  'curl biceps': 'Barbell_Curl',
  'curl de biceps': 'Barbell_Curl',
  'curl barra': 'Barbell_Curl',
  'biceps curl': 'Barbell_Curl',
  'curl mancuernas': 'Dumbbell_Bicep_Curl',
  'curl martillo': 'Hammer_Curls',
  'hammer curl': 'Hammer_Curls',
  'extensiones triceps': 'Triceps_Pushdown',
  'extension triceps': 'Triceps_Pushdown',
  'triceps extension': 'Triceps_Pushdown',
  'triceps pushdown': 'Triceps_Pushdown',
  'copa': 'Seated_Triceps_Press',
  'frances': 'EZ-Bar_Skullcrusher',
  'skullcrusher': 'EZ-Bar_Skullcrusher',

  // Core / cardio
  'plancha': 'Plank',
  'plank': 'Plank',
  'abdominales': 'Crunch_-_Legs_On_Exercise_Ball',
  'crunch': 'Crunch_-_Legs_On_Exercise_Ball',
  'crunches': 'Crunch_-_Legs_On_Exercise_Ball',
  'mountain climbers': 'Mountain_Climbers',
  'mountain climber': 'Mountain_Climbers',
  'escaladores': 'Mountain_Climbers',
};

/* ------------------------------------------------------------------ */
/* Index (lazy, once-per-session)                                      */
/* ------------------------------------------------------------------ */

type IndexEntry = { id: string; name: string };

async function fetchIndex(): Promise<IndexEntry[]> {
  const res = await fetch(INDEX_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`index ${res.status}`);
  const raw = (await res.json()) as Array<{ id: string; name: string }>;
  // Strip the dataset down to just what we need for matching.
  return raw.map((r) => ({ id: r.id, name: r.name.toLowerCase() }));
}

/** Substring-match the normalized query against every name in the index. */
function findInIndex(index: IndexEntry[], normalized: string): string | null {
  if (!normalized) return null;
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return null;

  // Prefer entries where ALL tokens appear, pick the shortest name
  // (usually the canonical variant: "Plank" beats "Push Up to Side Plank").
  let best: IndexEntry | null = null;
  for (const entry of index) {
    if (tokens.every((t) => entry.name.includes(t))) {
      if (!best || entry.name.length < best.name.length) best = entry;
    }
  }
  if (best) return best.id;

  // Fallback: any entry containing the longest token.
  const longest = tokens.reduce((a, b) => (a.length >= b.length ? a : b));
  for (const entry of index) {
    if (entry.name.includes(longest)) return entry.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export type ExerciseMediaResult = {
  url?: string;
  sourceUrl?: string;
  frames?: [string, string];
  isLoading: boolean;
  isError: boolean;
};

export function useExerciseMedia(name: string): ExerciseMediaResult {
  const normalized = normalize(name || '');
  const directSlug = SLUG_MAP[normalized];

  // Only fetch the index if the direct map misses. React Query dedupes
  // across every card in the view, and staleTime:Infinity means once per
  // session in practice.
  const indexQuery = useQuery({
    queryKey: ['exercise-media', 'index'],
    queryFn: fetchIndex,
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: !directSlug && normalized.length > 0,
    retry: 1,
  });

  const slug =
    directSlug ?? (indexQuery.data ? findInIndex(indexQuery.data, normalized) : null);

  if (!normalized) {
    return { isLoading: false, isError: true };
  }

  if (directSlug) {
    return {
      url: img(directSlug, 0),
      sourceUrl: `https://github.com/yuhonas/free-exercise-db`,
      frames: [img(directSlug, 0), img(directSlug, 1)],
      isLoading: false,
      isError: false,
    };
  }

  if (indexQuery.isLoading) {
    return { isLoading: true, isError: false };
  }

  if (!slug) {
    return { isLoading: false, isError: true };
  }

  return {
    url: img(slug, 0),
    sourceUrl: `https://github.com/yuhonas/free-exercise-db`,
    frames: [img(slug, 0), img(slug, 1)],
    isLoading: false,
    isError: false,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function Placeholder({
  name,
  size,
}: {
  name: string;
  size: Size;
}) {
  const s = SIZE_MAP[size];
  // Deterministic hue per exercise so cards still feel visually distinct
  // even when we fall back — keep within a blue/indigo band.
  const hue = Array.from(name).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 40;
  return (
    <div
      className={`${s.box} shrink-0 rounded-xl overflow-hidden ring-1 ring-slate-200 relative flex flex-col items-center justify-center gap-1 bg-slate-50`}
      style={{
        background: `linear-gradient(135deg, hsl(${210 + hue}, 85%, 96%), hsl(${220 + hue}, 80%, 90%))`,
      }}
      aria-label={name}
    >
      <Dumbbell className={`${s.icon} text-blue-600/70`} strokeWidth={1.5} />
      {size !== 'sm' && (
        <span
          className={`${s.label} font-medium text-slate-600/80 px-2 text-center line-clamp-2`}
        >
          {name}
        </span>
      )}
    </div>
  );
}

function Skeleton({ size }: { size: Size }) {
  const s = SIZE_MAP[size];
  return (
    <div
      className={`${s.box} shrink-0 rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 animate-pulse`}
      aria-hidden="true"
    />
  );
}

export function ExerciseMedia({
  name,
  size = 'md',
}: {
  name: string;
  size?: Size;
}) {
  const s = SIZE_MAP[size];
  const media = useExerciseMedia(name);
  const [frame, setFrame] = useState<0 | 1>(0);
  const [imgFailed, setImgFailed] = useState(false);

  // Cross-fade between the two frames every 800ms to fake motion.
  useEffect(() => {
    if (!media.frames) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f === 0 ? 1 : 0));
    }, 800);
    return () => window.clearInterval(id);
  }, [media.frames]);

  // Reset the image-error flag when the underlying exercise changes.
  useEffect(() => {
    setImgFailed(false);
  }, [media.frames?.[0]]);

  if (media.isLoading) return <Skeleton size={size} />;
  if (media.isError || !media.frames || imgFailed)
    return <Placeholder name={name} size={size} />;

  const [a, b] = media.frames;

  return (
    <div
      className={`${s.box} shrink-0 rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-50 relative`}
      aria-label={name}
      role="img"
    >
      {/* Both frames stacked; opacity cross-fade drives the illusion of motion. */}
      <img
        src={a}
        alt=""
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${frame === 0 ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setImgFailed(true)}
        loading="lazy"
        draggable={false}
      />
      <img
        src={b}
        alt=""
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${frame === 1 ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setImgFailed(true)}
        loading="lazy"
        draggable={false}
        aria-hidden="true"
      />
    </div>
  );
}

export default ExerciseMedia;
