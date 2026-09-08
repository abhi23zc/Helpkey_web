import "server-only";

import { publishedImageDto, type PublicImageDto } from "@/lib/media-publication";
import { createPrivateReadUrl } from "@/lib/r2";

export async function resolvePublicImage(id: string, data: FirebaseFirestore.DocumentData, altText = ""): Promise<PublicImageDto | null> {
  const published = publishedImageDto(id, data, altText);
  if (published) return published;
  if (process.env.PUBLIC_MEDIA_DUAL_READ !== "true" || (data.moderationStatus ?? data.status) !== "approved" || typeof data.r2ObjectKey !== "string") return null;
  try {
    const signed = await createPrivateReadUrl(data.r2ObjectKey);
    return { id, imageUrl: signed.url, imageSrcSet: "", width: 1, height: 1, altText };
  } catch { return null; }
}

export async function privatePreviewDto(id: string, data: FirebaseFirestore.DocumentData) {
  if (typeof data.r2ObjectKey !== "string") return null;
  const signed = await createPrivateReadUrl(data.r2ObjectKey);
  return { id, url: signed.url, expiresAt: signed.expiresAt, mimeType: typeof data.mimeType === "string" ? data.mimeType : "application/octet-stream", fileName: typeof data.fileName === "string" ? data.fileName : "download" };
}
