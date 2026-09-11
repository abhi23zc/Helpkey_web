import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page({
  params,
  searchParams,
}: PageProps<"/partner/properties/[propertyId]">) {
  await requireAuthenticatedUser();
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  const step = typeof query.step === "string" ? `&step=${encodeURIComponent(query.step)}` : "";
  redirect(`/partner/onboarding?propertyId=${encodeURIComponent(propertyId)}${step}`);
}
