'use client';

/* -------------------------------------------------------------------------
 * ExerciseMedia — web-native SVG animations for exercise cards.
 *
 * No external images, no network, no API keys. Each exercise is classified
 * into one of ~10 movement patterns by name keywords, and the pattern is
 * rendered as a minimalist SVG scene looping infinitely via framer-motion.
 *
 * Why not photos:
 *   Real-person photos clash with the brand's clean slate/blue/glass
 *   language. A stylized motion abstraction matches the Apple-Fitness /
 *   Centr / Freeletics aesthetic the rest of the portal is going for.
 *
 * Public API (unchanged from the previous photo version):
 *   <ExerciseMedia name="Press banca" size="sm" />
 *   useExerciseMedia("Sentadilla") → { pattern, isLoading, isError }
 * -------------------------------------------------------------------------*/

import { motion } from 'framer-motion';

type Size = 'sm' | 'md' | 'lg';

type Pattern =
  | 'bench-push'
  | 'squat'
  | 'deadlift'
  | 'row'
  | 'pullup'
  | 'overhead-press'
  | 'curl'
  | 'extension'
  | 'plank'
  | 'cardio'
  | 'jump'
  | 'generic';

const SIZE_MAP: Record<Size, { w: number; h: number; box: string }> = {
  sm: { w: 80, h: 80, box: 'w-20 h-20' },
  md: { w: 192, h: 192, box: 'w-48 h-48' },
  lg: { w: 320, h: 240, box: 'w-80 h-60' },
};

/* ------------------------------------------------------------------ */
/* Name → pattern classification                                       */
/* ------------------------------------------------------------------ */

/** Spanish + English keywords that anchor each movement pattern. Order
 *  matters for overlaps (e.g., "press militar" must match overhead-press
 *  before generic "press"). */
const PATTERN_RULES: Array<{ pattern: Pattern; keywords: string[] }> = [
  { pattern: 'overhead-press', keywords: ['press militar', 'press de hombros', 'shoulder press', 'overhead', 'hombro', 'arnold'] },
  { pattern: 'bench-push', keywords: ['press banca', 'press banco', 'bench', 'press de pecho', 'pecho', 'chest press', 'flexion', 'flexiones', 'push up', 'push-up', 'pushup', 'fondos', 'dips'] },
  { pattern: 'squat', keywords: ['sentadilla', 'squat', 'desplante', 'zancada', 'lunge', 'prensa', 'leg press', 'pistol', 'step up'] },
  { pattern: 'deadlift', keywords: ['peso muerto', 'deadlift', 'rumano', 'rdl', 'hip thrust', 'hinge', 'good morning', 'glute bridge', 'puente'] },
  { pattern: 'row', keywords: ['remo', 'row', 'pulldown', 'jalon', 'face pull', 'rear delt'] },
  { pattern: 'pullup', keywords: ['pull up', 'pull-up', 'pullup', 'dominada', 'chin up', 'muscle up'] },
  { pattern: 'curl', keywords: ['curl', 'biceps', 'bicep'] },
  { pattern: 'extension', keywords: ['extension', 'triceps', 'tricep', 'kickback', 'skull'] },
  { pattern: 'plank', keywords: ['plancha', 'plank', 'abdominal', 'ab ', 'crunch', 'sit up', 'sit-up', 'hollow', 'dead bug', 'mountain climber', 'core'] },
  { pattern: 'jump', keywords: ['salto', 'saltos', 'jump', 'box jump', 'burpee', 'jumping', 'plyo'] },
  { pattern: 'cardio', keywords: ['correr', 'run', 'running', 'trot', 'sprint', 'caminar', 'bicicleta', 'bike', 'escalera', 'ladder', 'agilidad'] },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPattern(name: string): Pattern {
  const n = normalize(name);
  for (const { pattern, keywords } of PATTERN_RULES) {
    for (const kw of keywords) {
      if (n.includes(kw)) return pattern;
    }
  }
  return 'generic';
}

/* ------------------------------------------------------------------ */
/* Hook (kept for API compatibility)                                   */
/* ------------------------------------------------------------------ */

export function useExerciseMedia(name: string): {
  pattern: Pattern;
  isLoading: boolean;
  isError: boolean;
} {
  return {
    pattern: classifyPattern(name),
    isLoading: false,
    isError: false,
  };
}

/* ------------------------------------------------------------------ */
/* Shared visual tokens                                                */
/* ------------------------------------------------------------------ */

// Brand palette — NEVER change these inline; keep the whole component
// coherent by sourcing every color from here.
const COLORS = {
  base: '#e2e8f0',       // slate-200 (static lines)
  figure: '#475569',     // slate-600 (body)
  accent: '#2563eb',     // blue-600 (moving part)
  accentSoft: '#dbeafe', // blue-100 (glow backdrop)
  ground: '#cbd5e1',     // slate-300 (floor line)
};

// Standard spring for framer-motion loops — tuned for a calm, premium
// pace. Each pattern can override `duration`.
const loop = (duration: number) => ({
  duration,
  repeat: Infinity,
  ease: [0.4, 0, 0.6, 1] as const,
});

/* ------------------------------------------------------------------ */
/* Individual motion scenes                                            */
/* ------------------------------------------------------------------ */
/* Each renders inside a 100×100 viewBox so the parent can scale to
 * any size. Keep them minimalist — a line, a shape, a barbell. */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-hidden
    >
      {/* Subtle backdrop glow */}
      <circle cx="50" cy="50" r="42" fill={COLORS.accentSoft} opacity="0.35" />
      {children}
    </svg>
  );
}

// Barbell shape centered at (cx, cy) with given half-length.
function Barbell({ cx, cy, half = 20 }: { cx: number; cy: number; half?: number }) {
  return (
    <g>
      <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke={COLORS.accent} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx={cx - half} cy={cy} r="3.5" fill={COLORS.accent} />
      <circle cx={cx + half} cy={cy} r="3.5" fill={COLORS.accent} />
    </g>
  );
}

// Ground line common to several scenes.
function Ground({ y = 80 }: { y?: number }) {
  return <line x1="15" y1={y} x2="85" y2={y} stroke={COLORS.ground} strokeWidth="1.2" strokeDasharray="2 3" strokeLinecap="round" />;
}

// Minimalist person silhouette as separate groups so we can animate
// specific limbs per pattern.
function PersonStanding({
  accentPart,
}: {
  // Part that should be rendered with the accent color instead of the
  // neutral figure gray. Everything else stays slate-600.
  accentPart?: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core';
}) {
  const a = (part: string) => (accentPart === part ? COLORS.accent : COLORS.figure);
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Head */}
      <circle cx="50" cy="24" r="5" fill={COLORS.figure} />
      {/* Torso */}
      <path d="M50 30 L50 54" stroke={a('chest')} strokeWidth="2.4" />
      {/* Shoulders */}
      <path d="M42 33 L58 33" stroke={a('shoulders')} strokeWidth="2.4" />
      {/* Arms */}
      <path d="M42 33 L38 48" stroke={a('arms')} strokeWidth="2.4" />
      <path d="M58 33 L62 48" stroke={a('arms')} strokeWidth="2.4" />
      {/* Legs */}
      <path d="M50 54 L44 76" stroke={a('legs')} strokeWidth="2.4" />
      <path d="M50 54 L56 76" stroke={a('legs')} strokeWidth="2.4" />
    </g>
  );
}

// Bench press / push-up — horizontal bar rising and falling over a
// reclined figure outline.
function BenchPushScene() {
  return (
    <Frame>
      <Ground y={72} />
      {/* Reclined figure (minimalist silhouette) */}
      <g stroke={COLORS.figure} strokeWidth="2.4" strokeLinecap="round" fill="none">
        {/* Head */}
        <circle cx="28" cy="62" r="4.5" fill={COLORS.figure} />
        {/* Body line */}
        <path d="M32 62 L68 62" />
        {/* Legs */}
        <path d="M68 62 L76 56" />
        {/* Arms reaching up */}
        <motion.g
          animate={{ y: [0, 10, 0] }}
          transition={loop(2.4)}
        >
          <path d="M50 62 L50 36" />
          {/* Barbell on top of hands */}
          <g transform="translate(0,0)">
            <line x1="32" y1="36" x2="68" y2="36" stroke={COLORS.accent} strokeWidth="2.6" />
            <circle cx="32" cy="36" r="4" fill={COLORS.accent} />
            <circle cx="68" cy="36" r="4" fill={COLORS.accent} />
          </g>
        </motion.g>
      </g>
    </Frame>
  );
}

// Squat — standing figure that compresses vertically with a bar on
// shoulders.
function SquatScene() {
  return (
    <Frame>
      <Ground />
      <motion.g
        style={{ transformOrigin: '50px 76px' }}
        animate={{ scaleY: [1, 0.72, 1] }}
        transition={loop(2.4)}
      >
        <PersonStanding />
        {/* Bar on shoulders */}
        <Barbell cx={50} cy={33} />
      </motion.g>
    </Frame>
  );
}

// Deadlift — barbell rising from the ground to hip height.
function DeadliftScene() {
  return (
    <Frame>
      <Ground />
      <motion.g
        style={{ transformOrigin: '50px 50px' }}
        animate={{ rotate: [20, 0, 20] }}
        transition={loop(2.6)}
      >
        <PersonStanding />
      </motion.g>
      <motion.g
        animate={{ y: [22, 0, 22] }}
        transition={loop(2.6)}
      >
        <Barbell cx={50} cy={55} />
      </motion.g>
    </Frame>
  );
}

// Row — standing figure with bar being pulled toward chest.
function RowScene() {
  return (
    <Frame>
      <Ground />
      <PersonStanding accentPart="back" />
      <motion.g
        animate={{ x: [0, -10, 0] }}
        transition={loop(2.2)}
      >
        <Barbell cx={70} cy={45} half={16} />
      </motion.g>
    </Frame>
  );
}

// Pull-up — figure rising along a vertical bar.
function PullupScene() {
  return (
    <Frame>
      {/* Horizontal bar up top */}
      <line x1="22" y1="16" x2="78" y2="16" stroke={COLORS.accent} strokeWidth="2.6" strokeLinecap="round" />
      <motion.g
        animate={{ y: [8, -4, 8] }}
        transition={loop(2.4)}
      >
        <PersonStanding accentPart="back" />
      </motion.g>
    </Frame>
  );
}

// Overhead press — bar going from shoulders to overhead.
function OverheadPressScene() {
  return (
    <Frame>
      <Ground />
      <PersonStanding accentPart="shoulders" />
      <motion.g
        animate={{ y: [0, -12, 0] }}
        transition={loop(2.2)}
      >
        <Barbell cx={50} cy={28} />
      </motion.g>
    </Frame>
  );
}

// Curl — a forearm arc rotating to show elbow flexion.
function CurlScene() {
  return (
    <Frame>
      <Ground />
      <PersonStanding accentPart="arms" />
      {/* Right forearm animated around elbow */}
      <motion.g
        style={{ transformOrigin: '62px 48px' }}
        animate={{ rotate: [0, -80, 0] }}
        transition={loop(2.2)}
      >
        <line x1="62" y1="48" x2="68" y2="66" stroke={COLORS.accent} strokeWidth="2.6" strokeLinecap="round" />
        {/* Dumbbell at the hand */}
        <rect x="65" y="63" width="6" height="6" rx="1.2" fill={COLORS.accent} />
      </motion.g>
    </Frame>
  );
}

// Triceps extension — mirror of curl, extending down behind head.
function ExtensionScene() {
  return (
    <Frame>
      <Ground />
      <PersonStanding accentPart="arms" />
      <motion.g
        style={{ transformOrigin: '50px 34px' }}
        animate={{ rotate: [0, 70, 0] }}
        transition={loop(2.2)}
      >
        <line x1="50" y1="34" x2="50" y2="18" stroke={COLORS.accent} strokeWidth="2.6" strokeLinecap="round" />
        <rect x="47" y="14" width="6" height="6" rx="1.2" fill={COLORS.accent} />
      </motion.g>
    </Frame>
  );
}

// Plank / core — horizontal figure holding steady with gentle pulse.
function PlankScene() {
  return (
    <Frame>
      <Ground y={72} />
      <g stroke={COLORS.figure} strokeWidth="2.4" strokeLinecap="round" fill="none">
        {/* Head */}
        <circle cx="22" cy="54" r="4" fill={COLORS.figure} />
        {/* Body — accent for abs */}
        <path d="M26 54 L74 60" stroke={COLORS.accent} />
        {/* Arms */}
        <path d="M26 54 L28 70" />
        {/* Legs */}
        <path d="M74 60 L82 70" />
      </g>
      {/* Pulse on abs */}
      <motion.circle
        cx="50"
        cy="58"
        r="3"
        fill={COLORS.accent}
        animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.9, 1.2, 0.9] }}
        transition={loop(1.8)}
      />
    </Frame>
  );
}

// Jump — figure bouncing up and down.
function JumpScene() {
  return (
    <Frame>
      <Ground />
      <motion.g
        animate={{ y: [0, -18, 0] }}
        transition={{ ...loop(1.6), ease: [0.45, 0, 0.55, 1] as const }}
      >
        <PersonStanding accentPart="legs" />
      </motion.g>
    </Frame>
  );
}

// Cardio — running figure (alternating legs).
function CardioScene() {
  return (
    <Frame>
      <Ground />
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Head */}
        <circle cx="50" cy="24" r="5" fill={COLORS.figure} />
        {/* Torso */}
        <path d="M50 30 L50 54" stroke={COLORS.figure} strokeWidth="2.4" />
        {/* Arms swinging */}
        <motion.g
          style={{ transformOrigin: '50px 33px' }}
          animate={{ rotate: [-20, 20, -20] }}
          transition={loop(0.8)}
        >
          <path d="M50 33 L42 48" stroke={COLORS.figure} strokeWidth="2.4" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: '50px 33px' }}
          animate={{ rotate: [20, -20, 20] }}
          transition={loop(0.8)}
        >
          <path d="M50 33 L58 48" stroke={COLORS.figure} strokeWidth="2.4" />
        </motion.g>
        {/* Legs alternating */}
        <motion.g
          style={{ transformOrigin: '50px 54px' }}
          animate={{ rotate: [15, -15, 15] }}
          transition={loop(0.8)}
        >
          <path d="M50 54 L44 76" stroke={COLORS.accent} strokeWidth="2.4" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: '50px 54px' }}
          animate={{ rotate: [-15, 15, -15] }}
          transition={loop(0.8)}
        >
          <path d="M50 54 L56 76" stroke={COLORS.accent} strokeWidth="2.4" />
        </motion.g>
      </g>
    </Frame>
  );
}

// Generic — pulsing dumbbell for anything unclassified.
function GenericScene() {
  return (
    <Frame>
      <motion.g
        style={{ transformOrigin: '50px 50px' }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
        transition={loop(2.4)}
      >
        <rect x="22" y="44" width="10" height="12" rx="2" fill={COLORS.accent} />
        <rect x="68" y="44" width="10" height="12" rx="2" fill={COLORS.accent} />
        <rect x="32" y="48" width="36" height="4" rx="1.5" fill={COLORS.accent} />
      </motion.g>
    </Frame>
  );
}

const SCENES: Record<Pattern, () => React.ReactElement> = {
  'bench-push': BenchPushScene,
  'squat': SquatScene,
  'deadlift': DeadliftScene,
  'row': RowScene,
  'pullup': PullupScene,
  'overhead-press': OverheadPressScene,
  'curl': CurlScene,
  'extension': ExtensionScene,
  'plank': PlankScene,
  'jump': JumpScene,
  'cardio': CardioScene,
  'generic': GenericScene,
};

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function ExerciseMedia({
  name,
  size = 'sm',
  className = '',
}: {
  name: string;
  size?: Size;
  className?: string;
}) {
  const pattern = classifyPattern(name);
  const Scene = SCENES[pattern];
  const sz = SIZE_MAP[size];

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl ring-1 ring-slate-200',
        'bg-gradient-to-br from-slate-50 to-blue-50',
        sz.box,
        className,
      ].join(' ')}
      aria-label={`Animación del ejercicio: ${name}`}
    >
      <Scene />
    </div>
  );
}

export default ExerciseMedia;
