import { redirect } from "next/navigation";
import { hash } from "@/lib/accounting/domain";

export default async function DuesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  const propertyId = typeof sp.propertyId === "string" ? sp.propertyId : "";
  if (propertyId) params.set("propertyId", propertyId);
  const paymentId = typeof sp.paymentId === "string" ? sp.paymentId : "";
  if (paymentId) {
    params.set("tab", "payments");
    params.set("type", "dues_receipts");
    params.set("activityId", hash(["dues_payment", `hotelDuesPaymentsV1/${paymentId}`]));
  } else {
    params.set("tab", "bookings");
    params.set("status", "dues");
  }
  redirect(`/partner/finances?${params.toString()}`);
}
