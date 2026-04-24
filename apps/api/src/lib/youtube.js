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

// Normalized name → { videoId, title, url } | null.
//   null entries mean "we searched and found nothing" — we cache the
//   miss too so we don't re-query YouTube for garbage names.
const CACHE = new Map();

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

async function doSearch(name) {
    try {
        const results = await YouTube.search(buildQuery(name), {
            limit: 1,
            type: 'video',
            safeSearch: true,
        });
        const v = results && results[0];
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
// { videoId, title, url } or null. Cached both on hit and miss.
export async function searchExerciseVideo(name) {
    const key = normalize(name);
    if (!key) return null;
    if (CACHE.has(key)) return CACHE.get(key);
    if (INFLIGHT.has(key)) return INFLIGHT.get(key);

    const p = doSearch(key).then((result) => {
        CACHE.set(key, result);
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
    for (const v of CACHE.values()) {
        if (v) hits++;
        else misses++;
    }
    return {
        total_entries: CACHE.size,
        with_video: hits,
        without_video: misses,
        inflight: INFLIGHT.size,
    };
}
