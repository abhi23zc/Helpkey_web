"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Responsive right-side editing drawer.
 * - Mobile: full-width slide-over.
 * - Desktop: a fixed-width slide-over that keeps the underlying page visible.
 *
 * Handles backdrop click, Escape to close, and body scroll lock. The public
 * name stays `Drawer` so existing call sites are unaffected. Animations live in
 * globals.css (hk-drawer-panel / hk-overlay-fade).
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  badge,
  headerExtra,
  children,
  footer,
  spacious = false,
  contentClassName,
  closeOnOutsideClick = true,
}: {
  spacious?: boolean;
  contentClassName?: string;
  closeOnOutsideClick?: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Render only after hydration so the portal never touches the server DOM.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const dialog = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() =>
      dialog.current
        ?.querySelector<HTMLElement>("button, a[href], input, [tabindex='0']")
        ?.focus({ preventScroll: true }),
    );
    const onKey = (event: KeyboardEvent) => {
      // Native confirmation dialogs own keyboard navigation while open.
      if (document.querySelector("dialog:modal")) return;
      if (event.key === "Escape") {
        const popover =
          dialog.current?.querySelector<HTMLElement>(":popover-open");
        if (popover) {
          event.preventDefault();
          popover.hidePopover();
          return;
        }
        closeHandler.current();
      }
      if (event.key === "Tab") {
        const focusable = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex='0']",
          ) ?? []),
        ].filter((el) => el.getClientRects().length);
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      previousFocus?.focus({ preventScroll: true });
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const panelClass =
    "relative flex h-full max-h-screen min-w-0 w-full flex-col bg-[#fbfbf9] shadow-2xl hk-drawer-panel " +
    (spacious
      ? "sm:w-[88vw] md:w-[80vw] lg:w-[760px] xl:w-[860px] 2xl:w-[940px] max-w-full "
      : "sm:w-[540px] md:w-[580px] max-w-full ") +
    "sm:border-l sm:border-[#ede7dc]";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end overflow-hidden"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {closeOnOutsideClick ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-[#061224]/50 backdrop-blur-xs hk-overlay-fade transition-opacity"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#061224]/50 backdrop-blur-xs hk-overlay-fade transition-opacity"
        />
      )}

      <div className={panelClass}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ede7dc] bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-[#061224]">{title}</h2>
              {badge}
            </div>
            {description && (
              <p className="mt-0.5 break-words text-xs font-medium text-slate-500">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-[#061224] active:scale-95 transition-all"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${spacious ? "px-3 py-4 sm:px-6 sm:py-6" : "px-3 py-4 sm:px-5 sm:py-5"} ${contentClassName ?? ""}`}
        >
          {children}
        </div>

        {footer && (
          <footer className="max-h-[40dvh] shrink-0 overflow-y-auto border-t border-[#ede7dc] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
