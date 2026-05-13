// ─────────────────────────────────────────────────────────────────
// YouTube exercise-video lookup.
//
// Scrapes YouTube's public search (via `youtube-sr`) so we don't need
// a Google API key or quota. Results are memoized in-memory by
// normalized exercise name — once "press banca" is searched, every
// subsequent routine using it reads from RAM.
//
// On restart the cache is cold. For a gym-scale app, that's fine: a
// few slow searches while the cache warms, then everything flies.
// ─────────────────────────────────────────────────────────────────

import ytsr from 'youtube-sr';

// `youtube-sr` is published as a CJS module with `.YouTube` as a
// named export; importing it from ESM gives us the module object
// where the class lives under `.YouTube`.
const YouTube = ytsr.YouTube ?? ytsr.default?.YouTube ?? ytsr;

// Cache de búsquedas. Diseño: HITs (objetos) duran indefinido — el
// videoId de un ejercicio no cambia. MISSes (null) caducan a los 5
// minutos para reintentar — un miss puede ser un rate-limit temporal
// de YouTube, un hiccup de red, o una búsqueda que se hizo con el
// algoritmo viejo (antes de coreOf) y que con la query mejorada
// ahora sí va a encontrar resultados.
//
// Key → { value: { videoId, title, url } | null, expiresAt: number | Infinity }
const CACHE = new Map();
const MISS_TTL_MS = 5 * 60 * 1000;

function cacheGet(key) {
    const entry = CACHE.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
        CACHE.delete(key);
        return undefined;
    }
    return entry.value;
}

function cacheSet(key, value) {
    CACHE.set(key, {
        value,
        // Hit: cache indefinido (el video del coach no cambia).
        // Miss: TTL corto para reintentar pronto.
        expiresAt: value ? Infinity : Date.now() + MISS_TTL_MS,
    });
}

// Active in-flight promises per query key — lets N parallel callers
// share a single network round-trip instead of hammering YouTube.
const INFLIGHT = new Map();

function normalize(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Build the search query. Appending a Spanish hint nudges YouTube
// toward demonstration videos instead of vlogs.
function buildQuery(name) {
    return `${name} técnica ejercicio`.trim();
}

// Palabras "ruido" que aparecen en nombres largos del Coach pero que
// si las metemos al search hunden los resultados. Quitarlas hace que
// la query sea más "core" y YouTube devuelva demos reales.
const NOISE_WORDS = new Set([
    'de', 'con', 'la', 'el', 'los', 'las', 'al', 'del', 'a', 'en', 'y', 'o',
    'calentamiento', 'ligero', 'ligera', 'suave', 'suaves',
    'isometrico', 'isometrica', 'isométrico', 'isométrica',
    'pesadas', 'pesada', 'pesado',
    'livianas', 'liviana', 'liviano',
    'controlado', 'controlada',
    'peso', 'corporal', 'propio',
    'aparato', 'maquina', 'máquina',
    'mancuerna', 'mancuernas', 'barra',
    'pies', 'pie', 'elevados', 'elevada', 'inclinado', 'declinado',
    'frente', 'banco', 'piso', 'suelo',
    'una', 'mano', 'unilateral',
    'sentado', 'sentada', 'parado', 'parada',
    'banda', 'bandas', 'elastica', 'elástica',
    'minuto', 'segundos',
]);

// Reduce un nombre largo del Coach a su "núcleo": quita stop-words
// y palabras descriptivas, deja el ejercicio de verdad. Ej.:
//   "Lagartija con pies elevados" → "lagartija"
//   "Curl bíceps de calentamiento con peso ligero" → "curl biceps"
//   "Activación de hombro con banda" → "activacion hombro"
//   "Press de banco inclinado con mancuernas" → "press banco"
function coreOf(name) {
    const norm = String(name || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = norm.split(' ').filter((w) => w && !NOISE_WORDS.has(w));
    // Si el filtro nos dejó sin nada, devuelve el nombre original
    // — mejor algo que nada.
    if (tokens.length === 0) return norm;
    // Tomamos hasta 3 palabras claves — el ejercicio core.
    return tokens.slice(0, 3).join(' ');
}

// ─────────────────────────────────────────────────────────────────
// Curated keyword → YouTube video ID map.
//
// Spanish gym slang ("pájaros" = reverse fly) confuses YouTube
// scraping — a raw search returns bird videos. Press names that don't
// say "militar" ("Press hombro en máquina", "Press hombro de pie")
// also drift toward unrelated results because YouTube doesn't get the
// muscle group from a generic word like "press".
//
// These rules run BEFORE the scrape. If any keyword matches the
// normalized exercise name, we return that curated video ID
// directly. IDs mirror the verified set in
// apps/web/components/portal/exercise-media.tsx — keep both in sync.
//
// Order matters: more specific keywords first so generic ones don't
// steal a more-specific match.
// ─────────────────────────────────────────────────────────────────
const CURATED_RULES = [
    // Rear delt — "pájaros" alone returns bird videos
    { videoId: 'rep-qVOkqgk', keywords: ['pajaros', 'pajaro', 'face pull', 'face-pull'] },
    // Rotator cuff / activation
    { videoId: 'gBGPi-NmQCg', keywords: [
        'rotaciones de hombro', 'rotacion de hombro',
        'rotaciones externas', 'rotaciones internas',
        'activacion de hombro', 'activacion hombro',
        'movilidad de hombro', 'movilidad hombro',
        'rotaciones con banda', 'y-t-w', 'ytw',
    ] },
    // Overhead press family — "press hombro" sin "de" no cae solo
    { videoId: '6Fzep104f0s', keywords: [
        'press militar', 'press de hombros', 'press de hombro',
        'press hombro', 'shoulder press', 'arnold press', 'overhead',
    ] },
    // Lateral / front raise
    { videoId: '3VcKaXpzqRo', keywords: [
        'laterales poliquin', 'elevacion lateral', 'elevaciones laterales',
        'lateral raise', 'side raise', 'laterales',
        'frontal con disco', 'elevacion frontal',
        'circulos con mancuerna',
    ] },
    // Trapecio / shrug
    { videoId: 'cJRVVxmytaM', keywords: ['encogimientos', 'shrugs', 'shrug', 'trapecio'] },
];

function curatedVideoFor(normalizedName) {
    if (!normalizedName) return null;
    for (const rule of CURATED_RULES) {
        for (const kw of rule.keywords) {
            if (normalizedName.includes(kw)) return rule.videoId;
        }
    }
    return null;
}

async function doSearch(name) {
    // Curated short-circuit: if the exercise name matches a known
    // problematic pattern, return the hand-picked video and skip the
    // YouTube scrape entirely. Eliminates "pájaros → bird videos" and
    // similar misclassifications that don't survive a raw search.
    const curated = curatedVideoFor(name);
    if (curated) {
        return {
            videoId: curated,
            title: null,
            url: `https://www.youtube.com/watch?v=${curated}`,
        };
    }

    try {
        // Intento 1: nombre completo + "técnica ejercicio".
        // Funciona bien para nombres simples ("press banca",
        // "sentadilla").
        let results = await YouTube.search(buildQuery(name), {
            limit: 1,
            type: 'video',
            safeSearch: true,
        });
        let v = results && results[0];

        // Intento 2: si fallamos con el nombre largo (común en
        // ejercicios tipo "Lagartija de calentamiento con peso
        // ligero"), reintentamos con sólo las palabras clave.
        if (!v?.id) {
            const core = coreOf(name);
            if (core && core !== name) {
                results = await YouTube.search(buildQuery(core), {
                    limit: 1,
                    type: 'video',
                    safeSearch: true,
                });
                v = results && results[0];
            }
        }

        if (!v?.id) return null;
        return {
            videoId: v.id,
            title: v.title ?? null,
            url: `https://www.youtube.com/watch?v=${v.id}`,
        };
    } catch (e) {
        // Scraping can fail if YouTube changes HTML, rate-limits, or
        // the network hiccups. Cache a null so we degrade gracefully
        // instead of spinning forever.
        return null;
    }
}

// Resolve a single exercise name to a YouTube video. Returns
// { videoId, title, url } or null. Cached on hit (forever) and on
// miss (5 min TTL — see cacheSet).
export async function searchExerciseVideo(name) {
    const key = normalize(name);
    if (!key) return null;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    if (INFLIGHT.has(key)) return INFLIGHT.get(key);

    const p = doSearch(key).then((result) => {
        cacheSet(key, result);
        INFLIGHT.delete(key);
        return result;
    });
    INFLIGHT.set(key, p);
    return p;
}

// Batch variant used at routine-generation time — fires all
// searches in parallel and returns a { name → result } map.
export async function searchExerciseVideosBatch(names) {
    const unique = Array.from(new Set(names.map(normalize).filter(Boolean)));
    const results = await Promise.all(
        unique.map(async (n) => [n, await searchExerciseVideo(n)])
    );
    return new Map(results);
}

// Introspection helper for /health or /admin debugging.
export function getYoutubeCacheStats() {
    let hits = 0;
    let misses = 0;
    const now = Date.now();
    for (const entry of CACHE.values()) {
        if (entry.expiresAt < now) continue; // expired but not yet pruned
        if (entry.value) hits++;
        else misses++;
    }
    return {
        total_entries: CACHE.size,
        with_video: hits,
        without_video: misses,
        inflight: INFLIGHT.size,
    };
}
