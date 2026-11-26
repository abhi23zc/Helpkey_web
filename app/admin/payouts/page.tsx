import { PayoutWorkspace } from "@/components/payouts/workspace";
export default async function Page({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const { propertyId } = await searchParams;
  return <PayoutWorkspace propertyId={propertyId} />;
}
