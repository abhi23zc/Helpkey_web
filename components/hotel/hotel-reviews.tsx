"use client";

import { Camera, ChevronDown, MessageCircle, Star } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type ReviewSummary = { count: number; ratingSum: number; average: number; buckets: Record<"1" | "2" | "3" | "4" | "5", number> };
type Property = { id: string; slug: string; reviewSummary: ReviewSummary | null };
type PublicReview = { id: string; reviewerName: string; rating: number; text: string; submittedAt: string | null; photos: Array<{ id: string; imageUrl: string; altText: string }> };
type OwnReview = { id: string; rating: number; text: string; status: "pending" | "approved" | "rejected"; photoIds: string[] };

const scoreLabel = (score: number) => score >= 4.5 ? "Excellent" : score >= 4 ? "Very good" : score >= 3 ? "Good" : "Guest rated";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "G";

export function Reviews({ property, onLogin }: { property: Property; onLogin: () => void }) {
  const { appUser, loading } = useAuth();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [publicError, setPublicError] = useState("");
  const [own, setOwn] = useState<OwnReview | null>(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPublic = async (nextPage: number) => {
    try {
      setPublicError("");
      const response = await fetch(`/api/properties/${encodeURIComponent(property.slug)}/reviews?page=${nextPage}&pageSize=5`, { cache: "no-store" });
      const data = await response.json() as { reviews?: PublicReview[]; total?: number };
      if (!response.ok) throw new Error();
      setReviews(data.reviews ?? []); setTotal(data.total ?? 0);
    } catch { setPublicError("We couldn’t load guest reviews right now. Please try again shortly."); }
  };

  useEffect(() => { void Promise.resolve().then(() => loadPublic(page)); }, [page, property.slug]);
  useEffect(() => {
    if (!appUser) { queueMicrotask(() => setOwn(null)); return; }
    void fetch(`/api/reviews/${encodeURIComponent(property.id)}`, { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { review: OwnReview | null };
      setOwn(data.review);
      if (data.review) { setRating(data.review.rating); setText(data.review.text); }
    });
  }, [appUser, property.id]);

  const upload = async (files: FileList | null) => {
    if (!files?.length || !own) { setFormError("Save your review before adding photos."); return; }
    if (files.length > 5 - own.photoIds.length) { setFormError("You can attach up to five photos."); return; }
    setSaving(true); setFormError("");
    try {
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error("Photos must be JPEG, PNG, or WebP and 12 MB or smaller.");
        const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, "0")).join("");
        const begin = await fetch(`/api/reviews/${encodeURIComponent(property.id)}/photos/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum }) });
        const uploadData = await begin.json() as { uploadId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
        if (!begin.ok || !uploadData.uploadUrl || !uploadData.uploadId) throw new Error(uploadData.error ?? "Unable to start photo upload.");
        if (!(await fetch(uploadData.uploadUrl, { method: "PUT", headers: uploadData.headers, body: file })).ok) throw new Error("Photo upload failed.");
        const finish = await fetch(`/api/reviews/${encodeURIComponent(property.id)}/photos/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: uploadData.uploadId }) });
        const finishData = await finish.json() as { error?: string };
        if (!finish.ok) throw new Error(finishData.error ?? "Unable to save photo.");
      }
      setOwn(current => current ? { ...current, status: "pending", photoIds: [...current.photoIds, ...Array.from(files).map(file => file.name)] } : current);
      setNotice("Photos added. Your review is now pending moderation.");
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to upload photos."); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    if (!appUser) { onLogin(); return; }
    setSaving(true); setFormError(""); setNotice("");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(property.id)}`, { method: own ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, text }) });
      const data = await response.json() as { review?: OwnReview; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to submit review.");
      setOwn(data.review ?? null); setEditorOpen(false); setNotice(own ? "Your changes are pending moderation." : "Thanks — your review is pending moderation.");
      await loadPublic(1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to submit review."); }
    finally { setSaving(false); }
  };

  const summary = property.reviewSummary;
  return <section id="reviews" className="scroll-mt-24">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--hk-gold-strong)]">Guest feedback</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--hk-navy)]">Ratings & reviews</h2><p className="mt-1 text-sm text-[var(--hk-muted)]">Published after Helpkey moderation.</p></div>{total > 0 && <span className="rounded-full bg-[var(--hk-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--hk-navy)]">{total} guest reviews</span>}</header>
    {summary ? <section className="mt-6 overflow-hidden rounded-xl border border-[var(--hk-border)] bg-white"><div className="grid md:grid-cols-[190px_1fr]"><div className="flex flex-col items-center justify-center border-b border-[var(--hk-border)] bg-[var(--hk-surface-soft)] px-6 py-7 text-center md:border-b-0 md:border-r"><span className="rounded-md bg-[var(--hk-navy)] px-3 py-1.5 text-3xl font-bold text-white">{summary.average.toFixed(1)}</span><span className="mt-3 flex text-[var(--hk-gold-strong)]">{[1, 2, 3, 4, 5].map(star => <Star key={star} className="h-3.5 w-3.5 fill-current" />)}</span><p className="mt-2 text-sm font-bold text-[var(--hk-navy)]">{scoreLabel(summary.average)}</p><p className="mt-0.5 text-xs text-[var(--hk-muted)]">{summary.count} ratings</p></div><div className="space-y-2.5 px-6 py-6">{([5, 4, 3, 2, 1] as const).map(star => { const count = summary.buckets[String(star) as "1" | "2" | "3" | "4" | "5"]; const percent = Math.round((count / summary.count) * 100); return <div key={star} className="grid grid-cols-[32px_1fr_62px] items-center gap-3 text-xs"><span className="font-semibold text-[var(--hk-navy)]">{star} <Star className="inline h-3 w-3 fill-[var(--hk-gold-strong)] text-[var(--hk-gold-strong)]" /></span><div className="h-1.5 overflow-hidden rounded-full bg-[#edf0f5]"><div className="h-full rounded-full bg-[var(--hk-gold)]" style={{ width: `${percent}%` }} /></div><span className="text-right text-[var(--hk-muted)]">{count} · {percent}%</span></div>; })}</div></div></section> : <div className="mt-6 rounded-xl border border-dashed border-[var(--hk-border-strong)] bg-white px-5 py-5 text-sm text-[var(--hk-muted)]">No approved guest reviews yet. Share your experience to help the next traveller.</div>}
    {publicError ? <p role="alert" className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{publicError}</p> : reviews.length > 0 && <div className="mt-6 divide-y divide-[var(--hk-border)] rounded-xl border border-[var(--hk-border)] bg-white px-5">{reviews.map(review => <article key={review.id} className="py-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8edf5] text-xs font-bold text-[var(--hk-navy)]">{initials(review.reviewerName)}</span><div><h3 className="text-sm font-bold text-[var(--hk-navy)]">{review.reviewerName}</h3><p className="mt-0.5 text-xs text-[var(--hk-muted)]">{review.submittedAt ? new Date(review.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Recently"}</p></div></div><span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--hk-navy)] px-2 py-1 text-xs font-bold text-white"><Star className="h-3 w-3 fill-current" />{review.rating}.0</span></div><p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-[#4c586a]">{review.text}</p>{review.photos.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{review.photos.map(photo => <a key={photo.id} href={photo.imageUrl} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-md border border-[var(--hk-border)]"><img src={photo.imageUrl} alt={photo.altText} className="h-full w-full object-cover" /></a>)}</div>}</article>)}</div>}
    {total > 5 && <div className="mt-4 flex justify-end gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border border-[var(--hk-border-strong)] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">Previous</button><button disabled={page * 5 >= total} onClick={() => setPage(value => value + 1)} className="rounded-lg border border-[var(--hk-border-strong)] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">Next</button></div>}
    <section className="mt-7 overflow-hidden rounded-xl border border-[var(--hk-border)] bg-white"><button type="button" onClick={() => appUser ? setEditorOpen(value => !value) : onLogin()} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--hk-surface-soft)]"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]"><MessageCircle className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[var(--hk-navy)]">{own ? "Manage your review" : "Write a review"}</span><span className="mt-0.5 block text-xs text-[var(--hk-muted)]">{own ? `Status: ${own.status}` : "Tell future guests about your stay."}</span></span></span>{!loading && !appUser ? <span className="rounded-md bg-[var(--hk-navy)] px-3 py-2 text-xs font-bold text-white">Sign in</span> : <ChevronDown className={`h-5 w-5 text-[var(--hk-muted)] transition-transform ${editorOpen ? "rotate-180" : ""}`} />}</button>{editorOpen && <div className="border-t border-[var(--hk-border)] px-5 py-5"><p className="text-sm font-semibold text-[var(--hk-navy)]">Your rating</p><div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition ${rating === value ? "border-[var(--hk-navy)] bg-[var(--hk-navy)] text-white" : "border-[var(--hk-border)] bg-white text-[var(--hk-muted)] hover:border-[var(--hk-navy)]"}`}><Star className={`h-4 w-4 ${rating === value ? "fill-current" : ""}`} /></button>)}</div><textarea value={text} onChange={event => setText(event.target.value)} maxLength={3000} placeholder="What did you enjoy? What could be better?" className="mt-5 min-h-28 w-full rounded-lg border border-[var(--hk-border-strong)] p-3 text-sm outline-none transition focus:border-[var(--hk-navy)] focus:ring-2 focus:ring-[#d8b46a]/20" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--hk-border-strong)] px-3 py-2 text-sm font-semibold text-[var(--hk-navy)]"><Camera className="h-4 w-4" /><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => void upload(event.target.files)} />Add photos</label><button disabled={saving || text.trim().length < 10} onClick={() => void submit()} className="rounded-lg bg-[var(--hk-navy)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--hk-navy-strong)] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : own ? "Save changes" : "Submit review"}</button></div>{formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}</div>}{notice && <p className="border-t border-[var(--hk-border)] bg-[#f4faf0] px-5 py-3 text-sm text-[var(--hk-success)]">{notice}</p>}</section>
  </section>;
}
