import { AdminShell } from "@/components/admin/dashboard/admin-shell";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  if (!user.roles.includes("admin")) redirect("/");
  return <AdminShell>{children}</AdminShell>;
}
