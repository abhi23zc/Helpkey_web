import { AccountingWorkspace } from "@/components/accounting/workspace";
export default async function Page({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const { propertyId } = await searchParams;
  return <AccountingWorkspace propertyId={propertyId} />;
}
