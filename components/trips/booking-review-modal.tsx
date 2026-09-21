"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { ImagePlus, Star, X } from "lucide-react";

export type BookingReview = {
  id: string;
  rating: number;
  text: string;
  status: "pending" | "approved" | "rejected";
  photoIds: string[];
  photos?: Array<{ id: string; url: string; fileName: string }>;
};

type Stay = {
  id: string;
  propertyId: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  review: BookingReview | null;
};

const stayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const reviewError = (message: string) => message === "COMPLETED_STAY_REQUIRED" ? "Only guests with a completed Helpkey stay at this property can leave a review." : message;

export function BookingReviewModal({ booking, onClose, onSaved }: { booking: Stay | null; onClose: () => void; onSaved: (propertyId: string, review: BookingReview) => void }) {
  if (!booking) return null;
  return <BookingReviewEditor key={booking.id} booking={booking} onClose={onClose} onSaved={onSaved} />;
}

function BookingReviewEditor({ booking, onClose, onSaved }: { booking: Stay; onClose: () => void; onSaved: (propertyId: string, review: BookingReview) => void }) {
  const [rating, setRating] = useState(booking.review?.rating ?? 5);
  const [text, setText] = useState(booking.review?.text ?? "");
  const [savedReview, setSavedReview] = useState<BookingReview | null>(booking.review);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);

  const review = savedReview ?? booking.review;

  const submit = async () => {
    if (text.trim().length < 10) {
      setError("Please write at least 10 characters about your stay.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(booking.propertyId)}`, { method: review ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, text }) });
      const data = await response.json() as { review?: BookingReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error ?? "Unable to save review.");
      setSavedReview(data.review);
      onSaved(booking.propertyId, data.review);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? reviewError(cause.message) : "Unable to save review.");
    } finally { setSaving(false); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!review) { setError("Save your review before adding photos."); return; }
    if (files.length > 5 - review.photoIds.length) { setError("You can attach up to five photos."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      let updatedReview = review;
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error("Photos must be JPEG, PNG, or WebP and 12 MB or smaller.");
        const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const begin = await fetch(`/api/reviews/${encodeURIComponent(booking.propertyId)}/photos/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum }) });
        const uploadData = await begin.json() as { uploadId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
        if (!begin.ok || !uploadData.uploadId || !uploadData.uploadUrl) throw new Error(uploadData.error ?? "Unable to start photo upload.");
        const put = await fetch(uploadData.uploadUrl, { method: "PUT", headers: uploadData.headers, body: file });
        if (!put.ok) throw new Error("Photo upload failed.");
        const finish = await fetch(`/api/reviews/${encodeURIComponent(booking.propertyId)}/photos/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: uploadData.uploadId }) });
        const finishData = await finish.json() as { photoId?: string; photo?: { id: string; url: string; fileName: string } | null; error?: string };
        if (!finish.ok || !finishData.photoId) throw new Error(finishData.error ?? "Unable to save photo.");
        updatedReview = { ...updatedReview, photoIds: [...updatedReview.photoIds, finishData.photoId], photos: finishData.photo ? [...(updatedReview.photos ?? []), finishData.photo] : updatedReview.photos };
        setSavedReview(updatedReview); onSaved(booking.propertyId, updatedReview);
      }
      setNotice("Photos added. They will appear as soon as processing finishes.");
    } catch (cause) { setError(cause instanceof Error ? reviewError(cause.message) : "Unable to upload photos."); }
    finally { setSaving(false); }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files);
  };

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#061224]/65 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="booking-review-title">
    <button type="button" aria-label="Close review form" className="absolute inset-0 cursor-default" onClick={onClose} />
    <section className="relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-5"><div><h2 id="booking-review-title" className="text-xl font-bold text-[#092442]">{review ? "Manage review" : "Rate your stay"}</h2><p className="mt-1 text-sm font-semibold text-[#092442]">{booking.propertyName}</p><p className="mt-1 text-xs text-slate-500">{stayDate(booking.checkIn)} – {stayDate(booking.checkOut)}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div>
      <div className="mt-6"><p className="text-sm font-bold text-[#092442]">Your rating</p><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className={`grid h-10 w-10 place-items-center rounded-xl border transition ${rating === value ? "border-[#092442] bg-[#092442] text-white" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}><Star className={`h-5 w-5 ${rating === value ? "fill-current" : ""}`} /></button>)}</div></div>
      <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={3000} placeholder="What did you enjoy? What could be better?" className="mt-5 min-h-32 w-full rounded-xl border border-slate-200 p-3.5 text-sm text-[#092442] outline-none focus:border-[#092442] focus:ring-1 focus:ring-[#092442]" />
      {review && <div className="mt-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#092442]">Your photos</p><span className="text-xs text-slate-500">{review.photoIds.length}/5</span></div><div className="mt-2 flex flex-wrap gap-2">{review.photos?.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" aria-label={`View ${photo.fileName}`} className="group h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><span role="img" aria-label={photo.fileName} className="block h-full w-full bg-cover bg-center transition group-hover:scale-105" style={{ backgroundImage: `url(${photo.url})` }} /></a>)}</div></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-xs font-bold transition ${dragging ? "border-[#092442] bg-[#eef2fa] text-[#092442]" : "border-slate-300 text-[#092442] hover:bg-slate-50"}`}><ImagePlus className="h-4 w-4" /><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => void upload(event.target.files)} />Drop photos or browse</label><button disabled={saving || text.trim().length < 10} onClick={() => void submit()} className="rounded-xl bg-[#092442] px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : review ? "Save changes" : "Publish review"}</button></div>
      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{error}</p>}{notice && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p>}<p className="mt-4 text-xs leading-relaxed text-slate-500">Your review is published directly for other guests to read.</p>
    </section>
  </div>;
}
