import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";

export const metadata: Metadata = { title: "Privacy Requests | Helpkey Admin", robots: { index: false, follow: false } };

export default async function Page() {
  const user = await requireAuthenticatedUser();
  await requireAdmin(user.uid);
  const snapshot = await adminDb.collection("privacyRequests").orderBy("createdAt", "desc").limit(100).get();
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Privacy &amp; account deletion requests</h1><p className="mt-2 text-sm text-slate-600">Latest 100 requests. Contact the requester and verify account ownership before making changes. This inbox records requests; it does not perform deletion.</p><Link href="/admin/users" className="mt-3 inline-block text-sm underline">Open user directory</Link></div>
    {!snapshot.size && <p className="rounded-xl bg-white p-6">No requests yet.</p>}
    {snapshot.docs.map(doc => {
      const data = doc.data();
      return <article key={doc.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">{data.kind === "account-deletion" ? "Account deletion" : "Privacy question"} · {String(data.status)}</h2>
        <dl className="grid gap-2 text-sm"><div><dt className="font-medium">Reference</dt><dd className="break-all">{doc.id}</dd></div><div><dt className="font-medium">Received</dt><dd>{data.createdAt?.toDate?.().toISOString() ?? "Pending timestamp"}</dd></div><div><dt className="font-medium">Name</dt><dd>{String(data.name)}</dd></div><div><dt className="font-medium">Contact</dt><dd className="break-all">{String(data.contact)}</dd></div>{data.accountIdentifier && <div><dt className="font-medium">Helpkey account</dt><dd className="break-all">{String(data.accountIdentifier)}</dd></div>}<div><dt className="font-medium">Message</dt><dd className="whitespace-pre-wrap break-words">{String(data.message) || "No additional details"}</dd></div></dl>
      </article>;
    })}
  </main>;
}
