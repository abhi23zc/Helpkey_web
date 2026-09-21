"use client";

import { ArrowRight, Star, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublicMediaImage } from "@/components/shared/public-media-image";

type ReviewSummary = {
  count: number;
  ratingSum: number;
  average: number;
  buckets: Record<"1" | "2" | "3" | "4" | "5", number>;
};

type Property = {
  id: string;
  slug: string;
  reviewSummary: ReviewSummary | null;
  ratingAverage?: number;
  ratingCount?: number;
};

type PublicReview = {
  id: string;
  reviewerName: string;
  rating: number;
  text: string;
  submittedAt: string | null;
  photos: Array<{ id: string; imageUrl: string; imageSrcSet?: string; width?: number; height?: number; altText: string }>;
  partnerReply: { text: string; repliedAt: string | null } | null;
};

const scoreLabel = (score: number) =>
  score >= 4.8
    ? "Exceptional"
    : score >= 4.5
      ? "Excellent"
      : score >= 4.0
        ? "Very good"
        : score >= 3.0
          ? "Good"
          : "Rated by guests";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "G";

export function Reviews({
  property,
}: {
  property: Property;
}) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [publicError, setPublicError] = useState("");
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);

  const loadPublic = useCallback(async (nextPage: number) => {
    try {
      setPublicError("");
      const response = await fetch(
        `/api/properties/${encodeURIComponent(property.slug)}/reviews?page=${nextPage}&pageSize=6`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        reviews?: PublicReview[];
        total?: number;
      };
      if (!response.ok) throw new Error();
      setReviews(data.reviews ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setPublicError(
        "We couldn’t load guest reviews right now. Please try again shortly."
      );
    }
  }, [property.slug]);

  useEffect(() => {
    void Promise.resolve().then(() => loadPublic(page));
  }, [page, loadPublic]);

  const summary = property.reviewSummary;
  const avg = summary?.average ?? property.ratingAverage ?? 0;
  const totalCount = summary?.count ?? property.ratingCount ?? total;
  const ratingBuckets = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: summary?.buckets[String(rating) as keyof ReviewSummary["buckets"]] ?? 0,
  }));
  const maxBucket = Math.max(1, ...ratingBuckets.map((bucket) => bucket.count));
  const shownReviews = reviews.slice(0, 2);

  const ReviewItem = ({ review, compact = false }: { review: PublicReview; compact?: boolean }) => (
    <article className={`border-b border-slate-100 last:border-b-0 ${compact ? "py-5" : "py-6"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef2fa] text-xs font-bold text-[#092442]">{initials(review.reviewerName)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[#092442]">{review.reviewerName}<span className="ml-1.5 font-normal text-slate-400">• {review.submittedAt ? new Date(review.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Verified guest"}</span></p>
            <span className="inline-flex items-center gap-1 rounded-sm bg-[#092442] px-2 py-1 text-xs font-bold text-white">{review.rating.toFixed(0)} <Star className="h-3 w-3 fill-current" /></span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">{review.text}</p>
          {review.photos.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{review.photos.map((photo) => <a key={photo.id} href={photo.imageUrl} target="_blank" rel="noreferrer" className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200"><PublicMediaImage src={photo.imageUrl} srcSet={photo.imageSrcSet} alt={photo.altText} sizes="56px" className="h-full w-full object-cover" /></a>)}</div>}
          {review.partnerReply && <div className="mt-4 rounded-lg border-l-2 border-[#c89b3c] bg-[#fbf5e8] px-4 py-3"><p className="text-xs font-bold text-[#092442]">Response from the property</p><p className="mt-1 text-sm leading-relaxed text-slate-700">{review.partnerReply.text}</p>{review.partnerReply.repliedAt && <p className="mt-1.5 text-[11px] text-slate-500">{new Date(review.partnerReply.repliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>}</div>}
        </div>
      </div>
    </article>
  );

  return (
    <section id="reviews" className="scroll-mt-24">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
          Guest Reviews
        </h2>
        <button
          type="button"
          onClick={() => setAllReviewsOpen(true)}
          className="group inline-flex items-center gap-1.5 text-xs md:text-sm font-semibold text-[#0F172A] hover:text-slate-600 transition"
        >
          Read all {totalCount} reviews
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </header>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid md:grid-cols-[290px_1fr]">
          <div className="flex flex-col items-center justify-center border-b border-slate-200 px-6 py-7 md:border-b-0 md:border-r">
            <span className="inline-flex items-center gap-1 rounded bg-[#c89b3c] px-3 py-2 text-2xl font-extrabold text-[#092442]">{avg.toFixed(1)} <Star className="h-4 w-4 fill-current" /></span>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#092442]">{scoreLabel(avg)}</p>
            <p className="mt-1 text-xs text-slate-500">{totalCount} ratings from verified stays</p>
          </div>
          <div className="space-y-2.5 px-6 py-6">{ratingBuckets.map(({ rating, count }) => <div key={rating} className="flex items-center gap-3 text-xs"><span className="w-5 text-right font-semibold text-[#092442]">{rating} <Star className="inline h-3 w-3 fill-[#c89b3c] text-[#c89b3c]" /></span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#c89b3c] transition-all duration-500" style={{ width: `${(count / maxBucket) * 100}%` }} /></div><span className="w-10 text-right text-slate-500">{totalCount ? Math.round((count / totalCount) * 100) : 0}%</span></div>)}</div>
        </div>
      </div>

      {/* Review Cards Grid (2-Column Layout matching Image 1) */}
      {publicError ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {publicError}
        </p>
      ) : (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-6">{shownReviews.length ? shownReviews.map((review) => <ReviewItem key={review.id} review={review} compact />) : <p className="py-8 text-center text-sm text-slate-500">No guest reviews yet. Be the first to share your stay.</p>}</div>
      )}

      {/* Pagination controls */}
      {total > 6 && (
        <div className="mt-6 flex justify-end gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={page * 6 >= total}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {allReviewsOpen && <div className="fixed inset-0 z-[80] flex justify-end bg-[#061224]/65" role="dialog" aria-modal="true" aria-label="All guest reviews"><button type="button" aria-label="Close reviews" className="absolute inset-0 cursor-default" onClick={() => setAllReviewsOpen(false)} /><aside className="relative h-full w-full max-w-[540px] overflow-y-auto bg-white p-6 shadow-2xl sm:p-7"><div className="flex items-center justify-between gap-4"><h3 className="text-xl font-bold text-[#092442]">{totalCount} Guest Reviews</h3><button type="button" onClick={() => setAllReviewsOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#092442]" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-5 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><span className="inline-flex items-center gap-1 rounded bg-[#c89b3c] px-2.5 py-1.5 text-lg font-extrabold text-[#092442]">{avg.toFixed(1)} <Star className="h-3.5 w-3.5 fill-current" /></span><div><p className="text-sm font-bold text-[#092442]">{scoreLabel(avg)}</p><p className="mt-0.5 text-xs text-slate-500">Based on verified guest stays</p></div></div><div className="mt-4 divide-y divide-slate-100">{reviews.length ? reviews.map((review) => <ReviewItem key={review.id} review={review} />) : <p className="py-8 text-center text-sm text-slate-500">No guest reviews yet.</p>}</div>{total > 6 && <div className="mt-5 flex justify-end gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#092442] disabled:opacity-40">Previous</button><button disabled={page * 6 >= total} onClick={() => setPage((value) => value + 1)} className="rounded-lg bg-[#092442] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Next reviews</button></div>}</aside></div>}

    </section>
  );
}
