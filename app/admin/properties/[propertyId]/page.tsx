import { AdminPropertyReviewPage } from "@/components/admin/dashboard/admin-property-review-page";

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <AdminPropertyReviewPage propertyId={propertyId} />;
}
