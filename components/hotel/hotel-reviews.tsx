"use client";

import { guestScoreLabel as scoreLabel } from "@/lib/customer/offer";
import { ArrowRight, Star, X, MessageSquare, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

type ReviewPhoto = {
  id: string;
  imageUrl: string;
  imageSrcSet?: string;
  width?: number;
  height?: number;
  altText: string;
};

type PublicReview = {
  id: string;
  reviewerName: string;
  rating: number;
  text: string;
  submittedAt: string | null;
  photos: ReviewPhoto[];
  partnerReply: { text: string; repliedAt: string | null } | null;
};

type SelectedPhoto = {
  id: string;
  imageUrl: string;
  imageSrcSet?: string;
  altText?: string;
  reviewId?: string;
  reviewerName?: string;
  rating?: number;
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
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const handleCloseAll = useCallback(() => {
    setAllReviewsOpen(false);
    setSelectedPhoto(null);
  }, []);

  const dialogRef = useDialog(allReviewsOpen, handleCloseAll);

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

  // Flattened list of all review photos across loaded reviews
  const allPhotos: SelectedPhoto[] = reviews.flatMap((r) =>
    r.photos.map((p) => ({
      id: p.id,
      imageUrl: p.imageUrl,
      imageSrcSet: p.imageSrcSet,
      altText: p.altText,
      reviewId: r.id,
      reviewerName: r.reviewerName,
      rating: r.rating,
    })),
  );

  const activePhotoIndex = selectedPhoto
    ? allPhotos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;
  const activePhoto =
    activePhotoIndex >= 0 ? allPhotos[activePhotoIndex] : selectedPhoto;

  const scrollToReview = (reviewId: string) => {
    const element = document.getElementById(`modal-review-${reviewId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleOpenPhotoFromPage = (photo: ReviewPhoto, review: PublicReview) => {
    setSelectedPhoto({
      id: photo.id,
      imageUrl: photo.imageUrl,
      imageSrcSet: photo.imageSrcSet,
      altText: photo.altText,
      reviewId: review.id,
      reviewerName: review.reviewerName,
      rating: review.rating,
    });
    setAllReviewsOpen(true);
    setTimeout(() => scrollToReview(review.id), 120);
  };

  const handleSelectPhotoInModal = (photo: ReviewPhoto, review: PublicReview) => {
    setSelectedPhoto({
      id: photo.id,
      imageUrl: photo.imageUrl,
      imageSrcSet: photo.imageSrcSet,
      altText: photo.altText,
      reviewId: review.id,
      reviewerName: review.reviewerName,
      rating: review.rating,
    });
  };

  const handlePrevPhoto = useCallback(() => {
    if (allPhotos.length <= 1) return;
    const nextIdx =
      activePhotoIndex <= 0 ? allPhotos.length - 1 : activePhotoIndex - 1;
    const target = allPhotos[nextIdx];
    setSelectedPhoto(target);
    if (target.reviewId) {
      scrollToReview(target.reviewId);
    }
  }, [allPhotos, activePhotoIndex]);

  const handleNextPhoto = useCallback(() => {
    if (allPhotos.length <= 1) return;
    const nextIdx =
      activePhotoIndex >= allPhotos.length - 1 ? 0 : activePhotoIndex + 1;
    const target = allPhotos[nextIdx];
    setSelectedPhoto(target);
    if (target.reviewId) {
      scrollToReview(target.reviewId);
    }
  }, [allPhotos, activePhotoIndex]);

  useEffect(() => {
    if (!allReviewsOpen || !selectedPhoto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevPhoto();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNextPhoto();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allReviewsOpen, selectedPhoto, handlePrevPhoto, handleNextPhoto]);

  const ReviewItem = ({
    review,
    compact = false,
    isModal = false,
  }: {
    review: PublicReview;
    compact?: boolean;
    isModal?: boolean;
  }) => (
    <article
      id={isModal ? `modal-review-${review.id}` : undefined}
      className={`border-b border-slate-100 last:border-b-0 ${compact ? "py-5" : "py-6"}`}
    >
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
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              {review.photos.map((photo) => {
                const isSelected = isModal && selectedPhoto?.id === photo.id;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      if (isModal) {
                        handleSelectPhotoInModal(photo, review);
                      } else {
                        handleOpenPhotoFromPage(photo, review);
                      }
                    }}
                    aria-label={`View photo from ${review.reviewerName}`}
                    className={`group relative h-16 w-16 overflow-hidden rounded-xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hk-navy)] ${
                      isSelected
                        ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)] ring-offset-2 ring-offset-white shadow-md scale-95"
                        : "border-slate-200 shadow-xs hover:border-slate-400 hover:shadow-sm hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    <PublicMediaImage
                      src={photo.imageUrl}
                      srcSet={photo.imageSrcSet}
                      alt={photo.altText || `Review photo by ${review.reviewerName}`}
                      sizes="64px"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {isSelected && (
                      <span className="pointer-events-none absolute inset-0 bg-[var(--hk-navy)]/10 ring-1 ring-inset ring-[var(--hk-navy)]" />
                    )}
                  </button>
                );
              })}
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
          onClick={() => {
            setSelectedPhoto(null);
            setAllReviewsOpen(true);
          }}
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

      {/* All Reviews Modal Dialog with Photo Viewer */}
      {allReviewsOpen && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={`fixed inset-0 z-[80] animate-in fade-in duration-200 ${
            selectedPhoto && activePhoto
              ? "flex flex-col lg:flex-row bg-[#020814] text-white"
              : "flex justify-end bg-black/60 backdrop-blur-xs"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="All guest reviews"
        >
          {/* Backdrop button for drawer-only mode */}
          {!selectedPhoto && (
            <button
              type="button"
              aria-label="Close reviews"
              className="absolute inset-0 cursor-default"
              onClick={handleCloseAll}
            />
          )}

          {/* Left Photo Viewer (Desktop) / Top (Mobile) */}
          {selectedPhoto && activePhoto && (
            <div className="relative flex-1 min-w-0 h-[44vh] sm:h-[50vh] lg:h-full bg-black/95 flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 select-none overflow-hidden">
              {/* Top Controls: Reviewer & Photo index on left, Action buttons on right */}
              <div className="absolute top-3 sm:top-5 inset-x-3 sm:inset-x-6 z-30 flex items-center justify-between pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-md border border-white/10 shadow-lg">
                  {activePhoto.rating && (
                    <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                      {activePhoto.rating} <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                    </span>
                  )}
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">
                    {activePhoto.reviewerName || "Verified Guest"}
                  </span>
                  {allPhotos.length > 1 && (
                    <>
                      <span className="text-white/40">•</span>
                      <span className="text-white/80">
                        {activePhotoIndex + 1} of {allPhotos.length}
                      </span>
                    </>
                  )}
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/50 hover:bg-black/80 text-white/90 px-3 py-1.5 text-xs font-medium backdrop-blur-md transition border border-white/10 shadow-lg"
                    aria-label="Close photo preview"
                  >
                    Close photo
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/50 text-white/90 hover:text-white backdrop-blur-md transition hover:bg-black/80 hover:scale-105 active:scale-95 border border-white/10 shadow-lg"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Main Photo Center Container */}
              <div
                className="relative flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) handleCloseAll();
                }}
              >
                <PublicMediaImage
                  src={activePhoto.imageUrl}
                  srcSet={activePhoto.imageSrcSet}
                  alt={activePhoto.altText || `Review photo by ${activePhoto.reviewerName || "guest"}`}
                  sizes="(min-width: 1024px) 70vw, 100vw"
                  loading="eager"
                  className="max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-all duration-200"
                />

                {/* Prev & Next navigation buttons */}
                {allPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevPhoto}
                      aria-label="Previous photo"
                      className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/85 hover:scale-105 active:scale-95 shadow-xl border border-white/15"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPhoto}
                      aria-label="Next photo"
                      className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/85 hover:scale-105 active:scale-95 shadow-xl border border-white/15"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Right Review Sidebar */}
          <aside
            className={`relative h-full bg-white text-[var(--hk-navy)] shadow-2xl flex flex-col ${
              selectedPhoto && activePhoto
                ? "w-full lg:w-[480px] xl:w-[540px] shrink-0 min-h-0 border-t lg:border-t-0 lg:border-l border-slate-200 overflow-hidden"
                : "w-full max-w-[560px] ml-auto overflow-hidden hk-drawer-panel"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5 sm:p-6 pb-4 shrink-0">
              <h3 className="text-xl font-bold text-[var(--hk-navy)]">
                {totalCount} Guest {totalCount === 1 ? "Review" : "Reviews"}
              </h3>
              <button
                type="button"
                onClick={handleCloseAll}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-[var(--hk-navy)] transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content: Summary Card + Reviews List */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 pt-3 custom-scrollbar">
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
                  reviews.map((review) => (
                    <ReviewItem key={review.id} review={review} isModal />
                  ))
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
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
