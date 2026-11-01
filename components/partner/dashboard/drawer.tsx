"use client";

import { useEffect, useRef } from "react";
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
}: {
  spacious?: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
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
        ?.focus(),
    );
    const onKey = (event: KeyboardEvent) => {
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
      previousFocus?.focus();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const panelClass =
    "relative flex h-full w-full max-w-full flex-col bg-[#fbfbf9] shadow-2xl hk-drawer-panel " +
    (spacious ? "sm:w-[640px] lg:w-[680px] " : "sm:w-[580px] ") +
    "sm:max-w-[94vw] sm:border-l sm:border-[#ede7dc]";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#061224]/50 backdrop-blur-xs hk-overlay-fade transition-opacity"
      />

      <div className={panelClass}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#ede7dc] bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-[#061224]">{title}</h2>
              {badge}
            </div>
            {description && (
              <p className="mt-0.5 text-xs font-semibold text-[#8b96aa]">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[#8b96aa] hover:bg-[#f0ece6] hover:text-[#061224] transition-colors"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          className={`min-h-0 flex-1 overflow-y-auto ${spacious ? "px-6 py-6" : "px-5 py-5"}`}
        >
          {children}
        </div>

        {footer && (
          <footer className="max-h-[50dvh] shrink-0 overflow-y-auto border-t border-[#ede7dc] bg-white px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
