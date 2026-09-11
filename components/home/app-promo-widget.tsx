"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, ChevronRight, Smartphone, MapPin } from "lucide-react";

export function AppPromoWidget() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#0b1f3a] px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-[0_8px_25px_rgba(11,31,58,0.4)] ring-1 ring-amber-400/40 transition-transform hover:scale-105 hover:bg-[#061224]"
      >
        <Smartphone className="h-4 w-4 text-amber-400" />
        <span>Save 10% on App!</span>
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[260px] sm:w-[275px]">
      {/* Outer Wrapper for White Card + Bottom Floating Close Button */}
      <div className="flex flex-col">
        {/* Main White Card Container */}
        <div className="relative overflow-hidden rounded-[20px] bg-white p-4.5 pb-0 pt-5 text-center shadow-[0_10px_35px_rgba(0,0,0,0.16)]">
          {/* Subtle World Map Dot Matrix Pattern Background */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.08]" 
            style={{
              backgroundImage: `radial-gradient(#0b1f3a 1.2px, transparent 1.2px)`,
              backgroundSize: '12px 12px'
            }} 
          />



          {/* Main Headline */}
          <h3 className="relative z-10 text-[16px] sm:text-[17px] font-bold tracking-tight text-[#222831] leading-tight">
            Save 10% on your 1st app booking!
          </h3>

          {/* Subtitle */}
          <p className="relative z-10 mt-1 text-[11px] sm:text-xs text-[#535b66] font-normal leading-normal">
            Just scan the QR code for instant savings
          </p>

          {/* Premium Device Bezel Frame (Agoda Style) */}
          <div className="relative z-10 mx-auto mt-3.5 w-[180px] overflow-hidden rounded-t-[30px] border-[3px] border-[#9ba9bf] border-b-0 bg-white pt-0 px-2.5 shadow-xs">
            {/* Flush Phone Top Notch */}
            <div className="mx-auto mb-2.5 h-2.5 w-20 rounded-b-lg bg-[#9ba9bf]" />

            {/* Phone Screen Content */}
            <div className="flex flex-col items-center pb-1">
              {/* Helpkey Brand Logo + Colored Dots */}
              <div className="mb-2 flex flex-col items-center">
                <span className="text-[13px] font-extrabold tracking-tight text-[#222831] font-sans">
                  helpkey
                </span>
                <div className="mt-0.5 flex items-center justify-center gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-[#ff4b4b]" />
                  <span className="h-1 w-1 rounded-full bg-[#f59e0b]" />
                  <span className="h-1 w-1 rounded-full bg-[#10b981]" />
                  <span className="h-1 w-1 rounded-full bg-[#8b5cf6]" />
                  <span className="h-1 w-1 rounded-full bg-[#3b82f6]" />
                </div>
              </div>

              {/* Scannable Vector QR Code */}
              <div className="relative flex items-center justify-center bg-white p-1">
                <QRCodeSVG
                  value="https://helpkey.in/download-app?utm_source=agoda_promo"
                  size={115}
                  bgColor="#ffffff"
                  fgColor="#222831"
                  level="H"
                />
              </div>
            </div>
          </div>

          {/* Speech Bubble Pointer Triangle at Bottom Right of White Card */}
          <div className="absolute -bottom-2 right-[20px] h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white z-20" />
        </div>

        {/* Bottom Floating Deep Navy Close Button (Right Aligned under Speech Bubble Tail) */}
        <div className="mt-2 flex justify-end pr-1.5">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close promotion"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b1f3a] text-white shadow-[0_5px_15px_rgba(11,31,58,0.4)] ring-1 ring-white/20 hover:bg-[#061224]"
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

