// ─── Media URL safety guard ─────────────────────────────────────
//
// Used by WhatsAppSession.sendMedia to refuse URLs that point at
// internal infrastructure (Redis, Postgres, AWS metadata service,
// link-local, loopback, RFC1918). The original implementation passed
// arbitrary URLs to MessageMedia.fromUrl which made the bot a
// trivial SSRF probe.
//
// This guard runs the host through dns.lookup() so a domain that
// resolves to a private address (DNS rebind, malicious A record) is
// also refused. Callers should still fetch the URL themselves with
// `redirect: 'error'` to close the residual TOCTOU window between the
// lookup here and the actual fetch.

import dns from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_HOSTS = (process.env.WHATSAPP_MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

// 16 MB — matches WhatsApp's per-media limit.
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0) return true;                              // 0.0.0.0/8
    if (a === 10) return true;                             // 10.0.0.0/8
    if (a === 127) return true;                            // loopback
    if (a === 169 && b === 254) return true;               // link-local / AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                             // multicast + reserved
    return false;
}

function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase().split('%')[0]; // strip zone id
    if (lower === '::1' || lower === '::') return true;
    // fe80::/10 — link-local. Covers fe80..febf prefixes.
    if (/^fe[89ab][0-9a-f]?:/.test(lower)) return true;
    // fc00::/7 — unique local addresses (fc** + fd**).
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('ff')) return true; // multicast
    // ::ffff:1.2.3.4 — IPv4-mapped; check the embedded v4.
    const m = lower.match(/^::ffff:([0-9a-f.:]+)$/);
    if (m) {
        const inner = m[1];
        if (inner.includes('.')) return isPrivateIPv4(inner);
        return true; // hex-encoded mapped form — refuse to be safe
    }
    return false;
}

function isPrivateIp(ip) {
    if (net.isIPv4(ip)) return isPrivateIPv4(ip);
    if (net.isIPv6(ip)) return isPrivateIPv6(ip);
    return true; // unknown family → conservatively refuse
}

export class MediaUrlError extends Error {
    constructor(code, message) {
        super(message || code);
        this.code = code;
        this.name = 'MediaUrlError';
    }
}

export async function assertSafeMediaUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new MediaUrlError('media_url_invalid');
    }
    if (parsed.protocol !== 'https:') {
        throw new MediaUrlError('media_url_must_be_https');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(hostname)) {
        throw new MediaUrlError('media_url_host_not_allowlisted');
    }
    // Refuse hostname that is itself a private IP literal.
    if (net.isIP(hostname) && isPrivateIp(hostname)) {
        throw new MediaUrlError('media_url_private_ip');
    }
    // DNS rebind defence: resolve and refuse if any returned address
    // is private. Caller must still pass redirect:'error' to fetch().
    let addrs;
    try {
        addrs = await dns.lookup(hostname, { all: true });
    } catch {
        throw new MediaUrlError('media_url_dns_failed');
    }
    for (const a of addrs) {
        if (isPrivateIp(a.address)) {
            throw new MediaUrlError('media_url_resolves_to_private_ip');
        }
    }
}
