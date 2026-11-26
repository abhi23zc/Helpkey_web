import { DuesWorkspace } from "@/components/dues/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  return <DuesWorkspace propertyId={(await searchParams).propertyId} />;
}
