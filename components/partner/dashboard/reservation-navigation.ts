"use client";
import { useEffect, useRef } from "react";
export const workspaceTabs = [
  "overview",
  "billing",
  "payments",
  "guests",
  "activity",
] as const;
export type WorkspaceTab = typeof workspaceTabs[number];

export const workspaceSections = [
  "overview",
  "summary",
  "guests",
  "assignment",
  "billing",
  "payments",
  "requests",
  "activity",
] as const;
export type WorkspaceSection = typeof workspaceSections[number];

export function toWorkspaceTab(raw: string | null): WorkspaceTab {
  if (!raw) return "overview";
  if (raw === "billing") return "billing";
  if (raw === "payments") return "payments";
  if (raw === "guests") return "guests";
  if (raw === "activity") return "activity";
  return "overview";
}

export function workspaceSection(raw: string | null): WorkspaceTab {
  return toWorkspaceTab(raw);
}

export function reservationUrl(
  current: string,
  propertyId: string,
  bookingId: string,
  section: WorkspaceSection | WorkspaceTab = "overview",
) {
  const url = new URL(current, "http://helpkey.local");
  if (!["/partner/dashboard", "/partner/reservations", "/partner/rooms"].includes(url.pathname)) {
    url.pathname = "/partner/reservations"; url.search = "";
  }
  url.searchParams.set("propertyId", propertyId);
  url.searchParams.set("bookingId", bookingId);
  url.searchParams.set("section", section);
  return `${url.pathname}${url.search}`;
}
/** Protect same-document history, Next links, hotel selection, and browser back. */
export function useReservationNavigationGuard(active: boolean, allow: () => boolean) {
  const latestAllow = useRef(allow);
  useEffect(() => { latestAllow.current = allow; }, [allow]);
  useEffect(() => {
    if (!active) return;
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    let currentUrl = window.location.href;
    let position = 0;
    let restoring = false;
    originalReplace({ ...window.history.state, reservationPosition: position }, "", currentUrl);
    const changesSelection = (target: string) => {
      const previous = new URL(currentUrl), next = new URL(target, currentUrl);
      return previous.pathname !== next.pathname || ["propertyId", "bookingId"].some(k => previous.searchParams.get(k) !== next.searchParams.get(k));
    };
    const push: History["pushState"] = (state, unused, url) => {
      if (url && changesSelection(String(url)) && !latestAllow.current()) return;
      position += 1;
      originalPush({ ...state, reservationPosition: position }, unused, url);
      currentUrl = window.location.href;
    };
    const replace: History["replaceState"] = (state, unused, url) => {
      if (url && changesSelection(String(url)) && !latestAllow.current()) return;
      originalReplace({ ...state, reservationPosition: position }, unused, url);
      currentUrl = window.location.href;
    };
    window.history.pushState = push;
    window.history.replaceState = replace;
    const back = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const nextPosition = event.state?.reservationPosition;
      if (changesSelection(window.location.href) && !latestAllow.current()) {
        event.stopImmediatePropagation();
        if (typeof nextPosition === "number" && nextPosition !== position) {
          restoring = true; window.history.go(position - nextPosition);
        } else originalPush({ ...window.history.state, reservationPosition: position }, "", currentUrl);
      } else { position = typeof nextPosition === "number" ? nextPosition : position - 1; currentUrl = window.location.href; }
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (anchor && changesSelection(anchor.href) && !latestAllow.current()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("popstate", back, true);
    document.addEventListener("click", click, true);
    return () => {
      if (window.history.pushState === push) window.history.pushState = originalPush;
      if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", back, true);
      document.removeEventListener("click", click, true);
    };
  }, [active]);
}
