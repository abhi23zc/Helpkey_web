import { redirect } from "next/navigation";

export default async function AccountingRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  const propertyId = typeof sp.propertyId === "string" ? sp.propertyId : "";
  if (propertyId) params.set("propertyId", propertyId);
  params.set("tab", "bookings");
  if (typeof sp.bookingId === "string") params.set("bookingId", sp.bookingId);
  redirect(`/partner/finances?${params.toString()}`);
}
