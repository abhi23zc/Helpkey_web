import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Page() {
  const user = await requireAuthenticatedUser();
  if (!user.roles.includes("admin")) redirect("/");
  return <AdminDashboard />;
}
