"use client";

import { useState } from "react";

export function AppPromoWidget() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(true);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[var(--hk-navy-strong)] px-5 py-3 text-sm font-bold text-white shadow-2xl transition-transform hover:bg-[var(--hk-navy-panel)] hover:scale-105 active:scale-95"
      >
        <svg className="h-4 w-4 text-[var(--hk-gold-light)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span>Save more on App!</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[310px] sm:w-[340px] rounded-3xl border border-[rgba(196,198,206,0.7)] bg-white p-5 shadow-[0_20px_50px_rgba(11,31,58,0.22)] transition-all duration-300">
      {/* Close & Minimize buttons */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-[var(--hk-gold-strong)]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--hk-navy-strong)]">
            Save 10% Instant Discount
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize app offer"
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            _
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close app offer"
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-4 text-center">
        <h3 className="text-lg font-black tracking-tight text-[var(--hk-ink)]">
          Save 10% on your 1st app booking!
        </h3>
        <p className="mt-1 text-xs text-[var(--hk-muted)]">
          Just scan the QR code for instant savings &amp; secret rates.
        </p>

        {/* QR Code Phone Frame */}
        <div className="my-4 mx-auto relative flex h-48 w-40 flex-col items-center justify-center rounded-3xl border-4 border-slate-300 bg-slate-50 p-3 shadow-inner">
          <div className="absolute top-2.5 h-1.5 w-12 rounded-full bg-slate-300" />
          
          <div className="mb-2 mt-2 flex items-center gap-1 text-[10px] font-extrabold text-[var(--hk-navy-strong)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--hk-gold-strong)]" />
            <span>Helpkey App</span>
          </div>

          <div className="relative flex h-28 w-28 items-center justify-center rounded-xl bg-white p-2 shadow-sm border border-gray-200">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <rect x="0" y="0" width="100" height="100" fill="white" />
              <rect x="5" y="5" width="25" height="25" fill="#000615" />
              <rect x="10" y="10" width="15" height="15" fill="white" />
              <rect x="13" y="13" width="9" height="9" fill="#000615" />

              <rect x="70" y="5" width="25" height="25" fill="#000615" />
              <rect x="75" y="10" width="15" height="15" fill="white" />
              <rect x="78" y="13" width="9" height="9" fill="#000615" />

              <rect x="5" y="70" width="25" height="25" fill="#000615" />
              <rect x="10" y="75" width="15" height="15" fill="white" />
              <rect x="13" y="78" width="9" height="9" fill="#000615" />

              <rect x="35" y="10" width="8" height="8" fill="#141b2b" />
              <rect x="48" y="10" width="8" height="8" fill="#141b2b" />
              <rect x="35" y="25" width="8" height="8" fill="#785d1c" />
              <rect x="55" y="25" width="8" height="8" fill="#141b2b" />

              <rect x="10" y="40" width="8" height="8" fill="#141b2b" />
              <rect x="25" y="45" width="8" height="8" fill="#141b2b" />
              <rect x="40" y="40" width="8" height="8" fill="#785d1c" />
              <rect x="60" y="45" width="8" height="8" fill="#141b2b" />
              <rect x="80" y="40" width="8" height="8" fill="#785d1c" />

              <rect x="40" y="60" width="8" height="8" fill="#141b2b" />
              <rect x="60" y="60" width="8" height="8" fill="#141b2b" />
              <rect x="75" y="65" width="8" height="8" fill="#785d1c" />

              <rect x="35" y="75" width="8" height="8" fill="#141b2b" />
              <rect x="50" y="80" width="8" height="8" fill="#785d1c" />
              <rect x="70" y="75" width="8" height="8" fill="#141b2b" />
              <rect x="82" y="82" width="8" height="8" fill="#141b2b" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            className="w-full rounded-xl bg-[var(--hk-navy-strong)] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[var(--hk-navy-panel)] active:scale-95"
          >
            Get App Download Link
          </button>
        </div>
      </div>
    </div>
  );
}
