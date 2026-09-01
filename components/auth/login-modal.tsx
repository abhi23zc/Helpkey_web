"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getFirebaseAuth,
  getGoogleProvider,
  signInWithCustomToken,
  signInWithPopup,
} from "@/lib/firebase/client";

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Step = "phone" | "otp" | "name";

type PendingSession = {
  idToken: string;
  fullName: string;
};

const EMPTY_OTP = ["", "", "", "", "", ""];

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [challengeId, setChallengeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  type SubmittingAction = "otp" | "google" | "verify" | "name" | null;
  const [submittingAction, setSubmittingAction] = useState<SubmittingAction>(null);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isOtpError, setIsOtpError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  function resetState() {
    setStep("phone");
    setPhone("");
    setChallengeId("");
    setFullName("");
    setPendingSession(null);
    setOtp(EMPTY_OTP);
    setIsOtpError(false);
    setShakeKey(0);
    setCanResend(false);
    setResendTimer(30);
    setSubmittingAction(null);
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);
  }

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const closeModal = () => {
    resetState();
    onClose();
  };

  const startTimer = () => {
    setResendTimer(30);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const normalizedPhone = `${countryCode}${phone}`;

  const createSession = async (idToken: string, name: string) => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, fullName: name }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      if (response.status === 422) {
        setPendingSession({ idToken, fullName: name });
        setFullName(name);
        setStep("name");
        return;
      }

      throw new Error(data.error ?? "Unable to create session.");
    }

    await refreshUser();
    closeModal();
  };

  const handleContinue = async () => {
    if (phone.trim().length < 6 || Boolean(submittingAction)) return;

    setSubmittingAction("otp");
    setError("");

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalizedPhone }),
      });
      const data = (await response.json()) as { challengeId?: string; error?: string };

      if (!response.ok || !data.challengeId) {
        throw new Error(data.error ?? "Unable to send OTP.");
      }

      setChallengeId(data.challengeId);
      setIsOtpError(false);
      setStep("otp");
      startTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send OTP.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6 || Boolean(submittingAction)) return;

    setSubmittingAction("verify");
    setError("");
    setIsOtpError(false);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: code }),
      });
      const data = (await response.json()) as { customToken?: string; error?: string };

      if (!response.ok || !data.customToken) {
        setIsOtpError(true);
        setShakeKey((prev) => prev + 1);
        return;
      }

      const credential = await signInWithCustomToken(getFirebaseAuth(), data.customToken);
      const idToken = await credential.user.getIdToken();
      await createSession(idToken, credential.user.displayName ?? "");
    } catch {
      setIsOtpError(true);
      setShakeKey((prev) => prev + 1);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Boolean(submittingAction)) return;

    setSubmittingAction("google");
    setError("");

    try {
      const credential = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      const idToken = await credential.user.getIdToken();
      const name = credential.user.displayName ?? "";

      await createSession(idToken, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue with Google.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleCompleteName = async () => {
    if (!pendingSession || fullName.trim().length < 2 || Boolean(submittingAction)) return;

    setSubmittingAction("name");
    setError("");

    try {
      await createSession(pendingSession.idToken, fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to finish sign in.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (isOtpError) setIsOtpError(false);
    const cleaned = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = cleaned;
    setOtp(next);
    if (cleaned && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isOtpError) setIsOtpError(false);
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    if (isOtpError) setIsOtpError(false);
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleBackToPhone = () => {
    setStep("phone");
    setOtp(EMPTY_OTP);
    setIsOtpError(false);
    setChallengeId("");
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={closeModal} />
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        {step === "phone" ? (
          <PhoneStep
            phone={phone}
            countryCode={countryCode}
            error={error}
            submittingAction={submittingAction}
            onPhoneChange={setPhone}
            onCountryCodeChange={setCountryCode}
            onContinue={handleContinue}
            onGoogleSignIn={handleGoogleSignIn}
            onClose={closeModal}
          />
        ) : step === "otp" ? (
          <OtpStep
            phone={`${countryCode} ${phone}`}
            otp={otp}
            otpRefs={otpRefs}
            canResend={canResend}
            resendTimer={resendTimer}
            isOtpError={isOtpError}
            shakeKey={shakeKey}
            submittingAction={submittingAction}
            onOtpChange={handleOtpChange}
            onOtpKeyDown={handleOtpKeyDown}
            onOtpPaste={handleOtpPaste}
            onVerify={handleVerifyOtp}
            onResend={() => {
              setOtp(EMPTY_OTP);
              setIsOtpError(false);
              void handleContinue();
              otpRefs.current[0]?.focus();
            }}
            onBack={handleBackToPhone}
            onClose={closeModal}
          />
        ) : (
          <NameStep
            fullName={fullName}
            error={error}
            submittingAction={submittingAction}
            onFullNameChange={setFullName}
            onContinue={handleCompleteName}
            onClose={closeModal}
          />
        )}
      </div>
    </div>
  );
}

const COUNTRY_CODES = [
  { flag: "🇮🇳", code: "+91" },
  { flag: "🇺🇸", code: "+1" },
  { flag: "🇬🇧", code: "+44" },
  { flag: "🇦🇺", code: "+61" },
  { flag: "🇩🇪", code: "+49" },
  { flag: "🇫🇷", code: "+33" },
  { flag: "🇦🇪", code: "+971" },
  { flag: "🇸🇬", code: "+65" },
  { flag: "🇯🇵", code: "+81" },
  { flag: "🇨🇦", code: "+1" },
];

function PhoneStep({
  phone,
  countryCode,
  error,
  submittingAction,
  onPhoneChange,
  onCountryCodeChange,
  onContinue,
  onGoogleSignIn,
  onClose,
}: {
  phone: string;
  countryCode: string;
  error: string;
  submittingAction: "otp" | "google" | "verify" | "name" | null;
  onPhoneChange: (v: string) => void;
  onCountryCodeChange: (v: string) => void;
  onContinue: () => void;
  onGoogleSignIn: () => void;
  onClose: () => void;
}) {
  const isValid = phone.trim().length >= 6;
  const isOtpSending = submittingAction === "otp";
  const isGoogleSigningIn = submittingAction === "google";

  return (
    <div className="px-8 pb-10 pt-8">
      <CloseButton onClose={onClose} />
      <div className="mb-6 flex justify-center">
        <HelpkeyIcon className="h-10 w-10" />
      </div>
      <h2 className="mb-7 text-center text-[22px] font-bold tracking-[-0.02em] text-[var(--hk-navy-strong)]">
        Log in or sign up
      </h2>
      <div className="mb-3 flex overflow-hidden rounded-[12px] border border-gray-300 transition-all focus-within:border-[var(--hk-navy-strong)] focus-within:ring-2 focus-within:ring-[rgba(11,31,58,0.1)]">
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          className="border-r border-gray-200 bg-transparent px-3 py-4 text-[14px] font-medium text-[var(--hk-ink)] outline-none"
        >
          {COUNTRY_CODES.map((c, i) => (
            <option key={`${c.code}-${i}`} value={c.code}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onContinue();
          }}
          placeholder="Phone number"
          className="flex-1 bg-transparent px-4 py-4 text-[15px] text-[var(--hk-ink)] outline-none placeholder:text-gray-400"
        />
      </div>
      <p className="mb-6 text-[13px] leading-5 text-[var(--hk-muted)]">
        We&apos;ll send your verification code on WhatsApp.{" "}
        <a href="#" className="font-semibold text-[var(--hk-ink)] underline underline-offset-2">
          Privacy Policy
        </a>
      </p>
      <ErrorMessage error={error} />
      <button
        onClick={onContinue}
        disabled={!isValid || Boolean(submittingAction)}
        className="mb-5 w-full rounded-[10px] bg-[var(--hk-navy-strong)] py-4 text-[15px] font-semibold text-white transition-all hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isOtpSending ? "Sending code..." : "Continue"}
      </button>
      <div className="mb-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[13px] text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={Boolean(submittingAction)}
        className="flex w-full items-center gap-4 rounded-[10px] border border-gray-300 px-5 py-3.5 text-[15px] font-semibold text-[var(--hk-ink)] transition-all hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-center">
          {isGoogleSigningIn ? "Signing in..." : "Continue with Google"}
        </span>
      </button>
    </div>
  );
}

function OtpStep({
  phone,
  otp,
  otpRefs,
  canResend,
  resendTimer,
  isOtpError,
  shakeKey,
  submitting,
  onOtpChange,
  onOtpKeyDown,
  onOtpPaste,
  onVerify,
  onResend,
  onBack,
  onClose,
}: {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  canResend: boolean;
  resendTimer: number;
  isOtpError: boolean;
  shakeKey: number;
  submitting: boolean;
  onOtpChange: (i: number, v: string) => void;
  onOtpKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOtpPaste: (e: React.ClipboardEvent) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const isComplete = otp.every((d) => d !== "");

  return (
    <div className="px-8 pb-10 pt-8">
      <button
        onClick={onBack}
        className="absolute left-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--hk-muted)] transition-colors hover:bg-gray-100"
      >
        <BackIcon className="h-4 w-4" />
      </button>
      <CloseButton onClose={onClose} />
      <h2 className="mb-2 mt-2 text-center text-[22px] font-bold tracking-[-0.02em] text-[var(--hk-navy-strong)]">
        Confirm it&apos;s you
      </h2>
      <p className="mb-8 text-center text-[14px] text-[var(--hk-muted)]">
        We sent a WhatsApp code to{" "}
        <span className="font-semibold text-[var(--hk-ink)]">{phone}</span>
      </p>
      <div
        key={shakeKey}
        className={`mb-5 flex justify-center gap-2.5 ${isOtpError ? "animate-shake" : ""}`}
        onPaste={onOtpPaste}
      >
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              otpRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onOtpChange(i, e.target.value)}
            onKeyDown={(e) => onOtpKeyDown(i, e)}
            className={`h-14 w-12 rounded-[10px] border-2 text-center text-[20px] font-bold outline-none transition-all ${
              isOtpError
                ? "border-red-500 bg-red-50 text-red-600 focus:border-red-500 focus:ring-4 focus:ring-red-100"
                : digit
                ? "border-[var(--hk-navy-strong)] bg-[var(--hk-primary-soft)] text-[var(--hk-navy-strong)]"
                : "border-gray-300 bg-white text-[var(--hk-navy-strong)] focus:border-[var(--hk-navy-strong)] focus:ring-2 focus:ring-[rgba(11,31,58,0.1)]"
            }`}
          />
        ))}
      </div>
      <div className="mb-8 text-center">
        {canResend ? (
          <button
            onClick={onResend}
            disabled={submitting}
            className="text-[14px] font-semibold text-[var(--hk-ink)] underline underline-offset-2 disabled:opacity-50"
          >
            Didn&apos;t get it? <span className="text-[var(--hk-navy-strong)]">Send a new code</span>
          </button>
        ) : (
          <p className="text-[14px] text-[var(--hk-muted)]">
            Didn&apos;t get it?{" "}
            <span className="font-semibold text-gray-400">Send a new code ({resendTimer}s)</span>
          </p>
        )}
      </div>
      <button
        onClick={onVerify}
        disabled={!isComplete || submitting}
        className="mb-4 w-full rounded-[10px] bg-[var(--hk-navy-strong)] py-4 text-[15px] font-semibold text-white transition-all hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Verifying..." : "Verify & Sign In"}
      </button>
      <button
        onClick={onBack}
        disabled={submitting}
        className="w-full rounded-[10px] border border-gray-200 bg-gray-50 py-4 text-[15px] font-semibold text-[var(--hk-ink)] transition-all hover:bg-gray-100 disabled:opacity-50"
      >
        Try another way
      </button>
    </div>
  );
}

function NameStep({
  fullName,
  error,
  submitting,
  onFullNameChange,
  onContinue,
  onClose,
}: {
  fullName: string;
  error: string;
  submitting: boolean;
  onFullNameChange: (v: string) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const isValid = fullName.trim().length >= 2;

  return (
    <div className="px-8 pb-10 pt-8">
      <CloseButton onClose={onClose} />
      <div className="mb-6 flex justify-center">
        <HelpkeyIcon className="h-10 w-10" />
      </div>
      <h2 className="mb-2 text-center text-[22px] font-bold tracking-[-0.02em] text-[var(--hk-navy-strong)]">
        Finish your profile
      </h2>
      <p className="mb-7 text-center text-[14px] text-[var(--hk-muted)]">
        Enter your full name to continue.
      </p>
      <input
        type="text"
        value={fullName}
        onChange={(e) => onFullNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onContinue();
        }}
        placeholder="Full name"
        className="mb-4 w-full rounded-[12px] border border-gray-300 px-4 py-4 text-[15px] text-[var(--hk-ink)] outline-none transition-all placeholder:text-gray-400 focus:border-[var(--hk-navy-strong)] focus:ring-2 focus:ring-[rgba(11,31,58,0.1)]"
      />
      <ErrorMessage error={error} />
      <button
        onClick={onContinue}
        disabled={!isValid || submitting}
        className="w-full rounded-[10px] bg-[var(--hk-navy-strong)] py-4 text-[15px] font-semibold text-white transition-all hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;

  return (
    <p className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
      {error}
    </p>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--hk-muted)] transition-colors hover:bg-gray-100"
    >
      <XIcon className="h-4 w-4" />
    </button>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19 12H5m0 0 7-7m-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HelpkeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <rect width="48" height="48" rx="14" fill="var(--hk-navy-strong)" />
      <path
        d="M29 18.5a9 9 0 1 1-17.26 3.5A9 9 0 0 1 29 18.5ZM29 18.5H43m-7 0v6.5m-6.5-6.5V25"
        stroke="var(--hk-gold)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="18.5" r="2.2" fill="var(--hk-gold)" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
