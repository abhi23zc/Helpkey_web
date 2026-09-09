import "server-only";

import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, type HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRIVATE_READ_SECONDS = 5 * 60;
const PRIVATE_UPLOAD_SECONDS = 15 * 60;
type BucketConfig = { bucket: string; client: S3Client };

function endpoint() {
  const value = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (!value) throw new Error("R2_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

function client(accessKeyId: string | undefined, secretAccessKey: string | undefined) {
  if (!accessKeyId || !secretAccessKey) throw new Error("R2_NOT_CONFIGURED");
  // R2 accepts direct virtual-host requests, but this SDK version generates
  // invalid presigned PUT signatures for that form. Path-style URLs sign and
  // upload correctly, including from browser clients.
  return new S3Client({ region: "auto", endpoint: endpoint(), forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
}

function privateConfig(): BucketConfig {
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME || process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket) throw new Error("R2_NOT_CONFIGURED");
  return { bucket, client: client(accessKeyId, secretAccessKey) };
}

function validObjectKey(key: string) {
  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("?") || key.includes("#") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("MEDIA_INVALID_OBJECT_KEY");
  return key;
}

export async function createPrivateUploadUrl(key: string, contentType: string, checksum: string, expiresSeconds = PRIVATE_UPLOAD_SECONDS) {
  const { bucket, client } = privateConfig();
  const command = new PutObjectCommand({ Bucket: bucket, Key: validObjectKey(key), ContentType: contentType, Metadata: { sha256: checksum } });
  const seconds = Math.min(expiresSeconds, PRIVATE_UPLOAD_SECONDS);
  // R2 rejects metadata hoisted into a presigned URL query string. Preserve
  // this integrity value as a signed browser request header instead.
  return { uploadUrl: await getSignedUrl(client, command, { expiresIn: seconds, unhoistableHeaders: new Set(["x-amz-meta-sha256"]) }), headers: { "Content-Type": contentType, "x-amz-meta-sha256": checksum }, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export async function createPrivateReadUrl(key: string, expiresSeconds = PRIVATE_READ_SECONDS) {
  const { bucket, client } = privateConfig();
  const seconds = Math.min(expiresSeconds, PRIVATE_READ_SECONDS);
  return { url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: validObjectKey(key) }), { expiresIn: seconds }), expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export async function headPrivateObject(key: string): Promise<HeadObjectCommandOutput> {
  const { bucket, client } = privateConfig();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: validObjectKey(key) }));
}

export async function copyPrivateObject(sourceKey: string, destinationKey: string) {
  const { bucket, client } = privateConfig();
  await client.send(new CopyObjectCommand({ Bucket: bucket, Key: validObjectKey(destinationKey), CopySource: `${bucket}/${validObjectKey(sourceKey).split("/").map(encodeURIComponent).join("/")}`, MetadataDirective: "COPY" }));
}

export async function deletePrivateObject(key: string) {
  const { bucket, client } = privateConfig();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: validObjectKey(key) }));
}

export function publicMediaUrl(key: string) {
  const base = process.env.PUBLIC_MEDIA_BASE_URL;
  const valid = validObjectKey(key);
  if (!/^(properties|reviews)\/[^/]+\/[a-f0-9]{64}\/(thumb|card|large)\.webp$/i.test(valid)) throw new Error("MEDIA_INVALID_OBJECT_KEY");
  if (!base) throw new Error("PUBLIC_MEDIA_NOT_CONFIGURED");
  const baseUrl = new URL(base);
  if (baseUrl.search || baseUrl.hash || !["https:", "http:"].includes(baseUrl.protocol)) throw new Error("PUBLIC_MEDIA_NOT_CONFIGURED");
  const url = new URL(valid.split("/").map(encodeURIComponent).join("/"), `${baseUrl.toString().replace(/\/$/, "")}/`);
  if (url.origin !== baseUrl.origin) throw new Error("MEDIA_INVALID_OBJECT_KEY");
  return url.toString();
}

// Compatibility aliases during the dual-read rollout.
export const createR2UploadUrl = createPrivateUploadUrl;
export const createR2ReadUrl = createPrivateReadUrl;
export const deleteR2Object = deletePrivateObject;
export async function verifyR2Object(key: string, expectedSize: number, expectedChecksum: string) {
  const head = await headPrivateObject(key);
  if (head.ContentLength !== expectedSize || head.Metadata?.sha256 !== expectedChecksum) throw new Error("R2_OBJECT_VERIFICATION_FAILED");
}
