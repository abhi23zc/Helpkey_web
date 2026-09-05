"use client";

import { useEffect } from "react";
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
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelClass =
    "relative flex h-full w-full max-w-full flex-col bg-white shadow-2xl hk-drawer-panel " +
    "sm:w-[560px] sm:max-w-[92vw] sm:border-l sm:border-slate-200";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] hk-overlay-fade"
      />

      <div className={panelClass}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#061224]">{title}</h2>
            {description && <p className="mt-0.5 text-xs font-medium text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && <footer className="border-t border-slate-100 px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
