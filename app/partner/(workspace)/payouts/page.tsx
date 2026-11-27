import { redirect } from "next/navigation";
import { hash } from "@/lib/accounting/domain";

export default async function PayoutsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  const propertyId = typeof sp.propertyId === "string" ? sp.propertyId : "";
  if (propertyId) params.set("propertyId", propertyId);
  const payoutId = typeof sp.payoutId === "string" ? sp.payoutId : "";
  params.set("tab", "payments");
  params.set("type", "payouts");
  if (payoutId) params.set("activityId", hash(["payout", `hotelPayoutsV1/${payoutId}`]));
  redirect(`/partner/finances?${params.toString()}`);
}
