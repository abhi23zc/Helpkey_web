import { PropertySetup } from "@/components/partner/property-setup";
import { requireAuthenticatedUser } from "@/lib/auth/session";
export default async function Page({ params }: PageProps<"/partner/properties/[propertyId]">) { await requireAuthenticatedUser(); const { propertyId } = await params; return <PropertySetup propertyId={propertyId} />; }
