// ─────────────────────────────────────────────────────────────────
// MinIO / S3 storage wrapper.
//
// Used by the PDF generator (receipts, routine watermarks, carnets)
// to upload artifacts and return a publicly-addressable URL.
//
// If MINIO_ENDPOINT is NOT set, `putObject` returns a data-URL (base64)
// so dev environments keep working without MinIO running. In prod
// MINIO_ENDPOINT is mandatory and the returned URL is served by the
// bucket's public policy (or via a short-lived signed URL).
//
// Config (env):
//   MINIO_ENDPOINT        e.g. http://minio:9000
//   MINIO_ROOT_USER       access key
//   MINIO_ROOT_PASSWORD   secret key
//   MINIO_BUCKET          bucket name (default: cedgym)
//   MINIO_PUBLIC_URL      optional — base URL to use in returned links
//                         (defaults to MINIO_ENDPOINT)
//   MINIO_REGION          default 'us-east-1' (MinIO ignores it but SDK
//                         requires a value)
// ─────────────────────────────────────────────────────────────────

let _s3Client = null;
let _sdk = null;

function hasMinio() {
    return !!process.env.MINIO_ENDPOINT;
}

async function getSdk() {
    if (_sdk) return _sdk;
    try {
        _sdk = await import('@aws-sdk/client-s3');
        return _sdk;
    } catch (e) {
        // SDK not installed — caller will fall back to base64.
        return null;
    }
}

async function getClient() {
    if (!hasMinio()) return null;
    if (_s3Client) return _s3Client;
    const sdk = await getSdk();
    if (!sdk) return null;
    const { S3Client } = sdk;
    _s3Client = new S3Client({
        endpoint: process.env.MINIO_ENDPOINT,
        region: process.env.MINIO_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin',
            secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
        },
        forcePathStyle: true, // required by MinIO
    });
    return _s3Client;
}

function getBucket() {
    return process.env.MINIO_BUCKET || 'cedgym';
}

function getPublicBase() {
    return (process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT || '').replace(/\/$/, '');
}

// ────────────────────────────────────────────────────────────────
// putObject — uploads a Buffer or Uint8Array and returns
//   { url, key, storage }
//
// storage is 'minio' when uploaded, 'inline' when returned as a data-URL
// (dev fallback). Callers should never hardcode the URL shape.
// ────────────────────────────────────────────────────────────────
export async function putObject({ key, body, contentType = 'application/octet-stream' }) {
    const client = await getClient();
    if (!client) {
        // Dev fallback: inline base64.
        const b64 = Buffer.from(body).toString('base64');
        return {
            url: `data:${contentType};base64,${b64}`,
            key,
            storage: 'inline',
        };
    }
    const sdk = await getSdk();
    const { PutObjectCommand } = sdk;
    await client.send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
    }));
    return {
        url: `${getPublicBase()}/${getBucket()}/${encodeURI(key)}`,
        key,
        storage: 'minio',
    };
}

// Short-lived signed URL for private assets (routine PDFs with watermark).
// TTL in seconds. Falls back to `url` from putObject if MinIO is not set.
export async function signedUrl(key, ttlSec = 300) {
    const client = await getClient();
    if (!client) return null;
    const sdk = await getSdk();
    const { GetObjectCommand } = sdk;
    let getSignedUrl;
    try {
        ({ getSignedUrl } = await import('@aws-sdk/s3-request-presigner'));
    } catch {
        // presigner not installed — can't sign. Return null so caller
        // uses the public URL (which is fine for MinIO with public bucket).
        return null;
    }
    const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: key });
    return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}

export default { putObject, signedUrl, hasMinio };
