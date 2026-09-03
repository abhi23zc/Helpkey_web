import "server-only";
import { createHash, createHmac } from "crypto";

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
const stamp = (date: Date) => date.toISOString().replace(/[:-]|\.\d{3}/g, "");

function config() {
  const accountId = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_BUCKET_NAME, accessKeyId = process.env.R2_ACCESS_KEY_ID, secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).replace(/\/$/, "");
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) throw new Error("R2_NOT_CONFIGURED");
  return { bucket, accessKeyId, secretAccessKey, endpoint };
}
function signingKey(secret: string, date: string) { return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), "auto"), "s3"), "aws4_request"); }
function objectPath(bucket: string, key: string) { return `/${bucket}/${key.split("/").map(encode).join("/")}`; }

export function createR2UploadUrl(key: string, contentType: string, checksum: string, expiresSeconds = 900) {
  const { bucket, accessKeyId, secretAccessKey, endpoint } = config(); const url = new URL(endpoint); const now = new Date(), date = stamp(now), day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const headers = { "content-type": contentType, host: url.host, "x-amz-meta-sha256": checksum };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const query: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKeyId}/${scope}`, "X-Amz-Date": date, "X-Amz-Expires": String(expiresSeconds), "X-Amz-SignedHeaders": signedHeaders };
  const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
  const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}\n`).join("");
  const canonicalRequest = `PUT\n${objectPath(bucket, key)}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const signature = createHmac("sha256", signingKey(secretAccessKey, day)).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonicalRequest)}`).digest("hex");
  return { uploadUrl: `${endpoint}${objectPath(bucket, key)}?${canonicalQuery}&X-Amz-Signature=${signature}`, headers: { "Content-Type": contentType, "x-amz-meta-sha256": checksum }, expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString() };
}

/** Creates a short-lived read URL without making an R2 object public. */
export function createR2ReadUrl(key: string, expiresSeconds = 300) {
  const { bucket, accessKeyId, secretAccessKey, endpoint } = config();
  const url = new URL(endpoint); const now = new Date(), date = stamp(now), day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const headers = { host: url.host };
  const signedHeaders = "host";
  const query: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKeyId}/${scope}`, "X-Amz-Date": date, "X-Amz-Expires": String(expiresSeconds), "X-Amz-SignedHeaders": signedHeaders };
  const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
  const canonicalRequest = `GET\n${objectPath(bucket, key)}\n${canonicalQuery}\nhost:${headers.host}\n\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const signature = createHmac("sha256", signingKey(secretAccessKey, day)).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonicalRequest)}`).digest("hex");
  return { url: `${endpoint}${objectPath(bucket, key)}?${canonicalQuery}&X-Amz-Signature=${signature}`, expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString() };
}

export async function verifyR2Object(key: string, expectedSize: number, expectedChecksum: string) {
  const { bucket, accessKeyId, secretAccessKey, endpoint } = config(); const url = new URL(`${endpoint}${objectPath(bucket, key)}`); const now = new Date(), date = stamp(now), day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`, payload = "UNSIGNED-PAYLOAD";
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payload, "x-amz-date": date }; const signedHeaders = Object.keys(headers).sort().join(";"); const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}\n`).join("");
  const canonical = `HEAD\n${objectPath(bucket, key)}\n\n${canonicalHeaders}\n${signedHeaders}\n${payload}`; const signature = createHmac("sha256", signingKey(secretAccessKey, day)).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).digest("hex");
  const response = await fetch(url, { method: "HEAD", headers: { "x-amz-content-sha256": payload, "x-amz-date": date, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` } });
  if (!response.ok || Number(response.headers.get("content-length")) !== expectedSize || response.headers.get("x-amz-meta-sha256") !== expectedChecksum) throw new Error("R2_OBJECT_VERIFICATION_FAILED");
}
