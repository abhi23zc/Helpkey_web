"use client";

import { guestScoreLabel as scoreLabel } from "@/lib/customer/offer";
import { ArrowRight, Star, X, MessageSquare, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useDialog } from "@/components/shared/use-dialog";
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
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const dialogRef = useDialog(allReviewsOpen, () => setAllReviewsOpen(false));

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const query = useInfiniteQuery({
    queryKey: ["catalog", "reviews", property.slug],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      apiFetch<{ reviews: PublicReview[]; total: number; nextCursor: string | null }>(
        `/api/properties/${encodeURIComponent(property.slug)}/reviews?pageSize=6${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: nearViewport || allReviewsOpen,
    staleTime: 60_000,
  });

  const reviews = query.data?.pages.flatMap((page) => page.reviews) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const publicError = query.isError ? "We couldn’t load guest reviews right now." : "";
  const summary = property.reviewSummary;
  const avg = summary?.average ?? property.ratingAverage ?? 0;
  const totalCount = query.data?.pages[0]?.total ?? summary?.count ?? property.ratingCount ?? total;
  const ratingBuckets = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: summary?.buckets[String(rating) as keyof ReviewSummary["buckets"]] ?? 0,
  }));
  const maxBucket = Math.max(1, ...ratingBuckets.map((bucket) => bucket.count));
  const shownReviews = reviews.slice(0, 2);

  const ReviewItem = ({ review, compact = false }: { review: PublicReview; compact?: boolean }) => (
    <article className={`border-b border-slate-100 last:border-b-0 ${compact ? "py-5" : "py-6"}`}>
      <div className="flex items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--hk-surface-soft)] text-xs font-bold text-[var(--hk-navy)] shadow-xs">
          {initials(review.reviewerName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-[var(--hk-navy)] flex items-center gap-1.5">
                {review.reviewerName}
                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {review.submittedAt
                  ? new Date(review.submittedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Verified guest"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--hk-navy)] px-2.5 py-1 text-xs font-bold text-white shadow-xs">
              {review.rating.toFixed(0)} <Star className="h-3 w-3 fill-[var(--hk-gold-light)] text-[var(--hk-gold-light)]" />
            </span>
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">{review.text}</p>

          {review.photos.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {review.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 shadow-xs hover:opacity-90 transition"
                >
                  <PublicMediaImage
                    src={photo.imageUrl}
                    srcSet={photo.imageSrcSet}
                    alt={photo.altText}
                    sizes="64px"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {review.partnerReply && (
            <div className="mt-4 rounded-xl border-l-3 border-[var(--hk-gold)] bg-amber-50/50 p-4">
              <p className="text-xs font-bold text-[var(--hk-navy)] flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[var(--hk-gold-strong)]" />
                Response from the property
              </p>
              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-700">
                {review.partnerReply.text}
              </p>
              {review.partnerReply.repliedAt && (
                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(review.partnerReply.repliedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );

  return (
    <section ref={sectionRef} id="reviews" className="scroll-mt-24 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--hk-navy)]">
            Guest Reviews
          </h2>
          <p className="mt-0.5 text-sm text-[var(--hk-muted)]">
            Real feedback from verified guests
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAllReviewsOpen(true)}
          className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--hk-navy)] hover:text-slate-600 transition"
        >
          Read {totalCount ? `all ${totalCount} ${totalCount === 1 ? "review" : "reviews"}` : "guest reviews"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </header>

      {/* Rating Scorecard */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className={summary ? "grid md:grid-cols-[260px_1fr]" : "grid"}>
          <div
            className={`flex flex-col items-center justify-center bg-radial from-slate-50 to-white px-6 py-8 ${
              summary ? "border-b border-slate-200 md:border-b-0 md:border-r" : ""
            }`}
          >
            {totalCount ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--hk-navy)] px-4 py-2 text-2xl font-black text-white shadow-sm">
                {avg.toFixed(1)}{" "}
                <Star className="h-4 w-4 fill-[var(--hk-gold-light)] text-[var(--hk-gold-light)]" />
              </span>
            ) : (
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hk-surface-soft)] text-amber-500 shadow-xs">
                <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
              </span>
            )}
            <p className="mt-3 text-sm font-bold uppercase tracking-wide text-[var(--hk-navy)]">
              {totalCount ? scoreLabel(avg) : "No reviews yet"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {totalCount} {totalCount === 1 ? "rating" : "ratings"} from verified stays
            </p>
          </div>

          {summary && (
            <div className="space-y-2.5 px-6 py-6">
              {ratingBuckets.map(({ rating, count }) => (
                <div key={rating} className="flex items-center gap-3 text-xs">
                  <span className="w-6 text-right font-semibold text-[var(--hk-navy)]">
                    {rating}{" "}
                    <Star className="inline h-3 w-3 fill-[var(--hk-gold)] text-[var(--hk-gold)]" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--hk-gold)] transition-all duration-500"
                      style={{ width: `${(count / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-slate-400 font-medium">
                    {totalCount ? Math.round((count / totalCount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review Cards List */}
      {publicError ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {publicError}{" "}
          <button className="underline font-semibold" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-6 shadow-xs">
          {shownReviews.length ? (
            shownReviews.map((review) => <ReviewItem key={review.id} review={review} compact />)
          ) : (
            <p
              role="status"
              className="py-10 text-center text-sm text-slate-500"
            >
              {query.isLoading
                ? "Loading reviews…"
                : query.isPending && totalCount
                  ? "Guest reviews will load here."
                  : "No reviews yet. Be the first to share your stay."}
            </p>
          )}
        </div>
      )}

      {/* All Reviews Modal Dialog */}
      {allReviewsOpen && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="All guest reviews"
        >
          <button
            type="button"
            aria-label="Close reviews"
            className="absolute inset-0 cursor-default"
            onClick={() => setAllReviewsOpen(false)}
          />
          <aside className="relative h-full w-full max-w-[560px] overflow-y-auto bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-[var(--hk-navy)]">
                {totalCount} Guest {totalCount === 1 ? "Review" : "Reviews"}
              </h3>
              <button
                type="button"
                onClick={() => setAllReviewsOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-[var(--hk-navy)] transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {totalCount ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--hk-navy)] px-3 py-1.5 text-lg font-black text-white">
                  {avg.toFixed(1)}{" "}
                  <Star className="h-3.5 w-3.5 fill-[var(--hk-gold-light)] text-[var(--hk-gold-light)]" />
                </span>
              ) : (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--hk-surface-soft)] text-amber-500 shadow-xs">
                  <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
                </span>
              )}
              <div>
                <p className="text-sm font-bold text-[var(--hk-navy)]">
                  {totalCount ? scoreLabel(avg) : "No reviews yet"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Based on verified guest stays</p>
              </div>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {reviews.length ? (
                reviews.map((review) => <ReviewItem key={review.id} review={review} />)
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  {query.isError
                    ? "Reviews are temporarily unavailable."
                    : query.isPending
                      ? "Loading reviews…"
                      : "No reviews yet."}
                </p>
              )}
            </div>

            {query.isError && (
              <p role="alert" className="py-4 text-sm text-red-700">
                {publicError}{" "}
                <button className="underline font-semibold" onClick={() => void query.refetch()}>
                  Try again
                </button>
              </p>
            )}

            {query.isLoading && <p role="status">Loading reviews…</p>}

            {query.hasNextPage && (
              <button
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mt-6 w-full rounded-xl bg-[var(--hk-navy)] py-3.5 text-sm font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more reviews"}
              </button>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

