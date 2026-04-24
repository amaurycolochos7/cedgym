'use client';

/* -------------------------------------------------------------------------
 * ExerciseMedia — YouTube thumbnail + inline embed, brand-styled.
 *
 * Why this design:
 *   - The previous stick-figure SVGs felt cheap; real-person photos clashed
 *     with the glass/slate/blue aesthetic. A real YouTube thumbnail frames
 *     like an editorial card and the inline embed keeps the user inside
 *     the app (no "abrir en YouTube" jumps).
 *
 * How it works:
 *   - Each exercise name is matched (Spanish-first keyword rules) to a
 *     curated YouTube video ID. All IDs in EXERCISE_VIDEOS were verified
 *     via the ytimg thumbnail (HTTP 200 = video exists).
 *   - The small `sm` tile is used inline in the collapsed card → just a
 *     rounded thumbnail with a play glyph overlay.
 *   - The `lg` tile in the expanded card starts as a thumbnail; on click
 *     it swaps to an <iframe> that autoplays with YouTube's chrome
 *     minimized (modestbranding, rel=0, iv_load_policy=3).
 *   - If the exercise has no mapped video, the tile renders a branded
 *     placeholder (Dumbbell + first word of the name). No external link.
 *
 * Public API (unchanged):
 *   <ExerciseMedia name="Press banca" size="sm" />
 *   useExerciseMedia("Sentadilla") → { videoId?, thumbUrl?, isLoading, isError }
 * -------------------------------------------------------------------------*/

import { useState } from 'react';
import { Dumbbell, Play } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, { box: string; thumb: number; iconBig: string; iconSm: string }> = {
  sm: { box: 'w-20 h-20',    thumb: 2,  iconBig: 'w-6 h-6',  iconSm: 'w-5 h-5' },
  md: { box: 'w-48 h-48',    thumb: 3,  iconBig: 'w-10 h-10', iconSm: 'w-8 h-8' },
  lg: { box: 'w-full aspect-video', thumb: 3, iconBig: 'w-14 h-14', iconSm: 'w-12 h-12' },
};

/* ------------------------------------------------------------------ */
/* Curated YouTube demo videos.
 *
 * Each videoId has been verified via HTTP 200 on its hqdefault
 * thumbnail. Keeps the list short on purpose — would rather show a
 * clean "no video" tile than gamble on a clip that might be the wrong
 * exercise or taken down.
 * ------------------------------------------------------------------ */

type VideoKey =
  | 'bench-press'
  | 'squat'
  | 'deadlift'
  | 'overhead-press'
  | 'pullup'
  | 'dips'
  | 'lateral-raise'
  | 'biceps-curl'
  | 'triceps-extension'
  | 'mountain-climbers'
  | 'lunges'
  | 'goblet-squat';

const EXERCISE_VIDEOS: Record<VideoKey, string> = {
  'bench-press':       'rT7DgCr-3pg',
  'squat':             'SW_C1A-rejs',
  'deadlift':          'r4MzxtBKyNE',
  'overhead-press':    '6Fzep104f0s',
  'pullup':            'IZxyjW7MPJQ',
  'dips':              'rxD321l2svE',
  'lateral-raise':     '3VcKaXpzqRo',
  'biceps-curl':       'ykJmrZ5v0Oo',
  'triceps-extension': '6kALZikXxLc',
  'mountain-climbers': 'nmwgirgXLYM',
  'lunges':            'YaXPRqUwItQ',
  'goblet-squat':      'CFBZ4jN1CMI',
};

// Spanish-first keyword rules. Order matters — "press militar" must
// resolve to overhead-press before plain "press" falls through to
// bench-press.
const RULES: Array<{ key: VideoKey; keywords: string[] }> = [
  { key: 'overhead-press',    keywords: ['press militar', 'press de hombros', 'shoulder press', 'overhead', 'arnold press'] },
  { key: 'bench-press',       keywords: ['press banca', 'press banco', 'bench', 'press de pecho'] },
  { key: 'goblet-squat',      keywords: ['sentadilla goblet', 'goblet squat', 'goblet'] },
  { key: 'squat',             keywords: ['sentadilla', 'squat'] },
  { key: 'deadlift',          keywords: ['peso muerto', 'deadlift', 'rumano', 'rdl'] },
  { key: 'pullup',            keywords: ['pull up', 'pull-up', 'pullup', 'dominada', 'chin up'] },
  { key: 'dips',              keywords: ['fondos', 'dips', 'paralelas'] },
  { key: 'lateral-raise',     keywords: ['elevacion lateral', 'elevaciones laterales', 'lateral raise', 'side raise'] },
  { key: 'biceps-curl',       keywords: ['curl de biceps', 'curl biceps', 'bicep curl', 'biceps curl', 'curl'] },
  { key: 'triceps-extension', keywords: ['extension de triceps', 'extensiones triceps', 'triceps extension', 'tricep extension', 'kickback'] },
  { key: 'mountain-climbers', keywords: ['mountain climber', 'mountain climbers', 'escaladores'] },
  { key: 'lunges',            keywords: ['desplante', 'zancada', 'lunge'] },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(name: string): VideoKey | null {
  const n = normalize(name);
  for (const { key, keywords } of RULES) {
    for (const kw of keywords) {
      if (n.includes(kw)) return key;
    }
  }
  return null;
}

function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function embedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
    playsinline: '1',
    fs: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Hook + component                                                    */
/* ------------------------------------------------------------------ */

export function useExerciseMedia(name: string): {
  videoId: string | null;
  thumbUrl: string | null;
  isLoading: boolean;
  isError: boolean;
} {
  const key = classify(name);
  const videoId = key ? EXERCISE_VIDEOS[key] : null;
  return {
    videoId,
    thumbUrl: videoId ? thumbUrl(videoId) : null,
    isLoading: false,
    isError: false,
  };
}

function FallbackTile({ name, size }: { name: string; size: Size }) {
  const sz = SIZE_MAP[size];
  const firstWord = name.split(/\s+/)[0] ?? '';
  return (
    <div
      className={[
        'relative flex flex-col items-center justify-center gap-1.5',
        'overflow-hidden rounded-xl ring-1 ring-slate-200',
        'bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100',
        sz.box,
      ].join(' ')}
      aria-label={`Sin demostración disponible para ${name}`}
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-blue-100 text-blue-600 shadow-sm">
        <Dumbbell className="w-5 h-5" />
      </div>
      {size !== 'sm' && (
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 truncate max-w-[85%]">
          {firstWord}
        </span>
      )}
    </div>
  );
}

function Thumbnail({
  videoId,
  size,
  onPlay,
  name,
}: {
  videoId: string;
  size: Size;
  onPlay?: () => void;
  name: string;
}) {
  const sz = SIZE_MAP[size];
  const interactive = !!onPlay;
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={!interactive}
      className={[
        'group relative overflow-hidden rounded-xl ring-1 ring-slate-200 bg-slate-900',
        sz.box,
        interactive ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
      aria-label={interactive ? `Reproducir demostración: ${name}` : `Demostración: ${name}`}
    >
      {/* Thumbnail image — hqdefault is always 480x360 JPEG */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(videoId)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />

      {/* Subtle dark gradient so the play glyph stays readable */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/15 to-transparent" />

      {/* Play glyph */}
      <div
        className={[
          'absolute inset-0 flex items-center justify-center transition-transform duration-300',
          interactive ? 'group-hover:scale-110' : '',
        ].join(' ')}
      >
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 backdrop-blur-sm ring-1 ring-white/60 shadow-lg">
          <Play
            className={[
              size === 'sm' ? 'w-4 h-4' : 'w-5 h-5',
              'text-blue-600 fill-blue-600 translate-x-[1px]',
            ].join(' ')}
          />
        </div>
      </div>
    </button>
  );
}

export function ExerciseMedia({
  name,
  size = 'sm',
  className = '',
}: {
  name: string;
  size?: Size;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const media = useExerciseMedia(name);

  if (!media.videoId) {
    return (
      <div className={className}>
        <FallbackTile name={name} size={size} />
      </div>
    );
  }

  // Only the large size swaps to the iframe on click. Small / medium
  // thumbs are visual-only (the card's expand action reveals the lg
  // player for playback).
  if (size === 'lg' && playing) {
    return (
      <div
        className={[
          'relative overflow-hidden rounded-xl ring-1 ring-slate-200 bg-black',
          SIZE_MAP.lg.box,
          className,
        ].join(' ')}
      >
        <iframe
          src={embedUrl(media.videoId)}
          title={`Demostración: ${name}`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Thumbnail
        videoId={media.videoId}
        size={size}
        name={name}
        onPlay={size === 'lg' ? () => setPlaying(true) : undefined}
      />
    </div>
  );
}

export default ExerciseMedia;
