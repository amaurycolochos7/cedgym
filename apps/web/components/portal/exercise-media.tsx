'use client';

/* -------------------------------------------------------------------------
 * ExerciseMedia — YouTube thumbnail + inline embed, brand-styled.
 *
 * Three sources of video, in priority order:
 *   1. `videoUrl` prop — set by the API at routine-generation time
 *      (apps/api/src/lib/youtube.js resolves every AI-generated
 *      exercise against YouTube search and stores the watch URL on
 *      the RoutineExercise row). Zero network from the client for
 *      new routines.
 *   2. `GET /exercises/video?q={name}` — the same server-side search
 *      called on-demand for older routines where video_url is null.
 *      Result cached in-memory server-side.
 *   3. Curated hardcoded fallback for a handful of common lifts —
 *      useful if the backend is down or the exercise is too obscure
 *      for YouTube to surface a demo.
 *
 * If all three miss, we render a branded placeholder (Dumbbell +
 * first word) so nothing looks broken — no external links, no
 * "search on YouTube" bail-out that drops the user out of the app.
 * -------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Maximize2, Pause, Play } from 'lucide-react';
import { api } from '@/lib/api';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, { box: string }> = {
  sm: { box: 'w-20 h-20' },
  md: { box: 'w-48 h-48' },
  lg: { box: 'w-full aspect-video' },
};

/* ------------------------------------------------------------------ */
/* Hardcoded fallback — small curated set, all ids verified HTTP 200. */
/* ------------------------------------------------------------------ */

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

function classifyFallback(name: string): string | null {
  const n = normalize(name);
  for (const { key, keywords } of RULES) {
    for (const kw of keywords) {
      if (n.includes(kw)) return EXERCISE_VIDEOS[key];
    }
  }
  return null;
}

function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function embedUrl(videoId: string): string {
  // controls=0 → YouTube's own bar is hidden. We render our own
  //   play/pause/progress using the IFrame API so clicks on the
  //   video title/channel never hijack the user out to youtube.com.
  // enablejsapi=1 → enables the postMessage command channel.
  // disablekb=1 → kill keyboard shortcuts inside the iframe so they
  //   don't conflict with our custom ones.
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    rel: '0',
    iv_load_policy: '3',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
    disablekb: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolves an exercise name + optional pre-baked URL into a YouTube
 * video id. Never throws; returns { videoId: null } when we simply
 * couldn't find anything.
 */
export function useExerciseMedia(
  name: string,
  videoUrl?: string | null,
): { videoId: string | null; isLoading: boolean } {
  // 1. Caller passed a URL — parse it and we're done.
  const fromProp = useMemo(() => extractVideoId(videoUrl), [videoUrl]);

  // 2. Fallback keyword match — synchronous, zero network.
  const fromMap = useMemo(() => (fromProp ? null : classifyFallback(name)), [fromProp, name]);

  // 3. Ask the backend. Only fires when the prior two missed so
  //    routines already populated with a video_url don't hit the
  //    network at all.
  const shouldQueryBackend = !fromProp && !fromMap && !!name;
  const q = useQuery<{ videoId: string; url: string; title: string | null } | null>({
    queryKey: ['exercise-video', normalize(name)],
    queryFn: async () => {
      const res = await api.get('/exercises/video', {
        params: { q: name },
        validateStatus: (s) => s === 200 || s === 204,
      });
      if (res.status === 204) return null;
      return res.data;
    },
    enabled: shouldQueryBackend,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  const fromBackend = q.data?.videoId ?? null;

  return {
    videoId: fromProp ?? fromMap ?? fromBackend ?? null,
    isLoading: shouldQueryBackend && q.isLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Inline player — wraps the YouTube iframe with custom controls
 * driven by the IFrame Player API over postMessage. controls=0 in
 * the embed URL hides YouTube's own UI so the user can't miss-tap
 * their way to youtube.com via the title/channel banner.
 * ------------------------------------------------------------------ */

// YouTube postMessage events that carry playback info back to us.
type YTMsg =
  | { event: 'infoDelivery'; info: { playerState?: number; currentTime?: number; duration?: number } }
  | { event: 'onStateChange'; info: number };

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function InlinePlayer({ videoId, name, className }: { videoId: string; name: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState(true); // autoplay=1 means it starts playing
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  // Send a command to the YouTube iframe.
  const send = useCallback(
    (func: string, args: (string | number)[] = []) => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    },
    [],
  );

  // Register as a listener so the iframe starts posting state
  // updates back to us. Has to be sent AFTER the iframe loads.
  const registerListener = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: videoId, channel: 'widget' }),
      '*',
    );
  }, [videoId]);

  // Listen for state updates from YouTube.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        typeof e.origin === 'string' &&
        !e.origin.includes('youtube-nocookie.com') &&
        !e.origin.includes('youtube.com')
      ) {
        return;
      }
      let parsed: YTMsg | null = null;
      try {
        parsed = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!parsed) return;
      if (parsed.event === 'infoDelivery' && parsed.info) {
        if (typeof parsed.info.playerState === 'number') {
          setIsPlaying(parsed.info.playerState === 1);
        }
        if (typeof parsed.info.currentTime === 'number') {
          setCurrentTime(parsed.info.currentTime);
        }
        if (typeof parsed.info.duration === 'number' && parsed.info.duration > 0) {
          setDuration(parsed.info.duration);
        }
      } else if (parsed.event === 'onStateChange') {
        setIsPlaying(parsed.info === 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      send('pauseVideo');
    } else {
      send('playVideo');
    }
  }, [isPlaying, send]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const target = Math.max(0, Math.min(duration, pct * duration));
      send('seekTo', [target, 1]);
      setCurrentTime(target);
    },
    [duration, send],
  );

  const handleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className={[
        'relative overflow-hidden rounded-xl ring-1 ring-slate-200 bg-black group',
        SIZE_MAP.lg.box,
        className ?? '',
      ].join(' ')}
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
    >
      <iframe
        ref={iframeRef}
        src={embedUrl(videoId)}
        title={`Demostración: ${name}`}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        loading="lazy"
        onLoad={registerListener}
      />

      {/* Click-capturing layer above the iframe. Absorbs every tap
          so the native YT pause overlay (title/channel links) can
          never hijack the user out to youtube.com. Our own controls
          sit on top of this layer with higher z-index. */}
      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 cursor-pointer z-10"
        aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
      />

      {/* Center play/pause button — always clickable, visible when
          paused or on hover. */}
      <div
        className={[
          'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 z-20',
          !isPlaying || showOverlay ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/95 backdrop-blur-sm ring-1 ring-white/60 shadow-xl">
          {isPlaying ? (
            <Pause className="w-6 h-6 text-blue-600 fill-blue-600" />
          ) : (
            <Play className="w-6 h-6 text-blue-600 fill-blue-600 translate-x-[2px]" />
          )}
        </div>
      </div>

      {/* Bottom control bar — progress + time + fullscreen. Visible
          when paused or on hover, fades out while playing. */}
      <div
        className={[
          'absolute left-0 right-0 bottom-0 z-20 transition-opacity duration-200',
          'bg-gradient-to-t from-black/75 via-black/40 to-transparent',
          !isPlaying || showOverlay ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        <div className="px-3 pb-3 pt-8 flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-white font-mono min-w-[36px]">
            {fmtTime(currentTime)}
          </span>
          <div
            className="relative flex-1 h-1.5 rounded-full bg-white/25 cursor-pointer overflow-hidden"
            onClick={handleSeek}
            role="slider"
            aria-label="Progreso del video"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={currentTime}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-400 to-sky-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-white/80 font-mono min-w-[36px]">
            {fmtTime(duration)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleFullscreen();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/90 hover:text-white hover:bg-white/10 transition"
            aria-label="Pantalla completa"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visual parts                                                        */
/* ------------------------------------------------------------------ */

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

function LoadingTile({ size }: { size: Size }) {
  const sz = SIZE_MAP[size];
  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl ring-1 ring-slate-200',
        'bg-gradient-to-br from-slate-100 to-slate-50 animate-pulse',
        sz.box,
      ].join(' ')}
      aria-label="Cargando video"
    />
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(videoId)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/15 to-transparent" />
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

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function ExerciseMedia({
  name,
  size = 'sm',
  videoUrl,
  className = '',
}: {
  name: string;
  size?: Size;
  /** Watch URL the backend stored on the exercise row, if any. */
  videoUrl?: string | null;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const { videoId, isLoading } = useExerciseMedia(name, videoUrl);

  if (isLoading) {
    return (
      <div className={className}>
        <LoadingTile size={size} />
      </div>
    );
  }

  if (!videoId) {
    return (
      <div className={className}>
        <FallbackTile name={name} size={size} />
      </div>
    );
  }

  // Only the large size swaps to the inline player on click. Small
  // / medium thumbs are visual-only (the card's expand action reveals
  // the lg player for playback).
  if (size === 'lg' && playing) {
    return <InlinePlayer videoId={videoId} name={name} className={className} />;
  }

  return (
    <div className={className}>
      <Thumbnail
        videoId={videoId}
        size={size}
        name={name}
        onPlay={size === 'lg' ? () => setPlaying(true) : undefined}
      />
    </div>
  );
}

export default ExerciseMedia;
