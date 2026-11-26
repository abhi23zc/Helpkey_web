import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { providerFetch } from "@/lib/providers/http";
import { retryDelay } from "@/lib/background/config";
/** Separate booking sender; OTP configuration and delivery are deliberately independent. */
export async function processBookingWhatsapp(id: string) {
  const ref = adminDb.collection("bookingNotificationOutbox").doc(id),
    lease = randomUUID();
  const event = await adminDb.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data();
    if (
      !e ||
      !["pending", "retry"].includes(e.status) ||
      e.nextAttemptAt.toMillis() > Date.now() ||
      e.leaseExpiresAt?.toMillis() > Date.now()
    )
      return null;
    tx.update(ref, {
      leaseOwner: lease,
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 60000),
    });
    return e;
  });
  if (!event) return;
  try {
    const key = process.env.WHATSAPP_BOOKING_API_KEY;
    const base = process.env.WHATSAPP_BOOKING_API_URL;
    if (!key || !base) throw new Error("BOOKING_WHATSAPP_NOT_CONFIGURED");
    if (!/^\+\d{6,15}$/.test(event.recipientPhone))
      throw new Error("INVALID_RECIPIENT");
    const url = new URL(base);
    if (url.protocol !== "https:") throw new Error("INVALID_PROVIDER_URL");
    url.searchParams.set("apikey", key);
    url.searchParams.set("to", event.recipientPhone);
    url.searchParams.set("message", event.message);
    const response = await providerFetch("whatsapp", url, {
      method: "GET",
      timeoutMs: 8000,
      idempotent: false,
    });
    const result = await response.json();
    if (
      !response.ok ||
      !(
        result.success === true ||
        result.status === true ||
        result.status === "success"
      )
    )
      throw new Error("BOOKING_WHATSAPP_REJECTED");
    await adminDb.runTransaction(async (tx) => {
      const e = (await tx.get(ref)).data();
      if (e?.leaseOwner === lease)
        tx.update(ref, {
          status: "completed",
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: FieldValue.serverTimestamp(),
          providerMessageId: typeof result.id === "string" ? result.id : null,
        });
    });
  } catch (error) {
    await adminDb.runTransaction(async (tx) => {
      const e = (await tx.get(ref)).data();
      if (e?.leaseOwner !== lease) return;
      const attempts = Number(e.attempts ?? 0) + 1;
      tx.update(ref, {
        status: attempts >= 6 ? "dead" : "retry",
        attempts,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: Timestamp.fromMillis(
          Date.now() + retryDelay(attempts, 30000),
        ),
        lastError: error instanceof Error ? error.message : "DELIVERY_FAILED",
      });
    });
    throw new Error("BOOKING_WHATSAPP_DELIVERY_FAILED");
  }
}
