import { ReadinessWorkspace } from "@/components/payouts/readiness-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <ReadinessWorkspace key={propertyId} propertyId={propertyId} />;
}
