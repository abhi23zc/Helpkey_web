import "server-only";

import { createHash } from "crypto";
import { safeJobId } from "@/lib/background/jobs";
import { writePublication } from "@/lib/background/publication";
import { adminDb } from "@/lib/firebase/admin";
import { publicMediaUrl } from "@/lib/r2";

export type ImageVariantName = "thumb" | "card" | "large";
export type ImageVariant = { objectKey: string; width: number; height: number; byteSize: number; mimeType: "image/webp" };
export type PublicImageDto = { id: string; imageUrl: string; imageSrcSet: string; width: number; height: number; altText: string };
export type MediaPublicationInput = { operation: "publish" | "unpublish"; assetType: "property_image" | "review_photo"; assetId: string; sourceCollection: "mediaAssets" | "reviewPhotos"; sourceObjectKey: string; sourceChecksum: string };

const variantNames: ImageVariantName[] = ["thumb", "card", "large"];

export function publicationJobId(operation: MediaPublicationInput["operation"], assetId: string, checksum: string) {
  return createHash("sha256").update(`${operation}:${assetId}:${checksum}`).digest("hex");
}
export function publicationBullJobId(operation: MediaPublicationInput["operation"], assetId: string, checksum: string) { return safeJobId(operation, assetId, checksum); }

/** The approval transaction writes only Firestore state; dispatcher owns Redis. */
export function enqueuePublicationInTransaction(tx: FirebaseFirestore.Transaction, input: MediaPublicationInput) {
  return writePublication(adminDb, tx, input);
}

function checksum(value: unknown) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }

/** Public-only DTO construction; all object processing lives in workers/. */
export function publishedImageDto(id: string, data: FirebaseFirestore.DocumentData, altText = ""): PublicImageDto | null {
  if ((data.moderationStatus ?? data.status) !== "approved" || data.publication?.status !== "published") return null;
  const sourceChecksum = checksum(data.publication?.sourceChecksum);
  const folder = data.kind === "property_image" ? "properties" : "reviews";
  const variants = variantNames.flatMap((name) => {
    const item = data.publication?.variants?.[name] as ImageVariant | undefined;
    if (!sourceChecksum || !item || item.mimeType !== "image/webp" || !item.objectKey?.startsWith(`${folder}/${id}/${sourceChecksum}/`)) return [];
    try { return [{ name, item, url: publicMediaUrl(item.objectKey) }]; } catch { return []; }
  });
  const primary = variants.find(({ name }) => name === "card") ?? variants.at(-1);
  return primary ? { id, imageUrl: primary.url, imageSrcSet: variants.map(({ item, url }) => `${url} ${item.width}w`).join(", "), width: primary.item.width, height: primary.item.height, altText } : null;
}
