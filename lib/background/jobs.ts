import { createHash } from "node:crypto";
import { z } from "zod";
export const components = ["identity", "pricing", "amenities", "cover", "rating"] as const;
export type ProjectionComponent = typeof components[number];
export const projectionSchema = z.object({
  kind: z.enum(["property_search", "review_summary", "daily_metrics", "dashboard_summary", "cache_invalidation"]),
  entityId: z.string().min(1).max(200).refine(v => !v.includes("/")),
  version: z.number().int().positive().default(1), eventId: z.string().min(1),
  components: z.array(z.enum(components)).optional(), reviewId: z.string().min(1).refine(v => !v.includes("/")).optional(),
});
export type ProjectionJob = z.infer<typeof projectionSchema>;
export const publicationSchema = z.object({
  operation: z.enum(["publish", "unpublish"]), assetType: z.enum(["property_image", "review_photo"]),
  assetId: z.string().min(1).refine(v => !v.includes("/")), sourceCollection: z.enum(["mediaAssets", "reviewPhotos"]),
  sourceObjectKey: z.string().min(1), sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  requestId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(), jobId: z.string().optional(),
}).refine(v => v.assetType === "property_image" ? v.sourceCollection === "mediaAssets" : v.sourceCollection === "reviewPhotos");
export type PublicationJob = z.infer<typeof publicationSchema>;
export const safeJobId = (...parts: string[]) => `job-${createHash("sha256").update(parts.join("\0")).digest("hex")}`;
export const projectionStateId = (entityId: string, kind: string) => safeJobId(entityId, kind);
