"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Camera, Download, Loader2, MessageCircle, Reply, Send, Star } from "lucide-react";
import { PublicMediaImage } from "@/components/shared/public-media-image";

type Filter = "all" | "awaiting" | "positive" | "critical";
type Range = "7" | "30" | "90" | "all";
type PartnerReply = { text: string; repliedAt: string | null };
type Review = { id: string; reviewerName: string; rating: number; text: string; submittedAt: string | null; photos: Array<{ id: string; imageUrl: string; imageSrcSet?: string; altText: string }>; partnerReply: PartnerReply | null; awaitingReply: boolean };
type Dashboard = {
  metrics: { averageRating: { value: number; previous: number; allTime: number }; newReviews: { value: number; previous: number }; awaitingReplies: { value: number; previous: number }; reviewsWithPhotos: { value: number; previous: number } };
  distribution: Array<{ rating: number; count: number }>;
  trend: Array<{ label: string; average: number; count: number }>;
  topics: Array<{ name: string; count: number }>;
  counts: Record<Filter, number>;
  reviews: Review[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Date unavailable";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "G";
const delta = (value: number, previous: number, suffix = "") => previous === 0 ? (value ? `+${value}${suffix} from prior period` : "No change from prior period") : `${value - previous >= 0 ? "+" : ""}${value - previous}${suffix} from prior period`;

export function PartnerReviewsView({ propertyId, propertyName, propertySlug }: { propertyId?: string; propertyName: string; propertySlug?: string }) {
  const [range, setRange] = useState<Range>("30");
  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<Dashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1, append = false, cursor?: string | null) => {
    if (!propertyId) { setData(null); setLoading(false); return; }
    if (append) setLoadingMore(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ propertyId, range, filter, page: String(page), pageSize: "10" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/partner/reviews?${params}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Unable to load reviews.");
      setData((previous) => append && previous ? { ...json, reviews: [...previous.reviews, ...json.reviews] } : json);
      if (!append) {
        setSelectedId(json.reviews[0]?.id ?? null);
        setReply(json.reviews[0]?.partnerReply?.text ?? "");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load reviews."); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [filter, propertyId, range]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  const selected = useMemo(() => data?.reviews.find((review) => review.id === selectedId) ?? data?.reviews[0] ?? null, [data?.reviews, selectedId]);

  const respondToLatest = () => {
    const latest = data?.reviews.find((review) => review.awaitingReply);
    if (latest) { setSelectedId(latest.id); setReply(latest.partnerReply?.text ?? ""); document.getElementById("review-reply")?.focus(); }
  };

  const saveReply = async () => {
    if (!selected || !reply.trim()) return;
    setSavingReply(true); setError("");
    try {
      const response = await fetch(`/api/partner/reviews/${selected.id}/reply`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: reply.trim() }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Unable to save reply.");
      setData((current) => current ? { ...current, reviews: current.reviews.map((review) => review.id === selected.id ? { ...review, partnerReply: json.partnerReply, awaitingReply: false } : review).filter((review) => filter !== "awaiting" || review.id !== selected.id), total: current.total - (filter === "awaiting" && selected.awaitingReply ? 1 : 0), counts: { ...current.counts, awaiting: Math.max(0, current.counts.awaiting - (selected.awaitingReply ? 1 : 0)) }, metrics: { ...current.metrics, awaitingReplies: { ...current.metrics.awaitingReplies, value: Math.max(0, current.metrics.awaitingReplies.value - (selected.awaitingReply ? 1 : 0)) } } } : current);
      if (filter === "awaiting" && selected.awaitingReply) { setSelectedId(null); setReply(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save reply."); }
    finally { setSavingReply(false); }
  };

  const download = () => {
    if (!data) return;
    const rows = [["Guest", "Rating", "Submitted", "Review", "Partner reply"], ...data.reviews.map((review) => [review.reviewerName, String(review.rating), review.submittedAt ?? "", review.text, review.partnerReply?.text ?? ""])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); anchor.download = `${propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-reviews.csv`; anchor.click(); URL.revokeObjectURL(anchor.href);
  };

  if (loading) return <div className="grid min-h-[520px] place-items-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-7 w-7 animate-spin text-[#c89b3c]" /></div>;
  if (error && !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"><p>{error}</p><button onClick={() => void load()} className="mt-3 rounded-lg bg-[#061224] px-3 py-2 text-xs font-bold text-white">Try again</button></div>;
  if (!propertyId) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Choose a property to view its reviews.</div>;
  const maxBucket = Math.max(1, ...(data?.distribution.map((bucket) => bucket.count) ?? [1]));

  return <div className="space-y-6 pb-16 text-[#061224]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reviews &amp; Guest Feedback</h1><p className="mt-1 text-sm text-slate-500">Real feedback from completed stays at {propertyName}.</p></div><div className="flex flex-wrap gap-2"><select value={range} onChange={(event) => setRange(event.target.value as Range)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select><button onClick={respondToLatest} disabled={!data?.counts.awaiting} className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Reply className="h-4 w-4" />Respond to latest</button><button onClick={download} disabled={!data?.reviews.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold disabled:opacity-50"><Download className="h-4 w-4" />Download CSV</button>{propertySlug && <Link href={`/hotels/${propertySlug}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold">Public reviews<ArrowUpRight className="h-4 w-4" /></Link>}</div></div>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Average rating" value={(data?.metrics.averageRating.value || data?.metrics.averageRating.allTime || 0).toFixed(1)} hint={range === "all" ? `${data?.counts.all ?? 0} reviews all time` : delta(data?.metrics.averageRating.value ?? 0, data?.metrics.averageRating.previous ?? 0)} icon={<Star className="h-5 w-5 fill-current" />} /><Metric label="New reviews" value={String(data?.metrics.newReviews.value ?? 0)} hint={range === "all" ? "All approved reviews" : delta(data?.metrics.newReviews.value ?? 0, data?.metrics.newReviews.previous ?? 0)} icon={<MessageCircle className="h-5 w-5" />} /><Metric label="Awaiting reply" value={String(data?.metrics.awaitingReplies.value ?? 0)} hint={range === "all" ? "Reviews without a response" : delta(data?.metrics.awaitingReplies.value ?? 0, data?.metrics.awaitingReplies.previous ?? 0)} icon={<Reply className="h-5 w-5" />} /><Metric label="Reviews with photos" value={String(data?.metrics.reviewsWithPhotos.value ?? 0)} hint={range === "all" ? "Guest-uploaded photos" : delta(data?.metrics.reviewsWithPhotos.value ?? 0, data?.metrics.reviewsWithPhotos.previous ?? 0)} icon={<Camera className="h-5 w-5" />} /></div>

    <div className="grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Rating distribution</h2><div className="mt-4 space-y-2.5">{data?.distribution.map((bucket) => <div key={bucket.rating} className="flex items-center gap-2 text-xs"><span className="w-7 font-bold">{bucket.rating} ★</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#c89b3c]" style={{ width: `${(bucket.count / maxBucket) * 100}%` }} /></div><span className="w-8 text-right text-slate-500">{bucket.count}</span></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Rating trend</h2><div className="mt-4 flex h-28 items-end gap-1.5">{data?.trend.map((point) => <div key={point.label} title={`${point.label}: ${point.count ? point.average.toFixed(1) : "No reviews"}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] text-slate-500">{point.count ? point.average.toFixed(1) : ""}</span><div className="w-full rounded-t bg-[#c89b3c]" style={{ height: `${point.count ? Math.max(8, (point.average / 5) * 82) : 2}px` }} /></div>)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{data?.trend[0]?.label}</span><span>{data?.trend.at(-1)?.label}</span></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Feedback topics</h2><div className="mt-4 flex flex-wrap gap-2">{data?.topics.length ? data.topics.map((topic) => <span key={topic.name} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{topic.name} <span className="text-slate-400">({topic.count})</span></span>) : <p className="text-sm text-slate-500">No recurring topics yet.</p>}</div></section></div>

    <div className="grid gap-6 lg:grid-cols-12"><section className="lg:col-span-4"><div className="flex gap-1 overflow-x-auto border-b border-slate-200">{([['all','All'],['awaiting','Awaiting reply'],['positive','Positive'],['critical','Critical']] as Array<[Filter,string]>).map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={`relative whitespace-nowrap px-3 py-2 text-xs font-bold ${filter === id ? 'text-[#061224]' : 'text-slate-500'}`}>{label} ({data?.counts[id] ?? 0}){filter === id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#c89b3c]" />}</button>)}</div><div className="mt-4 space-y-3">{data?.reviews.length ? data.reviews.map((review) => <button key={review.id} onClick={() => { setSelectedId(review.id); setReply(review.partnerReply?.text ?? ""); }} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === review.id ? 'border-2 border-[#c89b3c] bg-[#fffdf7]' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-[#9b6d11]">{initials(review.reviewerName)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs">{review.reviewerName}</strong><em className={`rounded px-1.5 py-0.5 text-[9px] not-italic ${review.awaitingReply ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{review.awaitingReply ? 'AWAITING REPLY' : 'REPLIED'}</em></span><span className="mt-1 block text-xs font-bold">{review.rating.toFixed(1)} <span className="text-amber-500">★</span></span><span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-slate-600">{review.text || 'Guest left a rating without written feedback.'}</span><span className="mt-2 block text-[10px] text-slate-400">{date(review.submittedAt)}</span></span></div></button>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No reviews match this filter.</div>}</div>{data?.hasMore && <button onClick={() => void load((data.page ?? 1) + 1, true)} disabled={loadingMore} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#9b6d11]">{loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}Load more</button>}</section>
      <section className="lg:col-span-8"><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">{selected ? <><div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5"><div className="flex gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-sm font-bold text-[#9b6d11]">{initials(selected.reviewerName)}</span><div><h2 className="font-bold">{selected.reviewerName}</h2><p className="mt-1 text-xs text-emerald-700">Verified completed stay · {date(selected.submittedAt)}</p></div></div><div className="text-right"><strong className="text-xl">{selected.rating.toFixed(1)}</strong><p className="text-xs text-amber-500">{'★'.repeat(Math.round(selected.rating))}</p></div></div><p className="py-5 text-sm leading-7 text-slate-700">{selected.text || 'This guest left a rating without written feedback.'}</p>{selected.photos.length > 0 && <div className="mb-5 flex flex-wrap gap-2">{selected.photos.map((photo) => <a key={photo.id} href={photo.imageUrl} target="_blank" rel="noreferrer"><PublicMediaImage src={photo.imageUrl} srcSet={photo.imageSrcSet} alt={photo.altText} className="h-20 w-20 rounded-lg object-cover" /></a>)}</div>}<div className="border-t border-slate-100 pt-5"><h3 className="text-sm font-bold">{selected.partnerReply ? 'Edit public response' : 'Respond publicly'}</h3><p className="mt-1 text-xs text-slate-500">This response appears below the guest’s review on your public listing.</p><textarea id="review-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={2000} rows={6} placeholder="Thank the guest or address their feedback…" className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c]" /><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-slate-400">{reply.length}/2000</span><button onClick={() => void saveReply()} disabled={savingReply || !reply.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingReply && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{selected.partnerReply ? 'Update response' : 'Publish response'}<Send className="h-3.5 w-3.5" /></button></div></div></> : <div className="py-20 text-center text-sm text-slate-500">Select a review to view its details.</div>}</div></section></div>
  </div>;
}

function Metric({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: ReactNode }) { return <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-[#c89b3c]">{icon}</span><div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p></div></div>; }
