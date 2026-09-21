import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { copyPrivateObject, deletePrivateObject, getPrivateObject, verifyR2Object } from "@/lib/r2";
const schema = z.object({ uploadId: z.string().uuid() }).strict();

function isExpectedDocument(bytes: Uint8Array, mimeType: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const pdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  return (mimeType === "image/jpeg" && jpeg) || (mimeType === "image/png" && png) || (mimeType === "application/pdf" && pdf);
}

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/kyc/finalize">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  let originalKey: string | null = null;
  try {
    const { propertyId } = await params;
    const propertyRef = await propertyOwner(user.uid, propertyId);
    const [property, input] = await Promise.all([propertyRef.get(), schema.parseAsync(await request.json())]);
    if (property.data()?.status !== "draft" || property.data()?.approvalStatus !== "not_submitted") throw new Error("Verification documents can only be changed while this listing is a draft.");
    const upload = await adminDb.collection("pendingUploads").doc(input.uploadId).get();
    const data = upload.data();
    if (!data || data.ownerId !== user.uid || data.propertyId !== propertyId || data.kind !== "kyc" || data.expiresAt < Date.now()) throw new Error("UPLOAD_EXPIRED");
    await verifyR2Object(data.objectKey, data.sizeBytes, data.checksum);
    if (!isExpectedDocument(await getPrivateObject(data.objectKey), data.mimeType)) throw new Error("INVALID_DOCUMENT_CONTENT");

    const doc = adminDb.collection("verificationDocuments").doc();
    originalKey = `documents/kyc/${propertyId}/${doc.id}`;
    await copyPrivateObject(data.objectKey, originalKey);
    await verifyR2Object(originalKey, data.sizeBytes, data.checksum);
    const replacedKeys: string[] = [];
    await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).where("documentType", "==", data.documentType));
      existing.docs.forEach((previous) => {
        const previousKey = previous.data().r2ObjectKey;
        if (typeof previousKey === "string") replacedKeys.push(previousKey);
        transaction.delete(previous.ref);
      });
      transaction.set(doc, { propertyId, ownerId: user.uid, documentType: data.documentType, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, checksum: data.checksum, r2ObjectKey: originalKey, isPrivate: true, status: "pending", createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    });
    await upload.ref.delete();
    await Promise.all([deletePrivateObject(data.objectKey).catch(() => {}), ...replacedKeys.map((key) => deletePrivateObject(key).catch(() => {}))]);
    return Response.json({ documentId: doc.id, document: { id: doc.id, documentType: data.documentType, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, status: "pending" } });
  } catch (error) {
    if (originalKey) await deletePrivateObject(originalKey).catch(() => {});
    return Response.json({ error: error instanceof Error ? error.message : "Unable to finalize document." }, { status: 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/partner/properties/[propertyId]/kyc/finalize", auth: "strict", requireAuth: true, cache: "private" });
