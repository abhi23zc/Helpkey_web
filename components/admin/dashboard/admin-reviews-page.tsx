import { CheckCircle2, MessageSquare } from "lucide-react";

export function AdminReviewsPage() {
  return <section className="space-y-6"><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[#755a1a]">Guest feedback</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Guest reviews</h1><p className="mt-2 text-sm text-slate-500">Reviews from completed Helpkey stays are published immediately.</p></header><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 text-lg font-bold text-emerald-950">No review approval queue</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-800">Guests can submit one review after a completed stay. Their rating, feedback, and photos are published without administrator or hotel-owner approval.</p><MessageSquare className="mx-auto mt-5 h-5 w-5 text-emerald-600" /></div></section>;
}
