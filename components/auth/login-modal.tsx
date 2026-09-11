"use client";

import React, { useEffect } from "react";
import { AuthCard } from "@/components/auth/auth-card";

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Dimmed backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div className="relative z-10 w-full max-w-[440px] animate-in fade-in zoom-in-95 duration-200">
        <AuthCard
          mode="modal"
          initialTab="signin"
          onClose={onClose}
          onSuccess={onClose}
        />
      </div>
    </div>
  );
}
