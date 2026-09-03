import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { createR2UploadUrl } from "@/lib/r2";

const schema = z.object({ fileName: z.string().min(1).max(180), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(12 * 1024 * 1024), checksum: z.string().regex(/^[a-f0-9]{64}$/i), category: z.enum(["exterior", "reception", "room", "bathroom", "additional"]) }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/media/upload-url">) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 }); try { const { propertyId } = await params; await propertyOwner(user.uid, propertyId); const input = schema.parse(await request.json()); const uploadId = randomUUID(); const objectKey = `properties/${propertyId}/images/${uploadId}`; const signed = createR2UploadUrl(objectKey, input.mimeType, input.checksum); await adminDb.collection("pendingUploads").doc(uploadId).set({ propertyId, ownerId: user.uid, kind: "property_image", ...input, objectKey, expiresAt: Date.now() + 15 * 60_000, createdAt: FieldValue.serverTimestamp() }); return Response.json({ uploadId, objectKey, expiresAt: signed.expiresAt, private: true, uploadUrl: signed.uploadUrl, headers: signed.headers }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to authorize upload." }, { status: 422 }); } }
