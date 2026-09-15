import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { deletePrivateObject } from "@/lib/r2";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string; documentId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, documentId } = await params;
    const propertyRef = await propertyOwner(user.uid, propertyId);
    const [property, document] = await Promise.all([propertyRef.get(), adminDb.collection("verificationDocuments").doc(documentId).get()]);
    if (property.data()?.status !== "draft" || property.data()?.approvalStatus !== "not_submitted") throw new Error("Verification documents can only be removed while this listing is a draft.");
    const data = document.data();
    if (!document.exists || !data || data.propertyId !== propertyId) throw new Error("DOCUMENT_NOT_FOUND");
    await document.ref.delete();
    await propertyRef.update({ updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    if (typeof data.r2ObjectKey === "string") await deletePrivateObject(data.r2ObjectKey).catch(() => {});
    return Response.json({ ok: true, documentId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove document." }, { status: 422 });
  }
}
