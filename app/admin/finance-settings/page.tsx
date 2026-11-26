import { FinanceWorkspace } from "@/components/finance-settings/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  return <FinanceWorkspace propertyId={(await searchParams).propertyId} />;
}
