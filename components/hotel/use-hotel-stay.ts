"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizedStay, staySearchSchema, withStaySearch, type StaySearch } from "@/lib/customer/stay-search";
import { hotelStayDraft, nextHotelMode } from "@/lib/customer/hotel-stay";

export function useHotelStay(timezone: string) {
  const params = useSearchParams();
  const search = params.toString();
  const [draft, setDraft] = useState(() => hotelStayDraft(new URLSearchParams(search)));
  const [requested, setRequested] = useState<StaySearch | null>(() => {
    const parsed = staySearchSchema.safeParse(draft);
    return parsed.success ? parsed.data : null;
  });
  const draftRef = useRef(draft);
  const written = useRef(search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remembered = useRef<Partial<Record<"overnight" | "hourly", StaySearch>>>({});
  const cancel = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (written.current === search) return;
    written.current = search;
    const next = hotelStayDraft(new URLSearchParams(search));
    // Room selection changes the URL, not the stay or its debounce/deadline.
    if (JSON.stringify(normalizedStay(next)) === JSON.stringify(normalizedStay(draftRef.current))) return;
    cancel();
    draftRef.current = next;
    remembered.current = {};
    const parsed = staySearchSchema.safeParse(next);
    // External navigation restores inputs and query together; local edits bypass this path.
    setDraft(next);
    setRequested(parsed.success ? parsed.data : null);
  }, [search, cancel]);

  const update = useCallback((patch: Partial<StaySearch>, debounce = false) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    cancel();
    const parsed = staySearchSchema.safeParse(next);
    if (!parsed.success) { setRequested(null); return; }
    const previous = new URLSearchParams(window.location.search);
    const url = withStaySearch(previous, parsed.data);
    // Preserve a preference within a mode, never its old quoted total.
    if ((previous.get("bookingMode") ?? "overnight") === (next.bookingMode ?? "overnight")) {
      for (const key of ["roomTypeId", "ratePlanId", "room", "rate"]) {
        const value = previous.get(key);
        if (value) url.set(key, value);
      }
    }
    written.current = url.toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${url}${window.location.hash}`);
    if (debounce) timer.current = setTimeout(() => { timer.current = null; setRequested(parsed.data); }, 300);
    else setRequested(parsed.data);
  }, [cancel]);

  const switchMode = useCallback((mode: "overnight" | "hourly") => {
    const current = draftRef.current;
    if ((current.bookingMode ?? "overnight") === mode) return;
    remembered.current[current.bookingMode ?? "overnight"] = current;
    const next = nextHotelMode(current, mode, remembered.current[mode] ?? {}, timezone);
    update({ ...next, checkOut: next.checkOut, arrivalTime: next.arrivalTime, durationMinutes: next.durationMinutes });
  }, [timezone, update]);
  const stay = useMemo(() => {
    const parsed = staySearchSchema.safeParse(draft);
    return parsed.success ? parsed.data : null;
  }, [draft]);
  const pending = !!stay && JSON.stringify(normalizedStay(stay)) !== JSON.stringify(normalizedStay(requested));
  return { draft, stay, requested, pending, update, switchMode };
}
